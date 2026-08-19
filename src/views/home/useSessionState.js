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
// 主键：轻量状态（步骤、上传信息、模型配置、求解状态、日志等），任意变化都会写入
const SESSION_STORAGE_KEY = 'ivsms_scheduling_state'
// 数据键：任务数据 sheetDataMap（数据量大），仅在数据真实变化时写入，
// 避免步骤切换/配置变更等场景重复序列化全量数据导致主线程卡顿
const SHEET_DATA_STORAGE_KEY = 'ivsms_scheduling_sheetdata'

/**
 * 将状态保存到 sessionStorage
 * - 轻量状态（步骤、上传信息、模型配置、求解状态、日志等）写入主键
 * - 仅当快照携带 sheetDataMap（任务数据真实变化）时，才单独序列化写入数据键；
 *   跳转步骤、修改配置、求解状态变化等场景不传 sheetDataMap，只更新主键
 * @param {Object} state 需要持久化的状态快照
 */
export function saveToSession(state) {
  try {
    // 剥离 sheetDataMap 后仅序列化轻量字段，避免全量序列化大数据
    const { sheetDataMap, ...meta } = state
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(meta))
    // 任务数据真实变化时才写入数据键（含 columns + rows + annotated，异常由后端提供）
    if (sheetDataMap) {
      const payload = Object.fromEntries(
        Object.entries(sheetDataMap).map(([k, v]) => [
          k,
          { columns: v.columns, rows: v.rows, annotated: v.annotated },
        ]),
      )
      sessionStorage.setItem(SHEET_DATA_STORAGE_KEY, JSON.stringify(payload))
    }
  } catch {
    // 忽略存储失败（如超出 sessionStorage 容量限制）
  }
}

/**
 * 从 sessionStorage 读取已持久化的状态（合并主键 + 数据键）
 * @returns {Object|null} 恢复的状态对象，无缓存时返回 null
 */
export function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    const sheetRaw = sessionStorage.getItem(SHEET_DATA_STORAGE_KEY)
    if (!raw && !sheetRaw) return null
    const state = raw ? JSON.parse(raw) : {}
    if (sheetRaw) {
      state.sheetDataMap = JSON.parse(sheetRaw)
    }
    return state
  } catch {
    return null
  }
}

/**
 * 清空 sessionStorage 中的调度状态（主键 + 数据键）
 */
export function clearSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
  sessionStorage.removeItem(SHEET_DATA_STORAGE_KEY)
}
