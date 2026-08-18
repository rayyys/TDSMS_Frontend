import request from './request'

/**
 * 调度相关 API 接口
 * 所有接口路径及参数均依据《片剂药物智能排程系统》接口文档定义
 */

// ========== APS 排产信息档案模块 ==========

/**
 * 下载 APS 排产信息模板
 * GET /aps/template
 * @returns {Promise} Excel 文件流
 */
export function downloadApsTemplate() {
  return request({
    method: 'get',
    url: '/aps/template',
    responseType: 'blob',
  })
}

/**
 * 查询当前用户的 APS 方案列表
 * GET /aps/listQuery
 * 仅返回当前登录用户创建的未删除方案
 * @returns {Promise} data: [{ archiveId, archiveName, createTime, updateTime }]
 */
export function getApsArchiveList() {
  return request({
    method: 'get',
    url: '/aps/listQuery',
  })
}

/**
 * 查询 APS 方案明细
 * GET /aps/infoQuery
 * @param {Object} params { archiveId, keyword }
 * @returns {Promise} data: { total, records: [...] }
 */
export function getApsArchiveItems(params) {
  return request({
    method: 'get',
    url: '/aps/infoQuery',
    params,
  })
}

/**
 * 新建 APS 方案（上传 Excel 文件，后端解析）
 * POST /aps/create
 * @param {FormData} formData { archiveName: string, file: File }
 * @returns {Promise} data: { archiveId, archiveName, sourceFileName, dataCount, ... }
 */
export function createApsArchive(formData) {
  return request({
    method: 'post',
    url: '/aps/create',
    data: formData,
    // 上传 FormData 时不手动设置 Content-Type，由浏览器自动补全 boundary
    headers: { 'Content-Type': undefined },
  })
}

/**
 * 删除 APS 方案（逻辑删除，仅能删除自己的方案）
 * POST /aps/delete
 * @param {Object} params { archiveId }
 * @returns {Promise}
 */
export function deleteApsArchive(params) {
  return request({
    method: 'post',
    url: '/aps/delete',
    params,
  })
}

/**
 * 新增 APS 明细（前端点击"新增数据行"填写完成保存时调用）
 * POST /aps/itemCreate
 * @param {Object} data { archiveId, productName, packageSpecification, mixingLine, mixingBatchQuantity, ... }
 * @returns {Promise} data: { itemId, archiveId, productName, ... }
 */
export function createApsArchiveItem(data) {
  return request({
    method: 'post',
    url: '/aps/itemCreate',
    data,
  })
}

/**
 * 删除 APS 明细（支持「按品种批量删除」与「单条精确删除」两种模式，软删除）
 * POST /aps/itemDelete
 * - batchMode=true 时按品种软删除：productNames 传待删品种名列表，同一品种下所有未删除的
 *   包装规格与设备明细一并删除；itemId 不使用传空（null）
 * - batchMode=false 时精确删除单条：itemId 传明细主键；productNames 不使用传空（[]）
 * @param {Object} data { archiveId, batchMode, itemId, productNames }
 * @returns {Promise} data: { deletedProductCount, deletedItemCount, productNames }
 */
export function batchDeleteApsArchiveItems(data) {
  return request({
    method: 'post',
    url: '/aps/itemDelete',
    data,
  })
}

/**
 * 导出 APS 档案 Excel（全部未删除明细，不受页面模糊搜索条件影响）
 * GET /aps/export
 * @param {Object} params { archiveId }
 * @returns {Promise} Excel 文件流
 */
export function exportApsArchive(params) {
  return request({
    method: 'get',
    url: '/aps/export',
    params,
    responseType: 'blob',
  })
}

// ========== 任务上传模块 ==========

/**
 * 下载药业车间分解编排计划模板
 * GET /task/template
 * @returns {Promise} Excel 文件流
 */
export function downloadTaskTemplate() {
  return request({
    method: 'get',
    url: '/task/template',
    responseType: 'blob',
  })
}

/**
 * 查询历史记录
 * GET /task/historyQuery
 * @param {Object} params { page, pageSize }
 * @returns {Promise}
 */
export function getTaskHistory(params) {
  return request({
    method: 'get',
    url: '/task/historyQuery',
    params,
  })
}

/**
 * 删除历史记录（逻辑删除，仅能删除自己的记录）
 * POST /task/delete
 * @param {Object} params { importId }
 * @returns {Promise}
 */
export function deleteTaskHistory(params) {
  return request({
    method: 'post',
    url: '/task/delete',
    params,
  })
}

/**
 * 导入历史记录（基于历史任务复制生成新排程任务）
 * POST /tasks/historyImport
 * @param {Object} data { taskId }
 * @returns {Promise} data: { taskId, taskNo, taskName, ... }
 */
export function historyImportTask(data) {
  return request({
    method: 'post',
    url: '/tasks/historyImport',
    data,
  })
}

/**
 * 导入车间计划并新建任务（上传 Excel 文件，后端解析）
 * POST /task/import
 * 必须同时选择 APS 方案并上传 .xlsx 或 .xls 计划文件
 * @param {FormData} formData { apsArchiveId, remark, file }
 * @returns {Promise} data: { importId, originalFileName, apsArchive, remark, dataCount, ... }
 */
export function importTask(formData) {
  return request({
    method: 'post',
    url: '/task/import',
    data: formData,
    headers: { 'Content-Type': undefined },
  })
}

// ========== 数据展示模块 ==========

/**
 * 查询计划明细（已解析并保存到数据库的药业车间分解编排计划明细）
 * GET /task/detailQuery
 * @param {Object} params { importId, page, pageSize, keyword }
 * @returns {Promise}
 */
export function getTaskDetail(params) {
  return request({
    method: 'get',
    url: '/task/detailQuery',
    params,
  })
}

// ========== 模型求解模块 ==========

/**
 * 创建并开始求解任务
 * POST /solve/start
 * 后端根据 importId 读取任务数据，创建求解任务后异步调用算法服务
 * @param {Object} data { importId, scheduleMonth, productionRules, personnelCapacity, solverTimeLimitMinutes }
 * @returns {Promise} data: { solveTaskId, importId, solveStatus, progress, createTime }
 */
export function startSolveTask(data) {
  return request({
    method: 'post',
    url: '/solve/start',
    data,
  })
}

/**
 * 查询求解任务状态和结果
 * GET /solve/query
 * 前端创建求解任务后定时调用，只能查询当前用户创建的求解任务
 * @param {Object} params { solveTaskId }
 * @returns {Promise} data: { solveTaskId, importId, inputParams, solveStatus, finishReason, startTime, finishTime, createTime }
 */
export function getSolveTask(params) {
  return request({
    method: 'get',
    url: '/solve/query',
    params,
  })
}

/**
 * 查询求解日志（按日志 ID 增量查询）
 * GET /solve/logs
 * 首次传 afterLogId=0，后续传上一次返回的 lastLogId，只获取新增日志
 * @param {Object} params { solveTaskId, afterLogId }
 * @returns {Promise} data: [{ logId, logContent, createTime }]
 */
export function getSolveTaskLogs(params) {
  return request({
    method: 'get',
    url: '/solve/logs',
    params,
  })
}

/**
 * 停止求解（停止等待中或正在运行的求解任务）
 * POST /solve/stop
 * @param {Object} data { solveTaskId }
 * @returns {Promise}
 */
export function stopSolveTask(data) {
  return request({
    method: 'post',
    url: '/solve/stop',
    data,
  })
}

/**
 * 导出求解结果 Excel
 * POST /solve/result
 * 求解成功时导出最终结果；用户停止且存在局部结果时可导出局部结果
 * @param {Object} data { solveTaskId }
 * @returns {Promise} Excel 文件流
 */
export function exportSolveTaskResult(data) {
  return request({
    method: 'post',
    url: '/solve/result',
    data,
    responseType: 'blob',
  })
}

// ========== 测试用户管理模块 ==========

/**
 * 创建测试用户
 * POST /admin/create
 * @param {Object} payload { username, password, validDays, realName, departmentName }
 * @returns {Promise} data: { userId, username, status, expireTime, remainingDays }
 */
export function createTestUser(payload) {
  return request({
    method: 'post',
    url: '/admin/create',
    data: payload,
  })
}

/**
 * 查询测试用户列表（分页查询，支持账号模糊查询）
 * GET /admin/query
 * @param {Object} params { page, pageSize }
 * @returns {Promise} data: { total, page, pageSize, records: [...] }
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
 * POST /admin/expireUpdate
 * @param {Object} payload { userId, validDays }
 * @returns {Promise} data: { userId, username, status, expireTime, remainingDays }
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
 * POST /admin/statusUpdate
 * @param {Object} payload { userId, status }  status: 0=停用, 1=启用
 * @returns {Promise} data: { userId, username, status, expireTime, remainingDays }
 */
export function updateUserStatus(payload) {
  return request({
    method: 'post',
    url: '/admin/statusUpdate',
    data: payload,
  })
}
