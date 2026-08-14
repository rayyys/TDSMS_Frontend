import { computed, ref, watch, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VideoPlay, VideoPause, Lock, Download } from '@element-plus/icons-vue'
import { useSchedulingStore } from '@/stores/scheduling'
import {
  stopSolveTask as stopSolveApi,
  getSolveTask as getSolveTaskApi,
  exportSolveTaskResult as exportSolveResultApi,
} from '@/api/scheduling'

// 优先级选项映射（与模型构建页一致）
const PRIORITY_OPTIONS = [
  { value: 0, label: '均衡考虑', desc: 'A的权重与B相等' },
  { value: 1, label: '优先考虑 A', desc: 'A的权重远大于B' },
  { value: 2, label: '优先考虑 B', desc: 'B的权重远大于A' },
  { value: 3, label: '仅考虑 A', desc: '仅考虑交期延误最小' },
  { value: 4, label: '仅考虑 B', desc: '仅考虑设备空闲时间最小' },
]

export function useModelSolve() {
  const schedulingStore = useSchedulingStore()
  const logBoxRef = ref(null)

  // 停止求解按钮 loading 状态（防止重复点击）
  const stoppingLoading = ref(false)

  // 状态主标题文案（与原型图标题保持一致）
  const statusText = computed(() => {
    switch (schedulingStore.solveStatus) {
      case 'idle':
        return '等待开始'
      case 'running':
        return '正在求解'
      case 'stopped':
        return '已停止'
      case 'done':
        return '求解已完成'
      default:
        return '求解已完成'
    }
  })

  // 状态副标题文案（原型图：正在运行算法求解，请耐心等待结果...）
  const statusSubtitle = computed(() => {
    switch (schedulingStore.solveStatus) {
      case 'running':
        return '正在运行算法求解，请耐心等待结果...'
      case 'stopped':
        return '求解已停止，您可以导出当前已搜索到的排产方案'
      case 'done':
        return '求解已完成，可导出最优排产结果'
      default:
        return '系统正在准备求解任务...'
    }
  })

  const statusClass = computed(() => {
    return {
      'st-idle': schedulingStore.solveStatus === 'idle',
      'st-running': schedulingStore.solveStatus === 'running',
      'st-stopped': schedulingStore.solveStatus === 'stopped',
      'st-done': schedulingStore.solveStatus === 'done',
    }
  })

  const progressStatus = computed(() => {
    if (schedulingStore.solveStatus === 'done') return 'success'
    return ''
  })

  const canExport = computed(() => {
    return (
      schedulingStore.solveStatus === 'done' ||
      (schedulingStore.solveStatus === 'stopped' && schedulingStore.hasFeasibleSolution)
    )
  })

  const showResult = computed(() => {
    return ['stopped', 'done'].includes(schedulingStore.solveStatus)
  })

  // —— 右侧"求解控制"面板动态数据 ——

  /** 当前优先级配置对象 */
  const currentPriority = computed(() => {
    return PRIORITY_OPTIONS.find((p) => p.value === schedulingStore.priority) || PRIORITY_OPTIONS[0]
  })

  /** 目标 A（交期延误最小）是否处于优先地位 */
  const isPriorityA = computed(() => [1, 3].includes(schedulingStore.priority))

  /** 目标 B（设备空载时间最小）是否处于优先地位 */
  const isPriorityB = computed(() => [2, 4].includes(schedulingStore.priority))

  /** 当前优先级描述文案（如"优先考虑 A"） */
  const priorityDescription = computed(() => currentPriority.value.desc)

  /** 格式化最早开始时间，去除 T 分隔符 */
  const formattedEarliestStart = computed(() => {
    const val = schedulingStore.earliestStartTime
    if (!val) return '--'
    return val.replace('T', ' ')
  })

  /** 格式化虚拟交期时间 */
  const formattedDeadline = computed(() => {
    const val = schedulingStore.deadlineDate
    if (!val) return '--'
    return val.replace('T', ' ')
  })

  /** 最大求解时间显示标签 */
  const maxSolveTimeLabel = computed(() => {
    const opt = schedulingStore.solveTimeOptions.find(
      (o) => o.value === schedulingStore.maxSolveTime,
    )
    return opt?.label || `${schedulingStore.maxSolveTime}秒`
  })

  // —— 参数配置概览面板数据（仅用于展示，不参与业务逻辑计算） ——

  /** 排产月份：按最早开工时间所在年月显示（原型图：2025年06月） */
  const productionMonth = computed(() => {
    const val = schedulingStore.earliestStartTime
    if (!val) return '--'
    const d = new Date(val)
    if (isNaN(d.getTime())) return '--'
    return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月`
  })

  /** 求解开始时间（原型图：2025-06-06 14:30:12） */
  const solveStartTimeText = computed(() => {
    const start = schedulingStore.solveStartTime
    if (!start) return '--'
    const d = new Date(start)
    if (isNaN(d.getTime())) return '--'
    const pad = (n) => String(n).padStart(2, '0')
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    )
  })

  /** 最长求解时间显示（原型图：20分钟） */
  const maxSolveDurationText = computed(() => {
    const sec = schedulingStore.maxSolveTime
    if (!sec) return '--'
    if (sec % 3600 === 0) return `${sec / 3600}小时`
    if (sec % 60 === 0) return `${sec / 60}分钟`
    return `${sec}秒`
  })

  function formatElapsed(sec) {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function handleStart() {
    schedulingStore.startSolve()
    // ElMessage.info('求解已启动')
  }

  async function handleStop() {
    const st = schedulingStore.solveStatus
    if (st !== 'running') return

    // 校验是否有求解任务 ID
    const solveTaskId = schedulingStore.solveInfo?.solveTaskId
    if (!solveTaskId) {
      ElMessage.error('未获取到求解任务信息，无法停止')
      return
    }

    try {
      // 无可行解：弹窗确认
      if (!schedulingStore.hasFeasibleSolution) {
        await ElMessageBox.confirm('当前尚未搜索到可行排产方案，确定取消本次求解吗？', '停止确认', {
          type: 'warning',
          confirmButtonText: '停止求解',
          cancelButtonText: '继续求解',
          distinguishCancelAndClose: true,
        })
        // 先调停止接口，完成后再查询最新状态
        await stopSolveApi({ solveTaskId })
        const statusRes = await getSolveTaskApi({ solveTaskId })
        const statusData = statusRes?.data?.data
        if (statusData?.hasPartialResult !== undefined) {
          schedulingStore.hasFeasibleSolution = statusData.hasPartialResult
        }
        schedulingStore.stopSolve()
        ElMessage.warning('已停止，当前无可行解，不可导出')
        return
      }

      // 有可行解但非最优：弹窗确认
      if (!schedulingStore.isOptimal) {
        await ElMessageBox.confirm(
          '当前已获得可行排程方案，但未获得全局最优结果。是否停止求解并下载当前最佳方案？',
          '停止确认',
          {
            type: 'warning',
            confirmButtonText: '停止并下载',
            cancelButtonText: '继续求解',
            distinguishCancelAndClose: true,
          },
        )
        stoppingLoading.value = true
        try {
          // 先调停止接口，完成后再查询最新状态
          await stopSolveApi({ solveTaskId })
          const statusRes = await getSolveTaskApi({ solveTaskId })
          const statusData = statusRes?.data?.data
          if (statusData?.hasPartialResult !== undefined) {
            schedulingStore.hasFeasibleSolution = statusData.hasPartialResult
          }
          schedulingStore.stopSolve()
          ElMessage.success('已停止，可导出当前结果')
          // 自动触发导出
          handleExport()
        } finally {
          stoppingLoading.value = false
        }
        return
      }

      // 已是最优：不应出现（最优会自动停止），兜底处理
      // 先调停止接口，完成后再查询最新状态
      await stopSolveApi({ solveTaskId })
      const statusRes = await getSolveTaskApi({ solveTaskId })
      const statusData = statusRes?.data?.data
      if (statusData?.hasPartialResult !== undefined) {
        schedulingStore.hasFeasibleSolution = statusData.hasPartialResult
      }
      schedulingStore.stopSolve()
    } catch (e) {
      // 用户取消弹窗（点击"继续求解"或关闭），不做处理
      if (e === 'cancel' || e === 'close') return

      // API 错误处理
      const errStatus = e?.response?.status
      if (errStatus === 400) {
        ElMessage.warning('当前求解任务已结束，不允许停止')
      } else if (errStatus === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else if (errStatus === 500) {
        ElMessage.error('停止求解失败，请稍后重试')
      } else {
        ElMessage.error(e?.response?.data?.message || e?.message || '停止求解失败')
      }
    }
  }

  async function handleExport() {
    if (!canExport.value) {
      // 已停止且无可行解 → 红色错误提示
      if (schedulingStore.solveStatus === 'stopped' && !schedulingStore.hasFeasibleSolution) {
        ElMessage.error('当前尚未搜索到可行排产方案，结果不可下载。')
        return
      }
      ElMessage.warning('求解未完成或无有效结果，暂不可导出')
      return
    }

    const solveTaskId = schedulingStore.solveInfo?.solveTaskId
    if (!solveTaskId) {
      ElMessage.error('未获取到求解任务信息，无法导出')
      return
    }

    try {
      const res = await exportSolveResultApi({ solveTaskId })
      // 从响应中获取文件流（res.data 为 Blob）
      const blob = res.data
      if (!blob || blob.size === 0) {
        ElMessage.warning('导出的文件为空')
        return
      }
      // 触发文件下载
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `排产结果-${schedulingStore.fileName || '未知文件'}`
      a.click()
      URL.revokeObjectURL(url)
      ElMessage.success('文件导出成功')
    } catch (error) {
      const errStatus = error?.response?.status
      if (errStatus === 400) {
        ElMessage.warning('当前求解任务暂无可导出的排程结果')
      } else if (errStatus === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else if (errStatus === 500) {
        ElMessage.error('服务器内部错误，导出失败，请联系管理员')
      } else {
        ElMessage.error(error?.response?.data?.message || error?.message || '导出失败')
      }
    }
  }

  // 日志自动滚动到顶部（最新日志在上方）
  watch(
    () => schedulingStore.solveLogs.length,
    async () => {
      await nextTick()
      if (logBoxRef.value) {
        logBoxRef.value.scrollTop = 0
      }
    },
  )

  onBeforeUnmount(() => {
    // 离开页面时不停止求解（保持后台运行）
  })

  // 页面挂载时：若 solveStatus 为 running（刷新后恢复），重启轮询定时器
  onMounted(() => {
    schedulingStore.resumePolling()
  })

  return {
    // icons
    VideoPlay,
    VideoPause,
    Lock,
    Download,
    // store
    schedulingStore,
    // refs
    logBoxRef,
    stoppingLoading,
    // computed
    statusText,
    statusSubtitle,
    statusClass,
    progressStatus,
    canExport,
    showResult,
    // 右侧面板动态数据
    currentPriority,
    isPriorityA,
    isPriorityB,
    priorityDescription,
    formattedEarliestStart,
    formattedDeadline,
    maxSolveTimeLabel,
    // 参数配置概览数据
    productionMonth,
    solveStartTimeText,
    maxSolveDurationText,
    // methods
    formatElapsed,
    handleStart,
    handleStop,
    handleExport,
  }
}
