/**
 * 基于 sessionStorage 的状态持久化管理
 *
 * 特性：
 * - 刷新页面后数据保留（sessionStorage 在同一标签页/会话内有效）
 * - 关闭页面（标签页）后自动清空，无需手动监听 beforeunload
 *
 * 持久化范围：
 * - 任务数据：sheetDataMap、activeSheet、taskInfo、uploadedFileName、taskRemark
 * - 模型构建：optimizationGoal、earliestStartTime、deadlineDate、maxSolveTime、priority
 * - 模型求解：solveStatus、solveInfo、frontendPrefixLogs、backendLogs、frontendSuffixLogs、solveElapsed
 * - 工作流步骤：currentStepIndex、maxVisitedStepIndex
 */

// sessionStorage 存储键
const SESSION_STORAGE_KEY = 'ivsms_scheduling_state'

/**
 * 将状态保存到 sessionStorage
 * @param {Object} state 需要持久化的状态快照
 */
export function saveToSession(state) {
  try {
    const payload = {
      // 工作流步骤
      currentStepIndex: state.currentStepIndex,
      maxVisitedStepIndex: state.maxVisitedStepIndex,
      // 数据上传
      uploadedFileName: state.uploadedFileName,
      taskRemark: state.taskRemark,
      taskInfo: state.taskInfo,
      // 任务数据
      activeSheet: state.activeSheet,
      // sheetDataMap：保存 columns + rows + annotated（异常由后端提供）
      sheetDataMap: Object.fromEntries(
        Object.entries(state.sheetDataMap).map(([k, v]) => [
          k,
          { columns: v.columns, rows: v.rows, annotated: v.annotated },
        ]),
      ),
      // 模型构建配置
      optimizationGoal: state.optimizationGoal,
      earliestStartTime: state.earliestStartTime,
      deadlineDate: state.deadlineDate,
      maxSolveTime: state.maxSolveTime,
      priority: state.priority,
      // 模型求解状态（刷新后恢复求解界面，重启轮询）
      solveStatus: state.solveStatus,
      solveInfo: state.solveInfo,
      // 模型求解缓存数据（"总运行时长"和"求解日志"，页面关闭后自动清空）
      frontendPrefixLogs: state.frontendPrefixLogs,
      backendLogs: state.backendLogs,
      frontendSuffixLogs: state.frontendSuffixLogs,
      solveElapsed: state.solveElapsed,
    }
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // 忽略存储失败（如超出 sessionStorage 容量限制）
  }
}

/**
 * 从 sessionStorage 读取已持久化的状态
 * @returns {Object|null} 恢复的状态对象，无缓存时返回 null
 */
export function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 清空 sessionStorage 中的调度状态
 */
export function clearSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
}
