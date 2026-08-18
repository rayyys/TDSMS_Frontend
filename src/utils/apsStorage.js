/**
 * APS 方案状态的 localStorage 持久化管理
 *
 * 特性：
 * - 页面刷新后方案列表（含未上传 Excel 的本地草稿）不丢失
 * - 各页面（APS 档案管理、数据上传）通过同一份数据保持一致
 *
 * 持久化范围：
 * - planList：方案列表 [{ id, name, isSaved }]
 * - activePlanId：当前选中的方案 id
 */

// localStorage 存储键
const APS_STORAGE_KEY = 'ivsms_aps_plan_state'
// 本地草稿方案表格数据的存储键（刷新后恢复已上传的 Excel 数据）
const APS_DRAFT_STATES_KEY = 'ivsms_aps_draft_states'

/**
 * 将 APS 方案状态保存到 localStorage
 * @param {Object} state { planList, activePlanId }
 */
export function saveApsState(state) {
  try {
    localStorage.setItem(APS_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 忽略存储失败（如超出 localStorage 容量限制），不影响页面功能
  }
}

/**
 * 从 localStorage 读取 APS 方案状态
 * @returns {Object|null} 恢复的状态对象，无缓存或解析失败时返回 null
 */
export function loadApsState() {
  try {
    const raw = localStorage.getItem(APS_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 清空 localStorage 中的 APS 方案状态
 */
export function clearApsState() {
  try {
    localStorage.removeItem(APS_STORAGE_KEY)
  } catch {
    /* 忽略 */
  }
}

/**
 * 将本地草稿方案的表格数据保存到 localStorage（按方案 id 分组）
 * @param {Object} states { [planId]: { tableData, uploadedFileName, hasImported } }
 */
export function saveApsDraftStates(states) {
  try {
    localStorage.setItem(APS_DRAFT_STATES_KEY, JSON.stringify(states))
  } catch {
    // 忽略存储失败（如超出 localStorage 容量限制），不影响页面功能
  }
}

/**
 * 从 localStorage 读取本地草稿方案的表格数据
 * @returns {Object|null} 草稿状态集合，无缓存或解析失败时返回 null
 */
export function loadApsDraftStates() {
  try {
    const raw = localStorage.getItem(APS_DRAFT_STATES_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 清空 localStorage 中的草稿表格数据（退出登录时调用，防止账号间串用）
 */
export function clearApsDraftStates() {
  try {
    localStorage.removeItem(APS_DRAFT_STATES_KEY)
  } catch {
    /* 忽略 */
  }
}
