import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSchedulingStore } from '@/stores/scheduling'
import { submitScheduleResult, stopSolve as stopSolveApi } from '@/api/scheduling'

// 步骤与路由的映射
export const STEP_ROUTES = ['/upload', '/task-data', '/model-build', '/model-solve']

/**
 * 步骤导航 composable
 * 统一管理各子页面的上一步 / 下一步 / 返回上传页等导航与提交逻辑
 */
export function useStepNav() {
  const router = useRouter()
  const schedulingStore = useSchedulingStore()

  // 防止快速点击导致多次跳转
  const navigating = ref(false)

  // 当前是否正在求解中（用于控制上一步按钮置灰）
  const isSolving = computed(() => schedulingStore.solveStatus === 'running')

  // —— 各步骤"下一步"前置条件 ——
  const canNext = computed(() => {
    const idx = schedulingStore.currentStepIndex
    // 计算中或计算完成后，步骤 1~3 之间自由走动（数据上传页除外）
    const hasStartedSolving = schedulingStore.solveStatus !== 'idle'
    if (hasStartedSolving && idx > 0 && idx < 3) {
      return true
    }
    if (idx === 0) {
      // 数据上传：有后端任务（新建上传/历史导入）或有缓存文件数据即可
      return Boolean(schedulingStore.taskInfo?.taskId) || Boolean(schedulingStore.uploadedFileName)
    }
    if (idx === 1) {
      // 任务数据：已查看即可（异常数据自动忽略）
      return schedulingStore.hasParsedData
    }
    if (idx === 2) {
      // 模型构建：必须选了优化目标与求解时长
      return Boolean(schedulingStore.optimizationGoal) && Boolean(schedulingStore.maxSolveTime)
    }
    return true
  })

  // —— "下一步"不满足时的提示文案 ——
  function notifyNextDisabled() {
    const idx = schedulingStore.currentStepIndex
    if (idx === 0) {
      if (!schedulingStore.taskInfo?.taskId && !schedulingStore.uploadedFileName) {
        ElMessage.warning('请先上传文件或从历史记录导入')
      }
    } else if (idx === 1) {
      ElMessage.warning('请先查看任务数据，确认无误后再继续')
    } else if (idx === 2) {
      ElMessage.warning('请先选择优化目标并设置求解时间')
    }
  }

  // —— 上一步 ——
  function handlePrev() {
    if (schedulingStore.isFirstStep) {
      ElMessage.warning('当前已是第一步，无法继续上一步')
      return
    }
    const newIdx = schedulingStore.currentStepIndex - 1
    schedulingStore.goPrev()
    router.push(STEP_ROUTES[newIdx])
  }

  // —— 下一步（含 API 提交） ——
  async function handleNext() {
    if (navigating.value) return
    if (!canNext.value) {
      notifyNextDisabled()
      return
    }

    // 进入模型求解前提示异常数据将被忽略
    if (schedulingStore.currentStepIndex === 2 && schedulingStore.totalAnomalyCount > 0) {
      ElMessage.info(
        `检测到 ${schedulingStore.totalAnomalyCount} 条异常数据，将自动忽略不参与排程计算`,
      )
    }

    // 数据上传步骤校验通过且无异常时，不做额外提示

    navigating.value = true
    const newIdx = schedulingStore.currentStepIndex + 1
    if (newIdx >= STEP_ROUTES.length) {
      navigating.value = false
      return
    }

    // ====== 各步骤下一步的提交逻辑 ======
    const stepIndex = schedulingStore.currentStepIndex
    let apiCall = Promise.resolve()
    if (stepIndex === 2) {
      // 模型构建步骤：求解参数已保存在前端 store 中
      // 进入模型求解页时由页面自身触发 /solves/start，步骤切换无需单独提交
      apiCall = Promise.resolve()
    }

    try {
      await apiCall
      schedulingStore.goNext()
      await router.push(STEP_ROUTES[newIdx])
    } catch (err) {
      ElMessage.error('提交失败：' + (err?.message || '未知错误'))
    } finally {
      navigating.value = false
    }
  }

  // —— 返回任务上传页面（重置工作流） ——
  async function handleBackToUpload() {
    try {
      await ElMessageBox.confirm(
        '返回任务上传页面后,当前求解结果将不再显示。如需保留排程结果,建议先导出Excel文件。是否继续返回?',
        '返回任务上传页面',
        {
          type: 'warning',
          confirmButtonText: '返回任务上传页面',
          cancelButtonText: '取消',
        },
      )
      // 若后端正在求解，先通知后端停止，再清前端状态
      if (schedulingStore.solveStatus === 'running' && schedulingStore.solveInfo?.solveId) {
        try {
          await stopSolveApi({ solveId: schedulingStore.solveInfo.solveId })
        } catch {
          // 后端停止失败不阻塞前端重置流程
        }
      }
      schedulingStore.resetAll()
      router.push('/upload')
    } catch {
      // 用户取消
    }
  }

  // —— 完成排程（导出结果并提交） ——
  async function handleFinish() {
    try {
      await ElMessageBox.confirm('确认导出当前排产结果并结束本次排程？', '完成确认', {
        type: 'warning',
      })
      await submitScheduleResult({
        solveStatus: schedulingStore.solveStatus,
        solveElapsed: schedulingStore.solveElapsed,
        isOptimal: schedulingStore.isOptimal,
      })
      ElMessage.success('排产结果已导出（演示：已触发下载）')
      // 演示：触发一次空文件下载占位
      const blob = new Blob(['IVSMS 排产结果（演示占位）'], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '排产结果.txt'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // 用户取消
    }
  }

  return {
    STEP_ROUTES,
    navigating,
    isSolving,
    canNext,
    handlePrev,
    handleNext,
    handleBackToUpload,
    handleFinish,
    notifyNextDisabled,
  }
}
