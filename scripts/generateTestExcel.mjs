/**
 * 生成排程系统测试 Excel 文件（4 份数据集 × 6 个 Sheet）
 * 运行：node scripts/generateTestExcel.mjs
 * 输出：public/排程测试数据-全部正确.xlsx
 *      public/排程测试数据-部分异常.xlsx
 *      public/排程测试数据-全部异常.xlsx
 *      public/排程测试数据-缺失必填列.xlsx
 *      public/排程系统测试数据模板.xlsx（默认=全部正确）
 */
import * as XLSX from 'xlsx'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

import { SHEET_COLUMNS, SHEET_NAMES, DATASETS, DATASET_KEYS } from '../src/mock/schedulingMock.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '..', 'public')

function buildWorkbook(data) {
  const wb = XLSX.utils.book_new()
  for (const name of SHEET_NAMES) {
    const columns = SHEET_COLUMNS[name]
    const rows = data[name] || []
    const aoa = [columns, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = columns.map(() => ({ wch: 18 }))
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  return wb
}

function main() {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const fileMap = {
    'all-correct': '排程测试数据-全部正确.xlsx',
    'partial-anomaly': '排程测试数据-部分异常.xlsx',
    'all-anomaly': '排程测试数据-全部异常.xlsx',
    'missing-required': '排程测试数据-缺失必填列.xlsx',
  }

  for (const key of DATASET_KEYS) {
    const ds = DATASETS[key]
    const wb = buildWorkbook(ds.data)
    const fileName = fileMap[key] || `排程测试数据-${ds.label}.xlsx`
    const fullPath = path.join(outDir, fileName)
    XLSX.writeFile(wb, fullPath)
    console.log(`✅ 已生成：${fileName}`)
    for (const name of SHEET_NAMES) {
      const rowCount = (ds.data[name] || []).length
      console.log(`   - Sheet「${name}」：${rowCount} 行`)
    }
    console.log('')
  }

  // 默认模板（全部正确，字段最完整）
  const defaultWb = buildWorkbook(DATASETS['all-correct'].data)
  const defaultPath = path.join(outDir, '排程系统测试数据模板.xlsx')
  XLSX.writeFile(defaultWb, defaultPath)
  console.log('✅ 已生成默认模板：排程系统测试数据模板.xlsx（=全部正确）')
}

main()
