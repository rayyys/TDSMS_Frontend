import { computed, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { useSchedulingStore } from '@/stores/scheduling'
import { useStepNav, STEP_ROUTES } from '../useStepNav'
import {
  startSolveTask,
  getSolveTask,
  getSolveTaskLogs,
  stopSolveTask,
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
    if (status === 'stopped') return '重新求解'
    if (status === 'running') return '查看求解'
    return '已进行求解' // done
  })

  // 校验排产时间输入：running/done 仅跳转无需校验，idle/stopped 需校验
  const canStartSolve = computed(() => {
    if (schedulingStore.solveStatus === 'running' || schedulingStore.solveStatus === 'done')
      return true
    return (
      !hasTimeRuleError.value &&
      schedulingStore.earliestStartTime &&
      schedulingStore.deadlineDate &&
      schedulingStore.maxSolveTime !== null &&
      schedulingStore.maxSolveTime !== undefined
    )
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

  // 进入模型构建页时自动重置排产时间默认值
  // 仅 idle（首次进入）和 done（已完成）时重置；stopped 保留用户设置以便二次修改
  onMounted(() => {
    if (schedulingStore.solveStatus === 'idle' || schedulingStore.solveStatus === 'done') {
      schedulingStore.resetScheduleDefaults()
    }
  })

  // 开始求解按钮 loading 状态（防止重复点击）
  const solvingLoading = ref(false)

  // 按钮禁用条件：loading中 或 时间规则不满足（running/done 允许跳转不禁用）
  const isSolveBtnDisabled = computed(() => {
    if (solvingLoading.value) return true
    if (schedulingStore.solveStatus === 'running' || schedulingStore.solveStatus === 'done')
      return false
    return hasTimeRuleError.value
  })

  async function handleStartSolve() {
    const status = schedulingStore.solveStatus

    // running（求解中）和 done（已完成）：直接跳转查看，不触发提交
    if (status === 'running' || status === 'done') {
      router.push(STEP_ROUTES[3])
      return
    }

    // idle / stopped：走完整提交流程

    // 校验排产时间输入是否完整
    if (!canStartSolve.value) {
      if (hasDeadlineDateError.value) {
        ElMessage.error('订单不确定性交期不能早于订单加工开始时间')
      } else if (hasIntervalError.value) {
        ElMessage.error('时间过短，无法满足排产需求')
      } else {
        ElMessage.error('请完成任务排产时间设置')
      }
      return
    }

    // idle / stopped：校验前置条件
    if (!canNext.value) {
      notifyNextDisabled()
      return
    }

    // 获取 importId（由 /task/import 或 /tasks/historyImport 返回）
    const importId = schedulingStore.taskInfo?.importId
    if (!importId) {
      ElMessage.warning('未获取到任务ID，请重新上传文件')
      return
    }

    // 人员容量中文键 → 英文键映射（与接口文档 personnelCapacity 字段对齐）
    const CAPACITY_KEY_MAP = { 配料: 'mixing', 压片: 'tableting', 包衣: 'coating', 包装: 'packaging' }
    function mapCapacityKeys(capacity) {
      const result = {}
      for (const [key, value] of Object.entries(capacity || {})) {
        result[CAPACITY_KEY_MAP[key] || key] = value
      }
      return result
    }

    // 按接口文档 POST /solve/start 组装嵌套参数结构
    const payload = {
      importId,
      scheduleMonth: schedulingStore.productionMonth,
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
      personnelCapacity: {
        dayShift: mapCapacityKeys(schedulingStore.morningShiftCapacity),
        nightShift: mapCapacityKeys(schedulingStore.eveningShiftCapacity),
      },
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

  // 排产月份显示（YYYY-MM → YYYY年MM月）
  const productionMonthText = computed(() => {
    const val = schedulingStore.productionMonth
    if (!val) return ''
    const [year, month] = String(val).split('-')
    if (!year || !month) return val
    return `${year}年${month}月`
  })

  // 恢复页面默认参数（生产规则 + 班次换算）
  function handleResetDefaults() {
    schedulingStore.continuousRunLimit = 5.5
    schedulingStore.cleaningTimeLarge = 0.5
    schedulingStore.cleaningTimeSmall = 0.25
    schedulingStore.cleaningTimeRegular = 0.5
    schedulingStore.shiftDays = 1
    schedulingStore.shiftHours = 2
    ElMessage.success('已恢复默认参数')
  }

  return {
    schedulingStore,
    isModelBuildLocked,
    solveBtnText,
    canStartSolve,
    hasDeadlineDateError,
    hasIntervalError,
    hasTimeRuleError,
    isSolveBtnDisabled,
    priorityOptions,
    solvingLoading,
    // 新结构展示辅助
    productionMonthText,
    handlePrev,
    handleStartSolve,
    handleResetDefaults,
  }
}
