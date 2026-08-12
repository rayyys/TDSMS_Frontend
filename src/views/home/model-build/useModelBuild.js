import { computed, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { useSchedulingStore } from '@/stores/scheduling'
import { useStepNav, STEP_ROUTES } from '../useStepNav'
import {
  submitModelSolve,
  getSolveStatus,
  getSolveLogs,
  getSolveParamInfo,
  stopSolve,
  getProducTime,
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

    // 获取最大生产时间（用于构建模型时判断开始时间和交期时间的间隔）
    const fileId = schedulingStore.taskInfo?.fileId
    if (fileId) {
      getProducTime({ fileId })
        .then((res) => {
          const result = res?.data
          if (result?.success && Array.isArray(result?.data)) {
            // 接口返回 data: [273]，取第一个值作为最大生产时间
            schedulingStore.maxProducTime = result.data[0]
          }
        })
        .catch(() => {
          // 静默处理，不影响页面正常渲染
        })
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

    // 组装请求参数
    const taskId = schedulingStore.taskInfo?.taskId
    if (!taskId) {
      ElMessage.warning('未获取到任务ID，请重新上传文件')
      return
    }

    const payload = {
      taskId: String(taskId),
      objectiveWeight: schedulingStore.priority,
      orderStartTime: schedulingStore.earliestStartTime,
      dueTime: schedulingStore.deadlineDate,
      maxSolveTime: Math.round(Number(schedulingStore.maxSolveTime) / 60),
      // 新结构配置参数（生产规则 + 人员容量）— 同步提交给后端
      productionMonth: schedulingStore.productionMonth,
      continuousRunLimit: schedulingStore.continuousRunLimit,
      cleaningTimeLarge: schedulingStore.cleaningTimeLarge,
      cleaningTimeSmall: schedulingStore.cleaningTimeSmall,
      cleaningTimeRegular: schedulingStore.cleaningTimeRegular,
      shiftDays: schedulingStore.shiftDays,
      shiftHours: schedulingStore.shiftHours,
      morningShiftCapacity: { ...schedulingStore.morningShiftCapacity },
      eveningShiftCapacity: { ...schedulingStore.eveningShiftCapacity },
    }

    // 调用后端 API 提交求解
    try {
      const res = await submitModelSolve(payload)
      const result = res?.data
      if (result?.success) {
        // 保存后端返回的求解任务信息
        if (result?.data) {
          schedulingStore.solveInfo = result.data
        }
        // 启动求解状态跟踪（设置 running 状态并启动轮询和计时器）
        schedulingStore.startSolve()

        // 5秒后调用 log 接口获取初始日志并渲染到页面
        const solveId = result.data?.solveId || schedulingStore.solveInfo?.solveId
        if (solveId) {
          setTimeout(async () => {
            try {
              const logsRes = await getSolveLogs({ solveId })
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
      if ((errStatus === 400 || errStatus === 500) && errData?.data?.solveId) {
        // 后端返回已有求解任务进行中，弹出确认框让用户选择是否关闭
        const solveId = errData.data.solveId
        try {
          await ElMessageBox.confirm(
            `您即将发起新的求解请求。这将中断当前正在进行的任务（ID: ${solveId}），且原任务进度无法恢复。确定要覆盖吗？`,
            '任务冲突',
            {
              confirmButtonText: '开始新任务',
              cancelButtonText: '继续旧任务',
              type: 'warning',
              distinguishCancelAndClose: true,
            },
          )
          // 用户点击确认，调用 stop 接口关闭该求解任务
          solvingLoading.value = true
          await stopSolve({ solveId })
          // 等待 0.5 秒后，自动重试完整的"开始求解"流程
          await new Promise((resolve) => setTimeout(resolve, 1500))
          await handleStartSolve()
        } catch (e) {
          // 用户点击"继续旧任务"（cancel），加载旧任务数据并跳转到求解页
          if (e === 'cancel') {
            solvingLoading.value = true
            try {
              // 1. 调用 paramInfo 接口获取旧任务参数
              const paramRes = await getSolveParamInfo({ solveId })
              const paramData = paramRes?.data?.data
              if (paramRes?.data?.success && paramData) {
                // 填充求解任务信息
                schedulingStore.solveInfo = {
                  taskId: paramData.taskId,
                  solveId: paramData.solveId,
                  solveNo: paramData.solveNo,
                }
                // 回填求解参数（优先级、最大求解时间，后端返回分钟需转为秒）
                schedulingStore.priority = paramData.objectiveWeight
                schedulingStore.maxSolveTime = paramData.maxSolveTime * 60

                // 根据后端 solveStatus 设置前端状态
                // 1=运行中, 2=已完成, 4=已停止
                const apiStatus = paramData.solveStatus
                if (apiStatus === 1) {
                  schedulingStore.solveStatus = 'running'
                } else if (apiStatus === 2) {
                  schedulingStore.solveStatus = 'done'
                  schedulingStore.isOptimal = true
                  schedulingStore.solveProgress = 100
                } else {
                  schedulingStore.solveStatus = 'stopped'
                }

                // 更新运行时长
                if (paramData.startTime) {
                  const start = new Date(paramData.startTime).getTime()
                  if (!isNaN(start)) {
                    schedulingStore.solveElapsed = Math.floor((Date.now() - start) / 1000)
                  }
                }
              }

              // 2. 调用 status 接口获取最新状态（覆盖运行时长、可行解等字段）
              try {
                const statusRes = await getSolveStatus({ solveId })
                const statusData = statusRes?.data?.data
                if (statusRes?.data?.success && statusData) {
                  if (statusData.hasPartialResult !== undefined) {
                    schedulingStore.hasFeasibleSolution = statusData.hasPartialResult
                  }
                  if (statusData.startTime) {
                    const start = new Date(statusData.startTime).getTime()
                    if (!isNaN(start)) {
                      schedulingStore.solveElapsed = Math.floor((Date.now() - start) / 1000)
                    }
                  }
                }
              } catch {
                // status 接口失败不影响整体流程
              }

              // 3. 调用 logs 接口获取旧任务日志
              try {
                const logsRes = await getSolveLogs({ solveId })
                const logs = logsRes?.data?.data
                if (logsRes?.data?.success && Array.isArray(logs) && logs.length > 0) {
                  schedulingStore.backendLogs = logs.map((log) => ({
                    time: log.createTime ? log.createTime.slice(11, 19) : '',
                    message: log.logContent || '',
                  }))
                }
              } catch {
                // logs 接口失败不影响整体流程
              }

              // 4. 若旧任务仍在运行中，恢复轮询
              if (schedulingStore.solveStatus === 'running') {
                schedulingStore.resumePolling()
              }

              // 5. 跳转到模型求解页
              await router.push(STEP_ROUTES[3])
            } catch {
              ElMessage.error('加载旧任务数据失败，请稍后重试')
              solvingLoading.value = false
            }
          } else {
            // 用户点击关闭按钮（close），恢复按钮状态
            solvingLoading.value = false
          }
        }
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
