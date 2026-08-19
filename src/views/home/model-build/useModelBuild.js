import { computed, ref, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useSchedulingStore } from '@/stores/scheduling'
import { useStepNav, STEP_ROUTES } from '../useStepNav'
import { MODEL_BUILD_DEFAULTS } from './modelBuildDefaults'
import {
  startSolveTask,
  getSolveTask,
  getSolveTaskLogs,
  stopSolveTask,
  getTaskDetailFilterOptions,
  matchCheckSolve,
} from '@/api/scheduling'

export function useModelBuild() {
  const router = useRouter()
  const schedulingStore = useSchedulingStore()
  const { handlePrev, handleNext, canNext, notifyNextDisabled } = useStepNav()

  // 求解中锁定模型构建页输入（仅 running 时锁定，stopped/done 可编辑）
  const isModelBuildLocked = computed(() => schedulingStore.solveStatus === 'running')

  // 按钮文案：idle 开始求解 / stopped 重新求解 / running 查看求解 / done 已进行求解
  const solveBtnText = computed(() => {
    const status = schedulingStore.solveStatus
    if (status === 'idle') return '开始求解'
    if (status === 'stopped') return '开始求解'
    if (status === 'running') return '查看求解'
    return '已进行求解' // done
  })

  // 是否允许开始求解：running/done 直接放行跳转；其余状态需所有必填项有效且无时间规则冲突
  const canStartSolve = computed(() => {
    if (solvingLoading.value) return false
    if (schedulingStore.solveStatus === 'running' || schedulingStore.solveStatus === 'done')
      return true
    return !hasRequiredFieldError.value && !hasTimeRuleError.value
  })

  // 最小时间间隔（单位毫秒），默认30分钟，若后端返回了最大生产时间则使用该值
  const MIN_INTERVAL_MS = computed(() => (schedulingStore.maxProducTime ?? 30) * 60 * 1000)

  // 规则一：交期不能早于订单加工开始时间
  const hasDeadlineDateError = computed(() => {
    if (!schedulingStore.earliestStartTime || !schedulingStore.deadlineDate) return false
    const start = new Date(schedulingStore.earliestStartTime).getTime()
    const deadline = new Date(schedulingStore.deadlineDate).getTime()
    if (isNaN(start) || isNaN(deadline)) return false
    return deadline < start
  })

  // 规则二：交期晚于开始时间，但间隔不足30分钟（与规则一互斥）
  const hasIntervalError = computed(() => {
    if (!schedulingStore.earliestStartTime || !schedulingStore.deadlineDate) return false
    const start = new Date(schedulingStore.earliestStartTime).getTime()
    const deadline = new Date(schedulingStore.deadlineDate).getTime()
    if (isNaN(start) || isNaN(deadline)) return false
    return deadline >= start && deadline - start < MIN_INTERVAL_MS.value
  })

  // 合并两条时间规则，供按钮禁用等逻辑使用
  const hasTimeRuleError = computed(() => hasDeadlineDateError.value || hasIntervalError.value)

  // 部门下拉选项：从后端 /task/detailFilterOptions 接口按 taskId 动态获取任务「部门」列去重值
  const remoteDepartmentOptions = ref([])
  const departmentOptionsLoading = ref(false)

  // 兜底：从任务数据的「部门」列（上传 Excel 解析而来）去重提取，接口未就绪 / 返回为空时使用
  const localDepartmentOptions = computed(() => {
    const rows = schedulingStore.sheetDataMap['任务数据']?.rows || []
    const set = new Set()
    rows.forEach((row) => {
      const dept = row?.department
      if (dept) set.add(String(dept).trim())
    })
    return Array.from(set)
  })

  // 导出给模板的选项：优先用后端数据，为空时回退到本地提取值
  const departmentOptions = computed(() =>
    remoteDepartmentOptions.value.length > 0
      ? remoteDepartmentOptions.value
      : localDepartmentOptions.value,
  )

  // 部门选项请求序号：用于丢弃连续切换任务时过期的并发响应，避免旧任务部门选项覆盖新任务
  let departmentOptionsSeq = 0

  /**
   * 拉取部门下拉选项
   * taskId 兼容上传与历史导入两种来源；接口异常 / 返回为空时回退到本地提取的部门值
   */
  async function fetchDepartmentOptions() {
    const taskId = schedulingStore.taskInfo?.taskId ?? schedulingStore.taskInfo?.importId
    if (!taskId) {
      remoteDepartmentOptions.value = []
      return
    }
    // 发起新请求前先清空旧选项，避免切换任务后短暂残留上一任务的部门列表
    remoteDepartmentOptions.value = []
    departmentOptionsLoading.value = true
    // 请求序号：仅应用最后一次发起的响应，防止旧响应晚到覆盖新结果
    const seq = ++departmentOptionsSeq
    try {
      // 新接口为 POST，请求体需包含三个筛选的当前值；本页只需部门选项，未选时传空数组表示不限制
      const res = await getTaskDetailFilterOptions({
        taskId,
        option: 'departmentNames',
        departmentNames: [],
        monthlyProductionPlans: [],
        inventoryNames: [],
      })
      // 若期间又发起了新的拉取，丢弃本次结果，避免旧数据覆盖新数据
      if (seq !== departmentOptionsSeq) return
      // 兼容 { data: [...] } 与 { data: { data: [...] } } 两种返回结构
      const arr = res?.data?.data ?? res?.data
      remoteDepartmentOptions.value = Array.isArray(arr) ? arr : []
    } catch (err) {
      // 仅当仍是最新请求时才清空，防止过期请求的错误响应干扰当前请求；接口异常自动回退到本地提取值
      if (seq !== departmentOptionsSeq) return
      remoteDepartmentOptions.value = []
    } finally {
      // 仅最新请求负责关闭 loading，过期请求的 finally 不干扰新请求的 loading 状态
      if (seq === departmentOptionsSeq) {
        departmentOptionsLoading.value = false
      }
    }
  }

  // 任务信息（taskId）变化时重新拉取部门选项，覆盖上传 / 历史导入 / 刷新恢复等场景
  watch(
    () => schedulingStore.taskInfo?.taskId ?? schedulingStore.taskInfo?.importId,
    () => fetchDepartmentOptions(),
    { immediate: true },
  )

  // ===== 必填项实时校验 =====
  // 单个字段有效性：字符串需非空，数值需为有效数字（null/undefined/NaN 视为无效）
  function isRequiredFieldValid(value) {
    if (value === null || value === undefined) return false
    if (typeof value === 'number') return !Number.isNaN(value)
    if (typeof value === 'string') return value.trim() !== ''
    return false
  }

  // 必填字段校验规则（标签与页面展示一致，用于实时校验与缺失提示）
  const REQUIRED_FIELD_CHECKS = [
    { label: '部门', value: () => schedulingStore.selectedDepartment },
    { label: '排产月份', value: () => schedulingStore.productionMonth },
    { label: '连续运行上限', value: () => schedulingStore.continuousRunLimit },
    { label: '大清场', value: () => schedulingStore.cleaningTimeLarge },
    { label: '小清场', value: () => schedulingStore.cleaningTimeSmall },
    { label: '定期清场', value: () => schedulingStore.cleaningTimeRegular },
    { label: '班次换算-天数', value: () => schedulingStore.shiftDays },
    { label: '班次换算-班时', value: () => schedulingStore.shiftHours },
    { label: '配料用人', value: () => schedulingStore.morningShiftCapacity?.['配料'] },
    { label: '压片用人', value: () => schedulingStore.morningShiftCapacity?.['压片'] },
    { label: '包衣用人', value: () => schedulingStore.morningShiftCapacity?.['包衣'] },
    { label: '包装用人', value: () => schedulingStore.morningShiftCapacity?.['包装'] },
    { label: '最大求解时间', value: () => schedulingStore.maxSolveTime },
  ]

  // 当前缺失或无效的必填字段标签列表（响应式实时计算）
  const missingRequiredFields = computed(() =>
    REQUIRED_FIELD_CHECKS.filter(({ value }) => !isRequiredFieldValid(value())).map(
      ({ label }) => label,
    ),
  )

  // 是否存在必填项缺失或无效
  const hasRequiredFieldError = computed(() => missingRequiredFields.value.length > 0)

  // 新增的优先级选项数据（对应设计稿中的 5 个卡片）
  const priorityOptions = [
    { label: '均衡考虑', desc: 'A的权重与B相等', value: 0 },
    { label: '优先考虑 A', desc: 'A的权重远大于B', value: 1 },
    { label: '优先考虑 B', desc: 'B的权重远大于A', value: 2 },
    { label: '仅考虑 A', desc: '仅考虑交期延误最小', value: 3 },
    { label: '仅考虑 B', desc: '仅考虑设备空闲时间最小', value: 4 },
  ]

  // 设置默认选中第一项
  if (schedulingStore.priority === undefined || schedulingStore.priority === null) {
    schedulingStore.priority = 0
  }

  // 校验部门选择与排产月份初始状态必须为空：
  // 若有持久化残留等非空值，强制置空，确保用户必须手动选择、不自动填充任何默认值
  function ensureRequiredSelectsEmpty() {
    if (schedulingStore.selectedDepartment || schedulingStore.productionMonth) {
      schedulingStore.selectedDepartment = ''
      schedulingStore.productionMonth = null
      console.warn('[model-build] 部门/排产月份初始值校验未通过，已强制置空')
    }
  }

  // 进入模型构建页时自动重置排产时间默认值
  // 仅 idle（首次进入）和 done（已完成）时重置；stopped 保留用户设置以便二次修改
  onMounted(() => {
    if (schedulingStore.solveStatus === 'idle' || schedulingStore.solveStatus === 'done') {
      schedulingStore.resetScheduleDefaults()
      // 页面加载后立即校验：部门与排产月份初始状态必须为空
      ensureRequiredSelectsEmpty()
    }
  })

  // 开始求解按钮 loading 状态（防止重复点击）
  const solvingLoading = ref(false)

  // 按钮原生禁用：仅在提交过程中防止重复点击
  // 校验未通过时不启用原生禁用，保留可点击状态以给出友好提示（视觉置灰由 canStartSolve 控制）
  const isSolveBtnDisabled = computed(() => solvingLoading.value)

  // 数据匹配校验弹窗显隐与数据（来自 /solve/matchCheck 接口，分页查询未匹配记录）
  const matchCheckVisible = ref(false)
  const matchCheckData = ref({
    status: true, // false 表示存在未匹配记录，需弹窗提示
    total: 0, // 未匹配记录总条数
    records: [], // 当前页未匹配记录（对应接口 missingData）
  })
  const matchCheckLoading = ref(false)

  // —— 未匹配记录分页（每页固定 10 条，与接口 pageSize 保持一致）——
  const matchPageSize = 10
  const matchCurrentPage = ref(1)
  const matchTotalRows = ref(0)
  const matchJumpPage = ref('')

  // 打开数据匹配校验弹窗：重置分页并拉取未匹配记录第一页
  async function openMatchCheckDialog() {
    matchCheckVisible.value = true
    matchCurrentPage.value = 1
    matchJumpPage.value = ''
    await fetchMatchCheckPage(1)
  }

  // 分页拉取未匹配记录：按接口返回的 missingData 渲染当前页
  async function fetchMatchCheckPage(page) {
    const taskId = schedulingStore.taskInfo?.taskId ?? schedulingStore.taskInfo?.importId
    if (!taskId) return
    matchCheckLoading.value = true
    try {
      const res = await matchCheckSolve({ taskId, page, pageSize: matchPageSize })
      const data = res?.data?.data
      if (data) {
        matchCheckData.value.status = data.status !== false
        matchCheckData.value.total = data.total ?? 0
        matchCheckData.value.records = Array.isArray(data.missingData) ? data.missingData : []
        matchTotalRows.value = data.total ?? 0
      }
    } catch {
      ElMessage.error('未匹配记录查询失败')
    } finally {
      matchCheckLoading.value = false
    }
  }

  // 弹窗内切换页码：重新请求对应页数据
  async function handleMatchPageChange(page) {
    await fetchMatchCheckPage(page)
  }

  // 关闭数据匹配校验弹窗
  function closeMatchCheckDialog() {
    matchCheckVisible.value = false
  }

  // 当前页未匹配记录：不足 pageSize 时用占位行补齐，保证表格高度恒定
  const matchPagedRows = computed(() => {
    const rows = matchCheckData.value.records
    const fillCount = matchPageSize - rows.length
    if (fillCount > 0) {
      // 占位行：_isPlaceholder 标记用于样式区分（隐藏文字但保留行高）
      const fillers = Array.from({ length: fillCount }, () => ({ _isPlaceholder: true }))
      return [...rows, ...fillers]
    }
    return rows
  })

  // 行 class：占位行应用 row-placeholder 类，用于 CSS 隐藏文字但保留行高
  function matchRowClassName({ row }) {
    if (row && row._isPlaceholder) return 'row-placeholder'
    return ''
  }

  // 未匹配记录页面跳转：越界时自动收敛到首尾页，并触发对应页数据拉取
  function handleMatchJump() {
    const page = Number(matchJumpPage.value)
    // 非法输入（非数字 / 小于 1）时忽略
    if (!page || page < 1) {
      matchJumpPage.value = ''
      return
    }
    const maxPage = Math.max(1, Math.ceil(matchTotalRows.value / matchPageSize))
    matchCurrentPage.value = Math.min(page, maxPage)
    matchJumpPage.value = ''
    fetchMatchCheckPage(matchCurrentPage.value)
  }

  async function handleStartSolve(policy = 'SKIP', skipMatchCheck = false) {
    const status = schedulingStore.solveStatus

    // running（求解中）和 done（已完成）：直接跳转查看，不触发提交
    if (status === 'running' || status === 'done') {
      router.push(STEP_ROUTES[3])
      return
    }

    // idle / stopped：走完整提交流程

    // 校验必填项：存在缺失或无效项时，列出具体字段引导用户完善
    if (hasRequiredFieldError.value) {
      ElMessage.warning(`请先完善以下必填项：${missingRequiredFields.value.join('、')}`)
      return
    }

    // 校验排产时间规则（交期相关，页面默认有效，保留兜底）
    if (hasTimeRuleError.value) {
      if (hasDeadlineDateError.value) {
        ElMessage.error('订单不确定性交期不能早于订单加工开始时间')
      } else if (hasIntervalError.value) {
        ElMessage.error('时间过短，无法满足排产需求')
      }
      return
    }

    // idle / stopped：校验前置条件
    if (!canNext.value) {
      notifyNextDisabled()
      return
    }

    // 获取任务 ID（由 /task/import 或 /tasks/historyImport 返回），兼容 taskId / importId 两种来源
    const taskId = schedulingStore.taskInfo?.taskId ?? schedulingStore.taskInfo?.importId
    if (!taskId) {
      ElMessage.warning('未获取到任务ID，请重新上传文件')
      return
    }

    // 数据匹配预校验：调用 /solve/matchCheck 查询是否存在未匹配 APS 档案的记录
    // 存在未匹配记录时弹窗让用户选择 取消/跳过/前往档案；
    // "继续求解（跳过缺失项）" 会携带 skipMatchCheck 跳过此预校验，避免弹窗循环
    if (!skipMatchCheck) {
      solvingLoading.value = true
      try {
        // 仅需判断是否存在未匹配记录，pageSize 传 1 轻量探测
        const matchRes = await matchCheckSolve({ taskId, page: 1, pageSize: 1 })
        const matchData = matchRes?.data?.data
        if (matchData && (matchData.total ?? 0) > 0) {
          await openMatchCheckDialog()
          return
        }
      } catch {
        // 预校验接口异常不阻塞求解流程，放行由后端在 start 时兜底
      } finally {
        solvingLoading.value = false
      }
    }

    // 人员容量中文键 → 英文键映射（与接口 personnelCapacity 字段对齐）
    const CAPACITY_KEY_MAP = {
      配料: 'mixing',
      压片: 'tableting',
      包衣: 'coating',
      包装: 'packaging',
    }
    function mapCapacityKeys(capacity) {
      const result = {}
      for (const [key, value] of Object.entries(capacity || {})) {
        result[CAPACITY_KEY_MAP[key] || key] = value
      }
      return result
    }

    // 按后端接口参考体（message/solve.txt）组装 POST /solve/start 请求体：
    // taskId + department 必传，personnelCapacity 为扁平结构，需携带 unmatchedItemPolicy
    const payload = {
      taskId,
      department: schedulingStore.selectedDepartment,
      scheduleMonth: schedulingStore.productionMonth,
      unmatchedItemPolicy: policy,
      productionRules: {
        continuousRunLimitDays: schedulingStore.continuousRunLimit,
        cleaningDuration: {
          majorCleaningDays: schedulingStore.cleaningTimeLarge,
          minorCleaningDays: schedulingStore.cleaningTimeSmall,
          periodicCleaningDays: schedulingStore.cleaningTimeRegular,
        },
        shiftConversion: {
          naturalDays: schedulingStore.shiftDays,
          shiftCount: schedulingStore.shiftHours,
        },
      },
      personnelCapacity: mapCapacityKeys(schedulingStore.morningShiftCapacity),
      solverTimeLimitMinutes: Math.round(Number(schedulingStore.maxSolveTime) / 60),
    }

    // 调用后端 API 提交求解
    try {
      const res = await startSolveTask(payload)
      const result = res?.data
      if (result?.success || result?.code === 202) {
        // 保存后端返回的求解任务信息
        if (result?.data) {
          schedulingStore.solveInfo = result.data
        }
        // 启动求解状态跟踪（设置 running 状态并启动轮询和计时器）
        schedulingStore.startSolve()

        // 2 秒后调用 logs 接口获取初始日志并渲染到页面
        const solveTaskId = result.data?.solveTaskId || schedulingStore.solveInfo?.solveTaskId
        if (solveTaskId) {
          setTimeout(async () => {
            try {
              const logsRes = await getSolveTaskLogs({ solveTaskId, afterLogId: 0 })
              const logs = logsRes?.data?.data
              if (logsRes?.data?.success && Array.isArray(logs) && logs.length > 0) {
                // 用后端最新日志覆盖后端日志内容，前端日志（如"求解任务已启动"）保留在前端前缀日志中
                schedulingStore.backendLogs = logs.map((log) => ({
                  time: log.createTime ? log.createTime.slice(11, 19) : '',
                  message: log.logContent || '',
                }))
              }
            } catch {
              // 初始日志查询失败不影响后续，轮询会自动恢复
            }
          }, 2000)
        }

        // 跳转到模型求解页
        await handleNext()
      } else {
        ElMessage.error(result?.message || '提交求解失败')
        solvingLoading.value = false
      }
    } catch (error) {
      const errStatus = error?.response?.status
      const errData = error?.response?.data
      if (errStatus === 409) {
        // 409：当前任务已有正在执行的求解任务，提示用户勿重复提交
        // （未匹配 APS 档案记录的校验已改为提交前调用 /solve/matchCheck 预校验）
        ElMessage.warning(errData?.message || '当前任务正在求解，请勿重复提交')
        solvingLoading.value = false
      } else if (errStatus === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
        solvingLoading.value = false
      } else if (errStatus === 500) {
        ElMessage.error('算法服务调用失败，请稍后重试')
        solvingLoading.value = false
      } else {
        ElMessage.error(errData?.message || error?.message || '提交求解失败')
        solvingLoading.value = false
      }
    }
  }

  // 弹窗中点击「继续求解（跳过缺失项）」：关闭弹窗并以 SKIP 策略重新提交
  async function handleContinueSolveSkip() {
    closeMatchCheckDialog()
    solvingLoading.value = true
    try {
      // 跳过匹配预校验，直接以 SKIP 策略提交（未匹配记录不参与本次求解）
      await handleStartSolve('SKIP', true)
    } finally {
      solvingLoading.value = false
    }
  }

  // 弹窗中点击「前往APS排产信息档案」：关闭弹窗并跳转档案页
  function handleGoToApsArchive() {
    closeMatchCheckDialog()
    // 记录来源工作流页面，供档案页"新建任务"标签返回原页面
    schedulingStore.setApsOrigin(router.currentRoute.value.path)
    router.push('/aps-archive')
  }

  // 排产月份显示（YYYY-MM → YYYY年MM月）
  const productionMonthText = computed(() => {
    const val = schedulingStore.productionMonth
    if (!val) return ''
    const [year, month] = String(val).split('-')
    if (!year || !month) return val
    return `${year}年${month}月`
  })

  // 恢复页面默认参数：填入集中管理的默认值，其余参数字段清空
  // 默认值统一在 modelBuildDefaults.js 中维护，修改即可生效
  function handleResetDefaults() {
    // —— 生产规则配置 ——
    schedulingStore.continuousRunLimit = MODEL_BUILD_DEFAULTS.continuousRunLimit
    schedulingStore.cleaningTimeLarge = MODEL_BUILD_DEFAULTS.cleaningTimeLarge
    schedulingStore.cleaningTimeSmall = MODEL_BUILD_DEFAULTS.cleaningTimeSmall
    schedulingStore.cleaningTimeRegular = MODEL_BUILD_DEFAULTS.cleaningTimeRegular
    // —— 班次换算配置 ——
    schedulingStore.shiftDays = MODEL_BUILD_DEFAULTS.shiftDays
    schedulingStore.shiftHours = MODEL_BUILD_DEFAULTS.shiftHours
    // —— 人员容量配置（早班）——
    schedulingStore.morningShiftCapacity = { ...MODEL_BUILD_DEFAULTS.morningShiftCapacity }
    // —— 算法求解时长配置 ——
    schedulingStore.maxSolveTime = MODEL_BUILD_DEFAULTS.maxSolveTime
    // —— 其余参数字段清空（排产月份、部门）——
    schedulingStore.productionMonth = null
    schedulingStore.selectedDepartment = ''
    ElMessage.success('已恢复默认参数')
  }

  return {
    schedulingStore,
    isModelBuildLocked,
    solveBtnText,
    canStartSolve,
    departmentOptions,
    departmentOptionsLoading,
    hasDeadlineDateError,
    hasIntervalError,
    hasTimeRuleError,
    isSolveBtnDisabled,
    priorityOptions,
    solvingLoading,
    // 新结构展示辅助
    productionMonthText,
    // 数据匹配校验弹窗
    matchCheckVisible,
    matchCheckData,
    matchCheckLoading,
    // 未匹配记录分页
    matchPagedRows,
    matchRowClassName,
    matchPageSize,
    matchCurrentPage,
    matchTotalRows,
    matchJumpPage,
    handleMatchJump,
    handleMatchPageChange,
    closeMatchCheckDialog,
    handleContinueSolveSkip,
    handleGoToApsArchive,
    handlePrev,
    handleStartSolve,
    handleResetDefaults,
  }
}
