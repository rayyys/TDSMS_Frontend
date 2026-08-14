/**
 * APS 排产信息档案 Mock（无后端时前端联调用）
 * 对齐接口文档：
 *  - GET  /aps/listQuery  查询当前用户方案列表（数据上传页下拉框数据源）
 *  - POST /aps/create     新建方案（上传 Excel，后端解析）
 * 注意：响应函数需为同步函数，延迟用 timeout 字段控制。
 */

// 模拟后端持久化的 APS 方案列表（archiveId 为后端主键）
const archivePlans = [
  {
    archiveId: 1,
    archiveName: '方案一',
    createTime: '2026-08-01 10:00:00',
    updateTime: '2026-08-01 10:00:00',
  },
  {
    archiveId: 2,
    archiveName: '方案二',
    createTime: '2026-08-02 10:00:00',
    updateTime: '2026-08-02 10:00:00',
  },
  {
    archiveId: 3,
    archiveName: '方案三',
    createTime: '2026-08-03 10:00:00',
    updateTime: '2026-08-03 10:00:00',
  },
]

// 自增 id 游标，模拟后端主键生成
let nextArchiveId = 4

export default [
  // 查询 APS 排产信息档案方案列表（数据上传页下拉框数据源）
  {
    url: '/tdsms/aps/listQuery',
    method: 'get',
    timeout: 400,
    response: () => {
      return {
        success: true,
        code: 0,
        message: 'success',
        data: archivePlans,
      }
    },
  },
  // 新建 APS 方案（上传 Excel 文件，后端解析）
  {
    url: '/tdsms/aps/create',
    method: 'post',
    timeout: 600,
    response: ({ body }) => {
      // body 为 FormData 解析后的对象（file 文件流无法在 mock 中解析，仅取 archiveName）
      const archiveName = String(body?.archiveName || '未命名方案')
      const archive = {
        archiveId: nextArchiveId++,
        archiveName,
        sourceFileName: 'mock-upload.xlsx',
        dataCount: 0,
      }
      // 追加到列表，便于下次进入下拉框时看到新建的方案
      archivePlans.push(archive)
      return {
        success: true,
        code: 0,
        message: '保存成功',
        data: archive,
      }
    },
  },
]
