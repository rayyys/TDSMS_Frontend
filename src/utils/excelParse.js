/**
 * Excel 解析工具：把上传的 .xlsx 文件解析成 { [sheetName]: { columns, rows } }
 * 依赖 xlsx（SheetJS）
 */
import * as XLSX from 'xlsx'

/**
 * @param {File} file
 * @returns {Promise<{ [sheetName: string]: { columns: string[], rows: any[][] } }>}
 */
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const result = {}
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName]
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          if (aoa.length === 0) {
            result[sheetName] = { columns: [], rows: [] }
            continue
          }
          const columns = aoa[0].map((c) => String(c))
          const rows = aoa.slice(1).filter((r) => Array.isArray(r) && r.some((v) => v !== ''))
          result[sheetName] = { columns, rows }
        }
        resolve(result)
      } catch (err) {
        reject(new Error('Excel 解析失败：' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsArrayBuffer(file)
  })
}

// 药业车间分解编排计划模板表头（数组顺序即模板列顺序）
export const SCHEDULING_TEMPLATE_HEADERS = [
  '部门',
  '物料编码',
  '存货名称',
  '规格',
  'U8现存量',
  '月份生产计划',
  '提报合计',
]

/**
 * 校验药业车间分解编排计划文件表头是否与预设模板完全一致（仅校验表头，不检查数据内容）：
 * - 表头完整性：模板要求的必填列是否全部存在、无遗漏
 * - 表头顺序：各列排列顺序是否与模板完全一致
 * - 表头匹配度：列标题名称是否与模板完全对应，无拼写错误或格式差异
 * @param {string[]} headers 解析自文件首行的表头数组
 * @returns {{ valid: boolean, message?: string }} valid=false 时 message 为具体原因
 */
export function validateSchedulingTemplateHeaders(headers) {
  const list = (headers || []).map((h) => String(h).trim())
  // 文件首行无任何表头时，直接提示使用模板
  if (list.length === 0 || list.every((h) => !h)) {
    return { valid: false, message: '未能从文件中读取到表头信息，请使用系统模板填写后重新上传' }
  }

  // 1. 表头完整性：检查模板要求的必填列是否存在且无遗漏
  const missing = SCHEDULING_TEMPLATE_HEADERS.filter((h) => !list.includes(h))
  if (missing.length > 0) {
    return { valid: false, message: `缺少'${missing.join("'、'")}'列标题` }
  }

  // 2. 表头匹配度与顺序：逐列核对列标题名称及排列顺序
  for (let i = 0; i < SCHEDULING_TEMPLATE_HEADERS.length; i++) {
    const expected = SCHEDULING_TEMPLATE_HEADERS[i]
    const actual = list[i] ?? ''
    if (actual !== expected) {
      return {
        valid: false,
        message: `第${i + 1}列标题应为'${expected}'而非'${actual || '空'}'`,
      }
    }
  }

  // 3. 多余列校验：模板之外的列不允许出现在文件中
  if (list.length > SCHEDULING_TEMPLATE_HEADERS.length) {
    return {
      valid: false,
      message: `第${SCHEDULING_TEMPLATE_HEADERS.length + 1}列'${list[SCHEDULING_TEMPLATE_HEADERS.length]}'不属于模板字段，请删除多余列`,
    }
  }

  return { valid: true }
}

// Excel 允许的 MIME 类型：
// - .xlsx: Office Open XML 工作簿
// - .xls : 旧版 BIFF 工作簿
const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]

/**
 * 严格校验上传文件是否为允许的 Excel 格式（扩展名 + MIME 类型双重校验）：
 * - 扩展名必须是 .xlsx / .xls
 * - MIME 类型必须命中 Excel 类型；部分浏览器/系统会以空值或
 *   application/octet-stream 上报，此时回退为仅校验扩展名，避免误拦截正常文件
 * @param {File} file 上传文件
 * @returns {{ valid: boolean, message?: string }} 校验结果，valid=false 时 message 为具体原因
 */
export function validateExcelFile(file) {
  const name = (file?.name || '').toLowerCase()
  const isXlsx = name.endsWith('.xlsx')
  const isXls = name.endsWith('.xls')
  if (!isXlsx && !isXls) {
    return { valid: false, message: '文件格式不支持：仅允许上传 .xlsx / .xls 格式的 Excel 文件' }
  }
  const mime = (file?.type || '').toLowerCase()
  if (mime && mime !== 'application/octet-stream' && !EXCEL_MIME_TYPES.includes(mime)) {
    return {
      valid: false,
      message: `文件类型校验失败：该文件的 MIME 类型为“${file.type}”，不是有效的 Excel 文件，请确认文件未被重命名伪装`,
    }
  }
  return { valid: true }
}
