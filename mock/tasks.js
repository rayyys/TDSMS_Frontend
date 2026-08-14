/**
 * 数据获取/上传模块 Mock（无后端时前端联调用）
 * 对齐接口文档：
 *  - GET  /task/template        下载 Excel 模板（返回 xlsx 文件流）
 *  - GET  /task/historyQuery    查询历史上传记录（分页）
 *  - POST /task/import          上传计划文件（mock 默认返回 docs 模板解析信息）
 *  - POST /tasks/historyImport  历史记录导入
 *  - POST /task/delete          历史记录删除
 *  - GET  /task/detailQuery     查询任务导入明细（分页，默认返回 docs 模板数据）
 * 注意：响应函数需为同步函数，延迟用 timeout 字段控制。
 */
// 注意：xlsx 为 CommonJS 包，vite-plugin-mock 经 esbuild 打包后，
// `import * as XLSX` 的命名空间缺少 readFile 等方法，必须使用默认导入才能拿到完整 API
import XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

let taskSeq = 1000
let importSeq = 10000
function nextTaskId() {
  return `TASK${taskSeq++}`
}
function nextImportId() {
  return importSeq++
}

// 历史上传记录样例
const historyRecords = [
  { taskId: 'TASK1001', fileName: '7月生产排程数据.xlsx', taskRemark: '7月常规排程', uploadTime: '2026-08-05 10:20:30', status: 'success' },
  { taskId: 'TASK1002', fileName: '8月第一周排程.xlsx', taskRemark: '周度排程', uploadTime: '2026-08-08 14:02:11', status: 'success' },
  { taskId: 'TASK1003', fileName: '急单插单数据.xlsx', taskRemark: '插单测试', uploadTime: '2026-08-10 09:45:00', status: 'success' },
]

// ============ 默认模板文件（docs/药业车间分解编排计划表模板.xlsx） ============
// mock 运行于 Node 环境可直接读取磁盘文件；无后端时作为「进入上传页自动导入」的数据源，
// 同时供任务数据页（/task/detailQuery）作为默认展示内容。
const DEFAULT_TEMPLATE_NAME = '药业车间分解编排计划表模板.xlsx'

// 表头中文 → 任务数据页字段名映射（与 useTaskData 的 TABLE_COLUMNS 对齐）
const HEADER_FIELD_MAP = {
  部门: 'department',
  物料编码: 'materialCode',
  存货名称: 'materialName',
  规格: 'specification',
  'U8现存量': 'u8Stock',
  '07月份生产计划': 'monthlyPlan',
  提报合计: 'submitTotal',
}

// 解析后的默认任务明细行（第一行为表头，其余为数据）
let defaultTaskRows = []
try {
  const templatePath = path.join(process.cwd(), 'docs', DEFAULT_TEMPLATE_NAME)
  if (fs.existsSync(templatePath)) {
    const wb = XLSX.readFile(templatePath)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    if (rows.length > 0) {
      const header = rows[0].map((h) => String(h).trim())
      // 按表头映射为业务字段，并过滤全空行（如模板末尾的空行），避免表格出现无意义空白行
      defaultTaskRows = rows
        .slice(1)
        .map((r) => {
          const row = {}
          header.forEach((h, idx) => {
            const field = HEADER_FIELD_MAP[h]
            if (field) row[field] = r[idx]
          })
          return row
        })
        .filter((row) =>
          Object.values(HEADER_FIELD_MAP).some((k) => row[k] !== '' && row[k] != null),
        )
        .map((row, i) => ({ rowNo: i + 1, ...row }))
    }
  }
} catch (e) {
  // 模板缺失或解析失败时静默，detailQuery 返回空数据
}

export default [
  // 下载 Excel 模板（返回 xlsx 文件流）
  {
    url: '/tdsms/task/template',
    method: 'get',
    rawResponse(req, res) {
      // 优先返回磁盘上的默认模板文件，保证下载与上传/展示的数据一致
      const templatePath = path.join(process.cwd(), 'docs', DEFAULT_TEMPLATE_NAME)
      if (fs.existsSync(templatePath)) {
        const buffer = fs.readFileSync(templatePath)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        // 注意：Content-Disposition 文件名需为 ASCII，Node 的 HTTP 层会拒绝含中文的原始头值
        res.setHeader('Content-Disposition', 'attachment; filename=schedule-template.xlsx')
        res.end(buffer)
        return
      }
      // 兜底：动态生成一个简易模板
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.aoa_to_sheet([
        ['部门', '物料编码', '存货名称', '规格', 'U8现存量', '07月份生产计划', '提报合计'],
        ['302车间', 2001000114, '示例药品', '2g/支', 5566400, 3000000, 3000000],
      ])
      XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', 'attachment; filename=schedule-template.xlsx')
      res.end(buffer)
    },
  },
  // 查询历史上传记录（分页）
  {
    url: '/tdsms/task/historyQuery',
    method: 'get',
    timeout: 400,
    response: ({ query }) => {
      const { pageNum = 1, pageSize = 10, keyword = '', status = '' } = query || {}
      let list = historyRecords
      if (keyword) {
        const kw = String(keyword).toLowerCase()
        list = list.filter(
          (r) =>
            r.fileName.toLowerCase().includes(kw) || (r.taskRemark || '').toLowerCase().includes(kw),
        )
      }
      if (status) {
        list = list.filter((r) => r.status === status)
      }
      const start = (Number(pageNum) - 1) * Number(pageSize)
      const records = list.slice(start, start + Number(pageSize))
      return {
        success: true,
        code: 0,
        message: 'success',
        data: { total: list.length, pageNum: Number(pageNum), pageSize: Number(pageSize), records },
      }
    },
  },
  // 上传计划文件（mock 环境下默认返回模板文件解析信息，供前端自动导入）
  {
    url: '/tdsms/task/import',
    method: 'post',
    timeout: 1500,
    response: ({ body }) => {
      const importId = nextImportId()
      return {
        success: true,
        code: 200,
        message: '计划文件导入成功',
        data: {
          importId,
          originalFileName: DEFAULT_TEMPLATE_NAME,
          apsArchive: null,
          remark: body?.remark || '',
          dataCount: defaultTaskRows.length,
          importStatus: 1,
          errorMessage: null,
          createdBy: 1,
          createTime: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
          updateTime: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        },
      }
    },
  },
  // 历史记录导入（复用历史排程任务数据）
  {
    url: '/tdsms/tasks/historyImport',
    method: 'post',
    timeout: 1000,
    response: ({ body }) => {
      const { taskId } = body || {}
      const src = historyRecords.find((r) => r.taskId === taskId) || historyRecords[0]
      return {
        success: true,
        code: 0,
        message: '导入成功',
        data: {
          taskId: nextTaskId(),
          fileId: `FILE${nextTaskId()}`,
          fileName: src.fileName,
          taskRemark: src.taskRemark || '',
          uploadTime: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        },
      }
    },
  },
  // 历史记录删除（逻辑删除）
  {
    url: '/tdsms/task/delete',
    method: 'post',
    timeout: 400,
    response: () => {
      return { success: true, code: 0, message: '删除成功', data: {} }
    },
  },
  // 查询任务导入明细（分页，mock 默认返回 docs 模板解析数据）
  {
    url: '/tdsms/task/detailQuery',
    method: 'get',
    timeout: 400,
    response: ({ query }) => {
      const { importId, page = 1, pageSize = 10, keyword = '' } = query || {}
      let rows = defaultTaskRows
      // 关键字过滤：模糊匹配所有业务字段
      if (keyword) {
        const kw = String(keyword).toLowerCase()
        rows = rows.filter((r) =>
          Object.entries(r).some(
            ([k, v]) => k !== 'rowNo' && String(v ?? '').toLowerCase().includes(kw),
          ),
        )
      }
      const total = rows.length
      const start = (Number(page) - 1) * Number(pageSize)
      const records = rows.slice(start, start + Number(pageSize))
      return { success: true, code: 0, message: 'success', data: { total, records } }
    },
  },
]
