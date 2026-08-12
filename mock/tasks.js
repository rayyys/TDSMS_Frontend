/**
 * 数据获取/上传模块 Mock（无后端时前端联调用）
 * 覆盖：模板下载 / 历史上传记录 / 文件上传 / 历史导入 / 历史删除 / Excel 数据展示
 * 注意：响应函数需为同步函数，延迟用 timeout 字段控制。
 */
import * as XLSX from 'xlsx'

let taskSeq = 1000
function nextTaskId() {
  return `TASK${taskSeq++}`
}

// 历史上传记录样例
const historyRecords = [
  { taskId: 'TASK1001', fileName: '7月生产排程数据.xlsx', taskRemark: '7月常规排程', uploadTime: '2026-08-05 10:20:30', status: 'success' },
  { taskId: 'TASK1002', fileName: '8月第一周排程.xlsx', taskRemark: '周度排程', uploadTime: '2026-08-08 14:02:11', status: 'success' },
  { taskId: 'TASK1003', fileName: '急单插单数据.xlsx', taskRemark: '插单测试', uploadTime: '2026-08-10 09:45:00', status: 'success' },
]

// ============ Excel 数据展示样例（各 mode 与前端 TABLE_COLUMNS_MAP 列名对齐） ============
const excelDataMap = {
  pendingOrderInfo: [
    { id: 1, rowNo: 1, orderSeq: 1, documentNo: 'PO20260811001', customerName: '华东轮胎销售公司', customerLevel: 'A', materialCode: 'MAT001', quantity: 120, startWorkDate: '2026-08-11', dueDate: '2026-08-15', factory: '上海工厂', isAbnormal: false, abnormalReason: '' },
    { id: 2, rowNo: 2, orderSeq: 2, documentNo: 'PO20260811002', customerName: '华南汽配集团', customerLevel: 'B', materialCode: 'MAT002', quantity: 80, startWorkDate: '2026-08-11', dueDate: '2026-08-14', factory: '广州工厂', isAbnormal: true, abnormalReason: '交货日期早于开工日期' },
    { id: 3, rowNo: 3, orderSeq: 3, documentNo: 'PO20260811003', customerName: '西南工程机械', customerLevel: 'A', materialCode: 'MAT003', quantity: 200, startWorkDate: '2026-08-12', dueDate: '2026-08-18', factory: '重庆工厂', isAbnormal: false, abnormalReason: '' },
    { id: 4, rowNo: 4, orderSeq: 4, documentNo: 'PO20260811004', customerName: '北方重工', customerLevel: 'C', materialCode: 'MAT001', quantity: 60, startWorkDate: '2026-08-12', dueDate: '2026-08-16', factory: '天津工厂', isAbnormal: false, abnormalReason: '' },
    { id: 5, rowNo: 5, orderSeq: 5, documentNo: 'PO20260811005', customerName: '长三角物流', customerLevel: 'B', materialCode: 'MAT004', quantity: 150, startWorkDate: '2026-08-13', dueDate: '2026-08-17', factory: '上海工厂', isAbnormal: true, abnormalReason: '数量为0' },
    { id: 6, rowNo: 6, orderSeq: 6, documentNo: 'PO20260811006', customerName: '海外贸易公司', customerLevel: 'A', materialCode: 'MAT002', quantity: 90, startWorkDate: '2026-08-13', dueDate: '2026-08-19', factory: '宁波工厂', isAbnormal: false, abnormalReason: '' },
    { id: 7, rowNo: 7, orderSeq: 7, documentNo: 'PO20260811007', customerName: '顺达汽配', customerLevel: 'B', materialCode: 'MAT005', quantity: 110, startWorkDate: '2026-08-14', dueDate: '2026-08-18', factory: '广州工厂', isAbnormal: false, abnormalReason: '' },
    { id: 8, rowNo: 8, orderSeq: 8, documentNo: 'PO20260811008', customerName: '华中商贸', customerLevel: 'C', materialCode: 'MAT003', quantity: 70, startWorkDate: '2026-08-14', dueDate: '2026-08-20', factory: '武汉工厂', isAbnormal: false, abnormalReason: '' },
    { id: 9, rowNo: 9, orderSeq: 9, documentNo: 'PO20260811009', customerName: '远大轮胎连锁', customerLevel: 'A', materialCode: 'MAT001', quantity: 180, startWorkDate: '2026-08-15', dueDate: '2026-08-21', factory: '上海工厂', isAbnormal: false, abnormalReason: '' },
    { id: 10, rowNo: 10, orderSeq: 10, documentNo: 'PO20260811010', customerName: '华强机械', customerLevel: 'B', materialCode: 'MAT006', quantity: 95, startWorkDate: '2026-08-15', dueDate: '2026-08-22', factory: '成都工厂', isAbnormal: false, abnormalReason: '' },
    { id: 11, rowNo: 11, orderSeq: 11, documentNo: 'PO20260811011', customerName: '新飞汽车', customerLevel: 'A', materialCode: 'MAT002', quantity: 130, startWorkDate: '2026-08-16', dueDate: '2026-08-20', factory: '长春工厂', isAbnormal: false, abnormalReason: '' },
    { id: 12, rowNo: 12, orderSeq: 12, documentNo: 'PO20260811012', customerName: '环球轮胎', customerLevel: 'B', materialCode: 'MAT004', quantity: 75, startWorkDate: '2026-08-16', dueDate: '2026-08-23', factory: '青岛工厂', isAbnormal: false, abnormalReason: '' },
  ],
  materialInfo: [
    { id: 1, rowNo: 1, materialCode: 'MAT001', materialName: '天然橡胶 NR', specification: 'SMR20 25kg/包', unit: 'kg', productionTime: 5, operationTime: 8, totalTime: 13 },
    { id: 2, rowNo: 2, materialCode: 'MAT002', materialName: '合成橡胶 SBR', specification: '1502 20kg/包', unit: 'kg', productionTime: 6, operationTime: 7, totalTime: 13 },
    { id: 3, rowNo: 3, materialCode: 'MAT003', materialName: '炭黑 N330', specification: '袋装 25kg', unit: 'kg', productionTime: 4, operationTime: 6, totalTime: 10 },
    { id: 4, rowNo: 4, materialCode: 'MAT004', materialName: '钢丝帘线', specification: '3x0.30+6x0.35', unit: 'm', productionTime: 8, operationTime: 9, totalTime: 17 },
    { id: 5, rowNo: 5, materialCode: 'MAT005', materialName: '防老剂 4020', specification: '袋装 20kg', unit: 'kg', productionTime: 3, operationTime: 4, totalTime: 7 },
    { id: 6, rowNo: 6, materialCode: 'MAT006', materialName: '促进剂 CZ', specification: '袋装 20kg', unit: 'kg', productionTime: 2, operationTime: 3, totalTime: 5 },
  ],
  moldInfo: [
    { id: 1, rowNo: 1, moldCode: 'MOLD001', moldName: '205/55R16 模具', occupiedDevice: 'V001', occupiedStartTime: '2026-08-11 08:00', occupiedEndTime: '2026-08-11 18:00', changeMoldTime: 30, quantity: 120 },
    { id: 2, rowNo: 2, moldCode: 'MOLD002', moldName: '225/45R17 模具', occupiedDevice: 'V002', occupiedStartTime: '2026-08-11 09:00', occupiedEndTime: '2026-08-11 20:00', changeMoldTime: 35, quantity: 150 },
    { id: 3, rowNo: 3, moldCode: 'MOLD003', moldName: '245/40R18 模具', occupiedDevice: 'V003', occupiedStartTime: '2026-08-12 08:00', occupiedEndTime: '2026-08-12 18:00', changeMoldTime: 40, quantity: 100 },
    { id: 4, rowNo: 4, moldCode: 'MOLD004', moldName: '195/65R15 模具', occupiedDevice: 'V004', occupiedStartTime: '2026-08-12 09:00', occupiedEndTime: '2026-08-12 20:00', changeMoldTime: 28, quantity: 130 },
  ],
  vulcanizeDeviceInfo: [
    { id: 1, rowNo: 1, deviceCode: 'V001', deviceName: '硫化机1号', quantity: 120, availableStartTime: '2026-08-11 08:00', availableEndTime: '2026-08-11 18:00', occupiedMold: 'MOLD001' },
    { id: 2, rowNo: 2, deviceCode: 'V002', deviceName: '硫化机2号', quantity: 150, availableStartTime: '2026-08-11 09:00', availableEndTime: '2026-08-11 20:00', occupiedMold: 'MOLD002' },
    { id: 3, rowNo: 3, deviceCode: 'V003', deviceName: '硫化机3号', quantity: 100, availableStartTime: '2026-08-12 08:00', availableEndTime: '2026-08-12 18:00', occupiedMold: 'MOLD003' },
    { id: 4, rowNo: 4, deviceCode: 'V004', deviceName: '硫化机4号', quantity: 130, availableStartTime: '2026-08-12 09:00', availableEndTime: '2026-08-12 20:00', occupiedMold: 'MOLD004' },
  ],
  deviceMoldRelInfo: [
    { id: 1, rowNo: 1, deviceCode: 'V001', moldCode: 'MOLD001' },
    { id: 2, rowNo: 2, deviceCode: 'V001', moldCode: 'MOLD002' },
    { id: 3, rowNo: 3, deviceCode: 'V002', moldCode: 'MOLD002' },
    { id: 4, rowNo: 4, deviceCode: 'V003', moldCode: 'MOLD003' },
    { id: 5, rowNo: 5, deviceCode: 'V004', moldCode: 'MOLD004' },
  ],
  moldProductRelInfo: [
    { id: 1, rowNo: 1, moldCode: 'MOLD001', productCode: 'PROD001' },
    { id: 2, rowNo: 2, moldCode: 'MOLD002', productCode: 'PROD002' },
    { id: 3, rowNo: 3, moldCode: 'MOLD003', productCode: 'PROD003' },
    { id: 4, rowNo: 4, moldCode: 'MOLD004', productCode: 'PROD004' },
  ],
}

export default [
  // 下载 Excel 模板（返回 xlsx 文件流）
  {
    url: '/ivsms/tasks/download',
    method: 'get',
    rawResponse(req, res) {
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.aoa_to_sheet([
        ['订单编号', '产品编号', '产品名称', '订单数量', '交货日期', '优先级', '客户名称'],
        ['PO20260811001', 'PROD001', '子午线轮胎 205/55R16', 120, '2026-08-15', '高', '华东轮胎销售公司'],
        ['PO20260811002', 'PROD002', '子午线轮胎 225/45R17', 150, '2026-08-14', '中', '华南汽配集团'],
      ])
      XLSX.utils.book_append_sheet(workbook, sheet, '订单信息')
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      // 注意：Content-Disposition 文件名需为 ASCII，Node 的 HTTP 层会拒绝含中文的原始头值
      res.setHeader('Content-Disposition', 'attachment; filename=schedule-template.xlsx')
      res.end(buffer)
    },
  },
  // 查询历史上传记录（分页）
  {
    url: '/ivsms/tasks/historyQuery',
    method: 'get',
    timeout: 400,
    response: ({ query }) => {
      const { pageNum = 1, pageSize = 10, keyword = '', status = '' } = query || {}
      let list = historyRecords
      if (keyword) {
        const kw = String(keyword).toLowerCase()
        list = list.filter((r) => r.fileName.toLowerCase().includes(kw) || (r.taskRemark || '').toLowerCase().includes(kw))
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
  // 上传排程数据文件（FormData）与提交数据上传步骤（JSON）共用
  {
    url: '/ivsms/tasks/upload',
    method: 'post',
    timeout: 1500,
    response: ({ body }) => {
      const taskId = nextTaskId()
      return {
        success: true,
        code: 0,
        message: '文件上传成功',
        data: {
          taskId,
          fileId: `FILE${taskId}`,
          fileName: '排程演示数据.xlsx',
          uploadTime: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
          taskRemark: body?.remark || '',
          sheetNames: Object.keys(excelDataMap),
        },
      }
    },
  },
  // 历史记录导入（复用历史排程任务数据）
  {
    url: '/ivsms/tasks/historyImport',
    method: 'post',
    timeout: 1000,
    response: ({ body }) => {
      const { sourceTaskId } = body || {}
      const src = historyRecords.find((r) => r.taskId === sourceTaskId) || historyRecords[0]
      const taskId = nextTaskId()
      return {
        success: true,
        code: 0,
        message: '导入成功',
        data: {
          taskId,
          fileId: `FILE${taskId}`,
          fileName: src.fileName,
          taskRemark: src.taskRemark || '',
          uploadTime: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        },
      }
    },
  },
  // 历史记录删除（逻辑删除）
  {
    url: '/ivsms/tasks/historyDelete',
    method: 'post',
    timeout: 400,
    response: () => {
      return { success: true, code: 0, message: '删除成功', data: {} }
    },
  },
  // 查询 Excel 文件数据（分页，按 mode 返回）
  {
    url: '/ivsms/tasks/excelShow',
    method: 'get',
    timeout: 400,
    response: ({ query }) => {
      const { mode = 'pendingOrderInfo', page = 1, pageSize = 10, onlyAbnormal = false, keyword = '' } = query || {}
      let records = excelDataMap[mode] || []
      // 异常过滤
      if (onlyAbnormal === true || onlyAbnormal === 'true') {
        records = records.filter((r) => r.isAbnormal)
      }
      // 关键字过滤：模糊匹配所有业务字段
      if (keyword) {
        const kw = String(keyword).toLowerCase()
        records = records.filter((r) =>
          Object.entries(r).some(
            ([k, v]) => !['id', 'rowNo', 'isAbnormal', 'abnormalReason'].includes(k) && String(v).toLowerCase().includes(kw),
          ),
        )
      }
      const total = records.length
      const start = (Number(page) - 1) * Number(pageSize)
      const pageRecords = records.slice(start, start + Number(pageSize))
      return { success: true, code: 0, message: 'success', data: { total, records: pageRecords } }
    },
  },
]
