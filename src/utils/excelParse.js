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

/**
 * 简单校验文件：必须是 .xlsx / .xls
 */
export function isExcelFile(file) {
  const name = file.name.toLowerCase()
  return name.endsWith('.xlsx') || name.endsWith('.xls')
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
