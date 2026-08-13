import request from './request'

/**
 * 调度相关 API 接口
 */

// ========== 用户认证模块 ==========

/**
 * 用户登录
 * @param {Object} payload { username, password }
 * @returns {Promise}
 */
export function login(payload) {
  return request({
    method: 'post',
    url: '/user/login/',
    data: payload,
  })
}

/**
 * 用户退出登录
 * @param {Object} payload
 * @returns {Promise}
 */
export function logout(payload) {
  return request({
    method: 'post',
    url: '/user/logout/',
    data: payload,
  })
}

// ========== 数据上传模块 ==========

/**
 * 下载 Excel 模板
 * @returns {Promise}
 */
export function downloadExcelTemplate() {
  return request({
    method: 'get',
    url: '/tasks/download',
    responseType: 'blob',
  })
}

/**
 * 查询历史上传记录
 * @param {Object} params { pageNum, pageSize, keyword, status }
 * @returns {Promise}
 */
export function getHistoryUploadRecords(params) {
  return request({
    method: 'get',
    url: '/tasks/historyQuery',
    params,
  })
}

/**
 * 上传排程数据文件
 * @param {FormData} formData { file, remark }
 * @returns {Promise}
 */
export function uploadScheduleFile(formData) {
  return request({
    method: 'post',
    url: '/tasks/upload',
    data: formData,
    // 上传 FormData 时不手动设置 Content-Type，由浏览器自动补全 boundary
    // 否则后端无法正确解析 multipart 文件字段，会导致 400 文件格式错误
    headers: { 'Content-Type': undefined },
  })
}

/**
 * 历史记录导入（复用历史排程任务数据）
 * @param {Object} payload { sourceTaskId }
 * @returns {Promise}
 */
export function historyImport(payload) {
  return request({
    method: 'post',
    url: '/tasks/historyImport',
    data: payload,
  })
}

/**
 * 历史记录删除（逻辑删除）
 * @param {Object} payload { taskId }
 * @returns {Promise}
 */
export function deleteHistoryRecord(payload) {
  return request({
    method: 'post',
    url: '/tasks/historyDelete',
    data: payload,
  })
}

// ========== Excel 数据展示模块 ==========

/**
 * 查询 Excel 文件数据
 * @param {Object} data { taskId, mode, page, pageSize, onlyAbnormal, keyword }
 * @returns {Promise}
 */
export function getExcelData(data) {
  return request({
    method: 'get',
    url: '/tasks/excelShow',
    params: data,
  })
}

// ========== APS 排产信息档案模块 ==========

/**
 * 查询 APS 排产信息档案方案列表
 * @returns {Promise} data: [{ id, name }]
 */
export function getApsArchiveList() {
  return request({
    method: 'get',
    url: '/aps/archive/list',
  })
}

/**
 * 保存 APS 排产信息档案
 * 服务端会执行「品种」唯一性校验；若重复，则按品种分组排序并将新增行移至分组最下方
 * @param {Object} payload { planId, rows, newRowIndex }
 * @returns {Promise} data: { rows, duplicate, newRowIndex }
 */
export function saveApsArchive(payload) {
  return request({
    method: 'post',
    url: '/aps/archive/save',
    data: payload,
  })
}

// ========== 工作流步骤提交 ==========

/**
 * 提交数据上传步骤（步骤 1 → 2）
 * @param {Object} payload { fileName, sheetNames, totalRowCount, taskRemark }
 * @returns {Promise}
 */
export function submitDataUpload(payload) {
  return request({
    method: 'post',
    url: '/tasks/upload',
    data: payload,
  })
}

/**
 * 提交模型构建配置（步骤 3 → 4）
 * @param {Object} payload { optimizationGoal, earliestStartTime, deadlineDate, maxSolveTime }
 * @returns {Promise}
 */
export function submitModelConfig(payload) {
  return request({
    method: 'post',
    url: '/scheduling/model-build/',
    data: payload,
  })
}

// ========== 模型求解模块 ==========

/**
 * 提交模型求解（启动算法求解）
 * @param {Object} payload { taskId, objectiveWeight, orderStartTime, dueTime, maxSolveTime }
 * @returns {Promise}
 */
export function submitModelSolve(payload) {
  return request({
    method: 'post',
    url: '/solves/start',
    data: payload,
  })
}

/**
 * 查询求解状态
 * @param {Object} params { solveId }
 * @returns {Promise}
 */
export function getSolveStatus(params) {
  return request({
    method: 'get',
    url: '/solves/status',
    params,
  })
}

/**
 * 查询求解日志
 * @param {Object} params { solveId }
 * @returns {Promise}
 */
export function getSolveLogs(params) {
  return request({
    method: 'get',
    url: '/solves/logs',
    params,
  })
}

/**
 * 查询求解参数信息
 * @param {Object} params { solveId }
 * @returns {Promise}
 */
export function getSolveParamInfo(params) {
  return request({
    method: 'get',
    url: '/solves/paramInfo',
    params,
  })
}

/**
 * 获取最大生产时间
 * @param {Object} params { fileId }
 * @returns {Promise}
 */
export function getProducTime(params) {
  return request({
    method: 'get',
    url: '/solves/producTime',
    params,
  })
}

/**
 * 停止求解
 * @param {Object} payload { solveId }
 * @returns {Promise}
 */
export function stopSolve(payload) {
  return request({
    method: 'post',
    url: '/solves/stop',
    data: payload,
  })
}

/**
 * 导出求解结果 Excel
 * @param {Object} params { solveId }
 * @returns {Promise}
 */
export function exportSolveResult(params) {
  return request({
    method: 'post',
    url: '/solves/resultExport',
    data: params,
    responseType: 'blob',
  })
}

// ========== 测试用户管理模块 ==========

/**
 * 创建测试用户
 * @param {Object} payload { username, password, validDays }
 * @returns {Promise}
 */
export function createTestUser(payload) {
  return request({
    method: 'post',
    url: '/admin/create',
    data: payload,
  })
}

/**
 * 查询测试用户列表
 * @param {Object} data { page, pageSize }
 * @returns {Promise}
 */
export function getTestUserList(params) {
  return request({
    method: 'get',
    url: '/admin/query',
    params,
  })
}

/**
 * 更新测试用户有效期
 * @param {Object} payload { userId, validDays }
 * @returns {Promise}
 */
export function updateTestUserValidity(payload) {
  return request({
    method: 'post',
    url: '/admin/expireUpdate',
    data: payload,
  })
}

/**
 * 启用或停用测试用户
 * @param {Object} payload { userId, isActive }
 * @returns {Promise}
 */
export function toggleTestUserStatus(payload) {
  return request({
    method: 'post',
    url: '/scheduling/test-user/toggle-status/',
    data: payload,
  })
}

/**
 * 启用或停用测试用户（新接口）
 * @param {Object} payload { userId, status }  status: 0=停用, 1=启用
 * @returns {Promise}
 */
export function updateUserStatus(payload) {
  return request({
    method: 'post',
    url: '/admin/statusUpdate',
    data: payload,
  })
}

// ========== 提交排程结果（完成排程） ==========

/**
 * 提交排程结果（最后一步：完成排程）
 * @param {Object} payload { solveStatus, solveElapsed, isOptimal }
 * @returns {Promise}
 */
export function submitScheduleResult(payload) {
  return request({
    method: 'post',
    url: '/scheduling/result/',
    data: payload,
  })
}

/**
 * 提交整个排程任务（一次性提交所有步骤数据）
 * @param {Object} payload { sheetData, modelConfig, solveResult }
 * @returns {Promise}
 */
export function submitFullSchedule(payload) {
  return request({
    method: 'post',
    url: '/scheduling/submit/',
    data: payload,
  })
}
