import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

import { SHEET_NAMES, OPTIMIZATION_GOALS, SOLVE_TIME_OPTIONS } from '@/config/schedulingConfig'
import { getSolveTaskLogs, getSolveTask, stopSolveTask as stopSolveApi } from '@/api/scheduling'
import { saveToSession, loadFromSession, clearSession } from '@/views/home/useSessionState'

// 工作流步骤定义
export const WORKFLOW_STEPS = [
  { key: 'upload', label: '任务上传' },
  { key: 'taskData', label: '任务数据' },
  { key: 'modelBuild', label: '模型构建' },
  { key: 'modelSolve', label: '模型求解' },
]

export const useSchedulingStore = defineStore('scheduling', () => {
  // 尝试从 sessionStorage 恢复状态（刷新后保留，关闭标签页后自动清空）
  const saved = loadFromSession()
  // —— 工作流步骤 ——
  const currentStepIndex = ref(saved?.currentStepIndex ?? 0)
  /** 用户已访问过的最远步骤索引（用于侧边栏导航控制） */
  const maxVisitedStepIndex = ref(saved?.maxVisitedStepIndex ?? 0)
  const steps = WORKFLOW_STEPS

  const currentStep = computed(() => steps[currentStepIndex.value])
  const isFirstStep = computed(() => currentStepIndex.value === 0)
  const isLastStep = computed(() => currentStepIndex.value === steps.length - 1)

  function goNext() {
    if (currentStepIndex.value < steps.length - 1) {
      currentStepIndex.value++
      if (currentStepIndex.value > maxVisitedStepIndex.value) {
        maxVisitedStepIndex.value = currentStepIndex.value
      }
    }
  }
  function goPrev() {
    if (currentStepIndex.value > 0) {
      currentStepIndex.value--
    }
  }
  function goToStep(index) {
    if (index >= 0 && index < steps.length) {
      currentStepIndex.value = index
      if (index > maxVisitedStepIndex.value) {
        maxVisitedStepIndex.value = index
      }
    }
  }

  // —— 数据上传 ——
  const uploadedFileName = ref(saved?.uploadedFileName ?? '')
  const uploadedFileRaw = ref(null) // 原始 File 对象（不持久化，浏览器刷新后丢失）
  const taskRemark = ref(saved?.taskRemark ?? '')
  const taskInfo = ref(saved?.taskInfo ?? null) // 后端上传接口返回的任务信息

  function setUploadedFile(file) {
    uploadedFileName.value = file.name
    uploadedFileRaw.value = file
  }
  function setTaskInfo(info) {
    taskInfo.value = info || null
    // 任务信息是后续步骤（模型构建、求解等）的前置依赖，必须立即持久化
    // 否则刷新页面后 taskId 丢失，导致"未获取到任务ID"错误
    persistState()
  }
  function clearUploadedFile() {
    uploadedFileName.value = ''
    uploadedFileRaw.value = null
    taskRemark.value = ''
    taskInfo.value = null
    // 清空已解析数据
    sheetDataMap.value = {}
    parseError.value = ''
    clearSession()
  }

  // —— 任务数据 ——
  // sheetDataMap: { [sheetName]: { columns, rows, annotated } }
  const sheetDataMap = ref({})
  const parseError = ref('')
  const activeSheet = ref(saved?.activeSheet ?? SHEET_NAMES[0])

  // 如果 sessionStorage 有缓存的 sheetDataMap，恢复 annotated
  if (saved?.sheetDataMap) {
    const restored = {}
    for (const [name, sheet] of Object.entries(saved.sheetDataMap)) {
      const columns = sheet.columns || []
      const rows = sheet.rows || []
      // 优先使用已保存的 annotated（含后端异常数据），不存在则用空标注兜底
      const annotated =
        sheet.annotated || rows.map((row) => ({ row, anomalies: [], hasAnomaly: false }))
      restored[name] = { columns, rows, annotated }
    }
    sheetDataMap.value = restored
    // activeSheet 不在已恢复数据中时，回退到第一个 Sheet
    if (!restored[activeSheet.value]) {
      const first = Object.keys(restored)[0]
      if (first) activeSheet.value = first
    }
  }

  const sheetNames = computed(() => Object.keys(sheetDataMap.value))
  const hasParsedData = computed(() => sheetNames.value.length > 0)

  const totalRowCount = computed(() => {
    return sheetNames.value.reduce((sum, name) => {
      return sum + (sheetDataMap.value[name]?.rows.length || 0)
    }, 0)
  })

  const totalAnomalyCount = computed(() => {
    return sheetNames.value.reduce((sum, name) => {
      const sheet = sheetDataMap.value[name]
      if (!sheet) return sum
      return sum + sheet.annotated.filter((a) => a.hasAnomaly).length
    }, 0)
  })

  function getSheetAnomalyCount(sheetName) {
    const sheet = sheetDataMap.value[sheetName]
    if (!sheet) return 0
    return sheet.annotated.filter((a) => a.hasAnomaly).length
  }

  // 必填列校验（已移除，由后端负责）

  /**
   * 用真实解析的 Excel 数据填充
   * @param {Object} parsed { [sheetName]: { columns, rows } }
   */
  function loadParsedData(parsed) {
    const map = {}
    for (const [name, sheet] of Object.entries(parsed)) {
      map[name] = {
        columns: sheet.columns,
        rows: sheet.rows,
        annotated: sheet.rows.map((row) => ({ row, anomalies: [], hasAnomaly: false })),
      }
    }
    sheetDataMap.value = map
    const first = Object.keys(map)[0]
    if (first) activeSheet.value = first
    parseError.value = ''
    persistState()
  }

  /**
   * 用后端 /tasks/excelShow 接口返回的 records 填充指定 Sheet
   * @param {string} mode Sheet 名称（作为 mode 传给后端）
   * @param {Array<Object>} records 对象数组
   */
  function loadApiSheetData(mode, records) {
    if (!Array.isArray(records) || records.length === 0) {
      sheetDataMap.value[mode] = { columns: [], rows: [], annotated: [] }
      persistState()
      return
    }
    const metaKeys = new Set(['id', 'rowNo', 'isAbnormal', 'abnormalReason'])
    const columns = Object.keys(records[0]).filter((k) => !metaKeys.has(k))
    const rows = []
    const annotated = []
    for (const record of records) {
      const rowValues = columns.map((col) => record[col])
      rows.push(rowValues)
      const anomalies = []
      if (record.abnormalReason) anomalies.push(String(record.abnormalReason))
      annotated.push({
        row: rowValues,
        hasAnomaly: Boolean(record.isAbnormal),
        anomalies,
      })
    }
    sheetDataMap.value[mode] = { columns, rows, annotated }
    persistState()
  }

  // —— 模型构建配置 ——
  const optimizationGoal = ref(saved?.optimizationGoal ?? 'delivery')
  const earliestStartTime = ref(saved?.earliestStartTime ?? getDefaultEarliestStart())
  const deadlineDate = ref(saved?.deadlineDate ?? getDefaultMonthEnd())
  const maxSolveTime = ref(saved?.maxSolveTime ?? 600) // 秒 TODO: 测试用，上线前改回 saved?.maxSolveTime
  // const maxSolveTime = ref(600)
  const priority = ref(saved?.priority ?? 0)
  const maxProducTime = ref(saved?.maxProducTime ?? null) // 最大生产时间（来自 /solves/producTime）
  const fileName = ref(saved?.fileName ?? '') // 上传文件名称（与 taskId 同级）

  // —— 模型构建新结构配置（生产规则 + 人员容量，仅用于页面展示与持久化） ——
  // 1. 排产时间设置
  const productionMonth = ref(saved?.productionMonth ?? getDefaultProductionMonth())
  // 2. 生产规则配置
  const continuousRunLimit = ref(saved?.continuousRunLimit ?? 5.5) // 连续运行上限（天）
  const cleaningTimeLarge = ref(saved?.cleaningTimeLarge ?? 0.5) // 大清场时长（天）
  const cleaningTimeSmall = ref(saved?.cleaningTimeSmall ?? 0.25) // 小清场时长（天）
  const cleaningTimeRegular = ref(saved?.cleaningTimeRegular ?? 0.5) // 定期清场时长（天）
  const shiftDays = ref(saved?.shiftDays ?? 1) // 班次换算-天数
  const shiftHours = ref(saved?.shiftHours ?? 2) // 班次换算-班时
  // 3. 人员容量配置
  const morningShiftCapacity = ref(
    saved?.morningShiftCapacity ?? { 配料: 3, 压片: 2, 包衣: 2, 包装: 4 },
  )
  const eveningShiftCapacity = ref(
    saved?.eveningShiftCapacity ?? { 配料: 3, 压片: 2, 包衣: 2, 包装: 3 },
  )

  const solveTimeOptions = SOLVE_TIME_OPTIONS

  // 获取当前选中的优化目标标签
  const selectedGoalLabel = computed(() => {
    const goal = OPTIMIZATION_GOALS.find((g) => g.value === optimizationGoal.value)
    return goal?.label || ''
  })

  // 持久化函数：收集当前状态并写入 sessionStorage
  function persistState() {
    saveToSession({
      currentStepIndex: currentStepIndex.value,
      maxVisitedStepIndex: maxVisitedStepIndex.value,
      uploadedFileName: uploadedFileName.value,
      taskRemark: taskRemark.value,
      taskInfo: taskInfo.value,
      activeSheet: activeSheet.value,
      sheetDataMap: sheetDataMap.value,
      optimizationGoal: optimizationGoal.value,
      earliestStartTime: earliestStartTime.value,
      deadlineDate: deadlineDate.value,
      maxSolveTime: maxSolveTime.value,
      priority: priority.value,
      maxProducTime: maxProducTime.value,
      fileName: fileName.value,
      // 新结构配置持久化（生产规则 + 人员容量）
      productionMonth: productionMonth.value,
      continuousRunLimit: continuousRunLimit.value,
      cleaningTimeLarge: cleaningTimeLarge.value,
      cleaningTimeSmall: cleaningTimeSmall.value,
      cleaningTimeRegular: cleaningTimeRegular.value,
      shiftDays: shiftDays.value,
      shiftHours: shiftHours.value,
      morningShiftCapacity: morningShiftCapacity.value,
      eveningShiftCapacity: eveningShiftCapacity.value,
      solveStatus: solveStatus.value,
      solveInfo: solveInfo.value,
      // 缓存"总运行时长"和"求解日志"数据，页面关闭后自动清空
      frontendPrefixLogs: frontendPrefixLogs.value,
      backendLogs: backendLogs.value,
      frontendSuffixLogs: frontendSuffixLogs.value,
      solveElapsed: solveElapsed.value,
    })
  }

  // 监听模型构建配置变更，自动持久化
  watch(
    [
      optimizationGoal,
      earliestStartTime,
      deadlineDate,
      maxSolveTime,
      priority,
      taskRemark,
      currentStepIndex,
      // 新结构配置（生产规则 + 人员容量）
      productionMonth,
      continuousRunLimit,
      cleaningTimeLarge,
      cleaningTimeSmall,
      cleaningTimeRegular,
      shiftDays,
      shiftHours,
      morningShiftCapacity,
      eveningShiftCapacity,
    ],
    () => {
      persistState()
    },
    { deep: true },
  )

  // 监听 taskInfo 变化，自动提取 fileName（上传、历史导入、刷新恢复时同步）
  watch(
    taskInfo,
    (val) => {
      fileName.value = val?.fileName ?? ''
    },
    { immediate: true },
  )

  // 当用户首次选择或修改订单加工开始时间时，自动计算并填充订单不确定性交期
  // 默认值按"开始时间所在月份最后一天 23:59:59"生成，自动填充后用户仍可手动修改
  watch(earliestStartTime, (newVal) => {
    if (newVal) {
      deadlineDate.value = calcMonthEnd(newVal)
    }
  })

  function getDefaultEarliestStart() {
    const d = new Date()
    return formatDateTime(d)
  }
  function getDefaultMonthEnd() {
    const d = new Date()
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return formatDateLastSecond(lastDay)
  }
  /** 获取排产月份默认值（当前年月，格式：YYYY-MM） */
  function getDefaultProductionMonth() {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  }
  /** 根据指定日期计算当月最后一天 23:59:59 */
  function calcMonthEnd(dateStr) {
    if (!dateStr) return getDefaultMonthEnd()
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return getDefaultMonthEnd()
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return formatDateLastSecond(lastDay)
  }
  function formatDateLastSecond(d) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 23:59:59`
  }
  function formatDateTime(d) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  // —— 模型求解状态 ——
  const solveStatus = ref(saved?.solveStatus ?? 'idle') // idle | running | stopped | done

  // 求解是否正在进行（用于锁定模型构建页输入）
  const isSolving = computed(() => solveStatus.value === 'running')

  const solveProgress = ref(0) // 0-100
  // 前端前缀日志（求解开始时添加，固定在日志内容开头）
  const frontendPrefixLogs = ref(saved?.frontendPrefixLogs ?? [])
  // 后端日志（每次轮询覆盖更新，位于日志内容中间）
  const backendLogs = ref(saved?.backendLogs ?? [])
  // 前端后缀日志（求解结束时添加，固定在日志内容末尾）
  const frontendSuffixLogs = ref(saved?.frontendSuffixLogs ?? [])

  // 组合日志：倒序显示，最新日志在上方
  // 后端日志已由后端倒序返回，前端只需反转前缀和后缀日志
  const solveLogs = computed(() => [
    ...[...frontendSuffixLogs.value].reverse(),
    ...backendLogs.value,
    ...[...frontendPrefixLogs.value].reverse(),
  ])
  const solveStartTime = ref(null)
  const solveElapsed = ref(saved?.solveElapsed ?? 0) // 秒
  // 后端返回的求解任务信息
  const solveInfo = ref(saved?.solveInfo ?? null) // { solveTaskId, importId, solveStatus, ... }
  const hasFeasibleSolution = ref(false)
  const isOptimal = ref(false)

  // 监听模型求解状态变更，确保"总运行时长"和"求解日志"在状态变化时被持久化
  watch(solveStatus, (newVal, oldVal) => {
    if (newVal !== oldVal) {
      persistState()
    }
  })

  let pollTimer = null
  let logTimer = null
  let elapsedTimer = null
  // 运行期间定时持久化定时器（每30秒保存一次，确保刷新前数据不丢失）
  let persistTimer = null

  function startSolve() {
    if (solveStatus.value === 'running') return
    solveStatus.value = 'running'
    solveProgress.value = 0
    frontendPrefixLogs.value = []
    backendLogs.value = []
    frontendSuffixLogs.value = []
    solveStartTime.value = Date.now()
    solveElapsed.value = 0
    hasFeasibleSolution.value = false
    isOptimal.value = false

    pushLog('求解任务已启动，开始迭代...', 'prefix')
    // pushLog(`优化目标：${selectedGoalLabel.value} | 最大求解时长：${maxSolveTime.value}秒`)

    // —— 状态轮询：每 30 秒从后端拉取求解状态 ——
    pollTimer = setInterval(async () => {
      if (solveStatus.value !== 'running') return
      const sid = solveInfo.value?.solveTaskId
      if (!sid) return
      try {
        const res = await getSolveTask({ solveTaskId: sid })
        const result = res?.data?.data
        if (res?.data?.success && result) {
          // 根据后端 startTime 更新运行时长（当前北京时间 - 任务开始时间）
          if (result.startTime) {
            const start = new Date(result.startTime).getTime()
            if (!isNaN(start)) {
              solveElapsed.value = Math.floor((Date.now() - start) / 1000)
            }
          }
          // 更新是否有局部结果（可行解）
          if (result.hasPartialResult !== undefined) {
            hasFeasibleSolution.value = result.hasPartialResult
          }
          // 检测后端状态是否为终态
          const status = result.solveStatus
          if (status !== undefined && status !== 1) {
            // status: 1=运行中, 2=已完成, 4=已停止, 其他=终态
            if (status === 4) {
              stopSolve()
            } else {
              finishSolve(status === 2)
            }
          }
        }
      } catch {
        // 轮询失败静默处理
      }
    }, 30000)

    // —— 日志轮询：每 30 秒从后端拉取最新求解日志 ——
    logTimer = setInterval(async () => {
      if (solveStatus.value !== 'running') return
      const sid = solveInfo.value?.solveTaskId
      if (!sid) return
      try {
        const res = await getSolveTaskLogs({ solveTaskId: sid })
        // 响应格式：{ success: true, data: [{ id, logContent, createTime }, ...] }
        const logs = res?.data?.data
        if (res?.data?.success && Array.isArray(logs) && logs.length > 0) {
          // 直接用最新获取的后端日志覆盖原有后端日志内容
          backendLogs.value = logs.map((log) => ({
            time: log.createTime ? log.createTime.slice(11, 19) : '',
            message: log.logContent || '',
          }))
          persistState()
        }
      } catch {
        // 轮询失败静默处理，下次继续
      }
    }, 30000)

    // —— 计时器 ——
    elapsedTimer = setInterval(async () => {
      if (solveStatus.value !== 'running') return
      solveElapsed.value++
      // 超时自动停止（超过最大求解时间阈值）maxSolveTime.value
      if (solveElapsed.value >= maxSolveTime.value) {
        // 先更新本地状态为已停止
        finishSolve(false)
        // finishSolve 完成后，按顺序调用 stop 接口和 status 接口
        const sid = solveInfo.value?.solveTaskId
        if (sid) {
          try {
            await stopSolveApi({ solveTaskId: sid })
          } catch {
            // stop 接口调用异常，不影响后续流程
          }
          try {
            const statusRes = await getSolveTask({ solveTaskId: sid })
            const statusData = statusRes?.data?.data
            if (statusRes?.data?.success && statusData) {
              if (statusData.startTime) {
                const start = new Date(statusData.startTime).getTime()
                if (!isNaN(start)) {
                  solveElapsed.value = Math.floor((Date.now() - start) / 1000)
                }
              }
              if (statusData.hasPartialResult !== undefined) {
                hasFeasibleSolution.value = statusData.hasPartialResult
              }
            }
          } catch {
            // status 接口调用异常，静默处理
          }
        }
      }
    }, 1000)

    // —— 运行期间定时持久化：每30秒保存一次，避免刷新时数据丢失 ——
    // 不依赖 beforeunload（该事件不可靠），主动定期写入 sessionStorage
    persistTimer = setInterval(() => {
      persistState()
    }, 30000)

    // 求解状态变更后立即持久化，确保刷新页面后仍能识别求解进行中
    persistState()
  }

  function pushLog(msg, type = 'prefix') {
    const time = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const ts = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`
    const log = { time: ts, message: msg }
    if (type === 'suffix') {
      frontendSuffixLogs.value.push(log)
    } else {
      frontendPrefixLogs.value.push(log)
    }
  }

  function stopSolve() {
    if (solveStatus.value !== 'running') return
    clearTimers()
    if (!hasFeasibleSolution.value) {
      solveStatus.value = 'stopped'
      pushLog('计算已被停止', 'suffix')
    } else if (!isOptimal.value) {
      solveStatus.value = 'stopped'
      pushLog('计算已被停止', 'suffix')
    } else {
      solveStatus.value = 'done'
    }
    persistState()
  }

  function finishSolve(optimal) {
    clearTimers()
    solveProgress.value = 100
    if (optimal) {
      isOptimal.value = true
      solveStatus.value = 'done'
      pushLog('已找到最优排产方案。', 'suffix')
    } else {
      solveStatus.value = 'stopped'
      pushLog('已达到最大求解时间。', 'suffix')
    }
    persistState()
  }

  function clearTimers() {
    if (pollTimer) clearInterval(pollTimer)
    if (logTimer) clearInterval(logTimer)
    if (elapsedTimer) clearInterval(elapsedTimer)
    if (persistTimer) clearInterval(persistTimer)
    pollTimer = null
    logTimer = null
    elapsedTimer = null
    persistTimer = null
  }

  /**
   * 恢复求解轮询（页面刷新后由模型求解页挂载时调用）
   * 仅当 solveStatus === 'running' 且 solveInfo 存在时生效，
   * 不重置进度和日志，仅重新启动定时器。
   */
  function resumePolling() {
    if (solveStatus.value !== 'running') return
    const sid = solveInfo.value?.solveTaskId
    if (!sid) return

    // 先清理可能残留的旧定时器，避免重复创建导致计时加速
    clearTimers()

    // 状态轮询：每 30 秒从后端拉取求解状态
    pollTimer = setInterval(async () => {
      if (solveStatus.value !== 'running') return
      try {
        const res = await getSolveTask({ solveTaskId: sid })
        const result = res?.data?.data
        if (res?.data?.success && result) {
          // 根据后端 startTime 更新运行时长（当前北京时间 - 任务开始时间）
          if (result.startTime) {
            const start = new Date(result.startTime).getTime()
            if (!isNaN(start)) {
              solveElapsed.value = Math.floor((Date.now() - start) / 1000)
            }
          }
          if (result.hasPartialResult !== undefined) {
            hasFeasibleSolution.value = result.hasPartialResult
          }
          const status = result.solveStatus
          if (status !== undefined && status !== 1) {
            if (status === 4) {
              stopSolve()
            } else {
              finishSolve(status === 2)
            }
          }
        }
      } catch {
        // 静默处理
      }
    }, 30000)

    // 日志轮询：每 30 秒从后端拉取最新求解日志
    logTimer = setInterval(async () => {
      if (solveStatus.value !== 'running') return
      try {
        const res = await getSolveTaskLogs({ solveTaskId: sid })
        const logs = res?.data?.data
        if (res?.data?.success && Array.isArray(logs) && logs.length > 0) {
          // 直接用最新获取的后端日志覆盖原有后端日志内容
          backendLogs.value = logs.map((log) => ({
            time: log.createTime ? log.createTime.slice(11, 19) : '',
            message: log.logContent || '',
          }))
          persistState()
        }
      } catch {
        // 静默处理
      }
    }, 30000)

    // 计时器
    elapsedTimer = setInterval(async () => {
      if (solveStatus.value !== 'running') return
      solveElapsed.value++
      // 超时自动停止（超过最大求解时间阈值）
      if (solveElapsed.value >= maxSolveTime.value) {
        // 先更新本地状态为已停止
        finishSolve(false)
        // finishSolve 完成后，按顺序调用 stop 接口和 status 接口
        const sid = solveInfo.value?.solveTaskId
        if (sid) {
          try {
            await stopSolveApi({ solveTaskId: sid })
          } catch {
            // stop 接口调用异常，不影响后续流程
          }
          try {
            const statusRes = await getSolveTask({ solveTaskId: sid })
            const statusData = statusRes?.data?.data
            if (statusRes?.data?.success && statusData) {
              if (statusData.startTime) {
                const start = new Date(statusData.startTime).getTime()
                if (!isNaN(start)) {
                  solveElapsed.value = Math.floor((Date.now() - start) / 1000)
                }
              }
              if (statusData.hasPartialResult !== undefined) {
                hasFeasibleSolution.value = statusData.hasPartialResult
              }
            }
          } catch {
            // status 接口调用异常，静默处理
          }
          try {
            const logsRes = await getSolveTaskLogs({ solveTaskId: sid })
            const logs = logsRes?.data?.data
            if (logsRes?.data?.success && Array.isArray(logs) && logs.length > 0) {
              // 超时停止前，用后端最新日志覆盖后端日志内容
              backendLogs.value = logs.map((log) => ({
                time: log.createTime ? log.createTime.slice(11, 19) : '',
                message: log.logContent || '',
              }))
              persistState()
            }
          } catch {
            // log 接口调用异常，静默处理
          }
        }
      }
    }, 1000)

    // 恢复定时持久化：页面刷新后继续每30秒保存一次
    persistTimer = setInterval(() => {
      persistState()
    }, 30000)
  }

  function getGoalLabel() {
    return OPTIMIZATION_GOALS.find((o) => o.value === optimizationGoal.value)?.label || ''
  }

  // 仅重置求解状态（不清除工作流和数据）
  function resetSolveState() {
    clearTimers()
    solveStatus.value = 'idle'
    solveProgress.value = 0
    frontendPrefixLogs.value = []
    backendLogs.value = []
    frontendSuffixLogs.value = []
    solveStartTime.value = null
    solveElapsed.value = 0
    hasFeasibleSolution.value = false
    isOptimal.value = false
    persistState()
  }

  // 重置整个工作流（重新开始）
  function resetAll() {
    clearTimers()
    currentStepIndex.value = 0
    maxVisitedStepIndex.value = 0
    clearUploadedFile()
    clearSession()
    solveStatus.value = 'idle'
    solveProgress.value = 0
    frontendPrefixLogs.value = []
    backendLogs.value = []
    frontendSuffixLogs.value = []
    solveStartTime.value = null
    solveElapsed.value = 0
    hasFeasibleSolution.value = false
    isOptimal.value = false
  }

  /**
   * 重置排产时间字段为默认值
   * 用于进入模型构建页时自动填充默认时间
   */
  function resetScheduleDefaults() {
    earliestStartTime.value = getDefaultEarliestStart()
    deadlineDate.value = getDefaultMonthEnd()
  }

  // —— 页面关闭/刷新前持久化最新数据 ——
  // 确保"总运行时长"（每秒更新）和"求解日志"在页面关闭前被完整保存
  const handleBeforeUnload = () => {
    // 仅在有缓存数据时持久化（避免写入空数据覆盖已有缓存）
    if (
      solveStatus.value !== 'idle' ||
      frontendPrefixLogs.value.length > 0 ||
      backendLogs.value.length > 0 ||
      frontendSuffixLogs.value.length > 0
    ) {
      persistState()
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload)
  }

  // 监听页面可见性变化：用户从后台标签页/最小化切回时，立即同步真实运行时长
  // 浏览器在后台会节流 setInterval，导致计时器更新不及时，切回时从后端获取精确时间
  const syncingElapsed = ref(false) // 切回同步中的 loading 状态
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || solveStatus.value !== 'running') return
      const sid = solveInfo.value?.solveTaskId
      if (!sid) return
      // 切回时标记 loading，等待后端返回后更新
      syncingElapsed.value = true
      getSolveTask({ solveTaskId: sid })
        .then((res) => {
          const result = res?.data?.data
          if (!res?.data?.success || !result) return
          // 1. 优先用 finishTime - startTime 计算精确时长（求解已结束的情况）
          if (result.startTime && result.finishTime) {
            const start = new Date(result.startTime).getTime()
            const end = new Date(result.finishTime).getTime()
            if (!isNaN(start) && !isNaN(end)) {
              solveElapsed.value = Math.floor((end - start) / 1000)
              // 已结束则直接同步状态，无需再走 finishSolve
              if (result.hasPartialResult !== undefined) {
                hasFeasibleSolution.value = result.hasPartialResult
              }
              if (result.solveStatus !== undefined && result.solveStatus !== 1) {
                if (result.solveStatus === 4) {
                  stopSolve()
                } else {
                  finishSolve(result.solveStatus === 2)
                }
              }
              return
            }
          }
          // 2. 无 finishTime（求解仍在进行），用 startTime 校准当前时长
          if (result.startTime) {
            const start = new Date(result.startTime).getTime()
            if (!isNaN(start)) {
              solveElapsed.value = Math.floor((Date.now() - start) / 1000)
            }
          }
          // 3. 检查后端是否已结束（前端因节流未及时捕获）
          if (result.hasPartialResult !== undefined) {
            hasFeasibleSolution.value = result.hasPartialResult
          }
          const status = result.solveStatus
          if (status !== undefined && status !== 1) {
            if (status === 4) {
              stopSolve()
            } else {
              finishSolve(status === 2)
            }
          }
        })
        .catch(() => {
          // 静默处理，保持原有显示
        })
        .finally(() => {
          syncingElapsed.value = false
        })
    })
  }

  return {
    // 步骤
    currentStepIndex,
    maxVisitedStepIndex,
    steps,
    currentStep,
    isFirstStep,
    isLastStep,
    goNext,
    goPrev,
    goToStep,
    // 上传
    uploadedFileName,
    uploadedFileRaw,
    taskRemark,
    taskInfo,
    setUploadedFile,
    setTaskInfo,
    clearUploadedFile,
    // 任务数据
    sheetDataMap,
    activeSheet,
    sheetNames,
    hasParsedData,
    totalRowCount,
    totalAnomalyCount,
    getSheetAnomalyCount,
    loadParsedData,
    loadApiSheetData,
    parseError,
    // 模型构建
    optimizationGoal,
    earliestStartTime,
    deadlineDate,
    maxSolveTime,
    solveTimeOptions,
    selectedGoalLabel,
    priority,
    maxProducTime,
    fileName,
    // 新结构配置：生产规则 + 人员容量
    productionMonth,
    continuousRunLimit,
    cleaningTimeLarge,
    cleaningTimeSmall,
    cleaningTimeRegular,
    shiftDays,
    shiftHours,
    morningShiftCapacity,
    eveningShiftCapacity,
    // 模型求解
    solveStatus,
    isSolving,
    solveProgress,
    solveLogs,
    backendLogs,
    solveStartTime,
    solveElapsed,
    syncingElapsed,
    solveInfo,
    hasFeasibleSolution,
    isOptimal,
    startSolve,
    stopSolve,
    finishSolve,
    resumePolling,
    getGoalLabel,
    // 重置
    resetSolveState,
    resetAll,
    resetScheduleDefaults,
  }
})
