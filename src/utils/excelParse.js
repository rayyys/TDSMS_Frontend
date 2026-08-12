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
