/**
 * 异常检测工具：识别业务异常
 *   1. 缺失时长（标准工时/工作时长为空或非数字）
 *   2. 缺失交货日期（交货日期为空）
 *   3. 数量异常（订单数量 <= 0 或非数字）
 *   4. 待排产订单缺失时长（跨 Sheet 关联 materialInfo 检测）
 *   5. 待排产订单缺失模具（跨 Sheet 关联 moldProductRelInfo 检测）
 *   6. 待排产订单缺失设备（跨 Sheet 关联 moldProductRelInfo + deviceMoldRelInfo 检测）
 *
 * 关键原则：只有当 Sheet 的 columns 中包含该字段时才检测，
 * 避免对没有该字段的 Sheet（如设备信息、工作日历）误报异常。
 */

import { SHEET_COLUMNS } from '@/config/schedulingConfig'

// 需要检测的字段及其所属异常类型
const NUMBER_FIELDS = ['订单数量']
const DURATION_FIELDS = ['标准工时(分钟)', '工作时长(小时)']
const DELIVERY_FIELDS = ['交货日期']

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

function toNumber(value) {
  if (isEmpty(value)) return NaN
  const n = Number(value)
  return Number.isFinite(n) ? n : NaN
}

/**
 * 检测单行数据的异常
 * @param {Array} row 行数据（按 columns 顺序）
 * @param {string} sheetName Sheet 名称
 * @param {Array} columns 列名数组
 * @returns {string[]} 异常说明列表
 */
export function detectRowAnomalies(row, sheetName, columns) {
  const anomalies = []
  const has = (colName) => columns.indexOf(colName) >= 0
  const get = (colName) => {
    const idx = columns.indexOf(colName)
    return idx >= 0 ? row[idx] : undefined
  }

  // 1. 数量异常（仅当 Sheet 含「订单数量」列时检测）
  for (const field of NUMBER_FIELDS) {
    if (!has(field)) continue
    const v = get(field)
    if (isEmpty(v)) {
      anomalies.push(`缺失「${field}」`)
      continue
    }
    const n = toNumber(v)
    if (Number.isNaN(n) || n <= 0) {
      anomalies.push(`「${field}」异常：${v}（须为正数）`)
    }
  }

  // 2. 缺失交货日期（仅当 Sheet 含「交货日期」列时检测）
  for (const field of DELIVERY_FIELDS) {
    if (!has(field)) continue
    const v = get(field)
    if (isEmpty(v)) {
      anomalies.push(`缺失「${field}」`)
    }
  }

  // 3. 缺失时长（仅当 Sheet 含「标准工时」/「工作时长」列时检测）
  for (const field of DURATION_FIELDS) {
    if (!has(field)) continue
    const v = get(field)
    if (isEmpty(v)) {
      anomalies.push(`缺失「${field}」`)
      continue
    }
    const n = toNumber(v)
    if (Number.isNaN(n) || n <= 0) {
      anomalies.push(`「${field}」异常：${v}（须为正数）`)
    }
  }

  return anomalies
}

/**
 * 跨 Sheet 检测待排产订单信息（pendingOrderInfo）的缺失时长异常。
 *
 * 关联逻辑：
 *   - pendingOrderInfo.materialCode → materialInfo.materialCode
 *   - 从 materialInfo 中获取 productionTime、operationTime、totalTime
 *
 * 判定为正常（不缺失）：
 *   1. 生产时间存在 且 操作时间存在
 *   2. 合计时间存在
 *
 * 判定为异常（缺失时长）：
 *   1. 在物料表中未找到对应的物料编码
 *   2. 合计时间为空 且 生产时间为空
 *   3. 合计时间为空 且 操作时间为空
 *
 * @param {Array} pendingOrderRows - pendingOrderInfo 的 annotated 数组
 * @param {Array} pendingOrderColumns - pendingOrderInfo 的列名数组
 * @param {Object|null} materialInfoSheet - materialInfo 的 { columns, rows }
 * @returns {Array} 更新后的 annotated 数组
 */
export function detectPendingOrderMissingTime(
  pendingOrderRows,
  pendingOrderColumns,
  materialInfoSheet,
) {
  if (!materialInfoSheet || !materialInfoSheet.rows || materialInfoSheet.rows.length === 0) {
    return pendingOrderRows
  }

  const { columns: matColumns, rows: matRows } = materialInfoSheet

  // 找到 pendingOrderInfo 中物料编码列的索引
  const poMatCodeIdx = pendingOrderColumns.indexOf('materialCode')
  if (poMatCodeIdx < 0) return pendingOrderRows // 没有物料编码列，无法检测

  // 找到 materialInfo 中各列的索引
  const matMatCodeIdx = matColumns.indexOf('materialCode')
  const matProdTimeIdx = matColumns.indexOf('productionTime')
  const matOperTimeIdx = matColumns.indexOf('operationTime')
  const matTotalTimeIdx = matColumns.indexOf('totalTime')

  if (matMatCodeIdx < 0) return pendingOrderRows // materialInfo 没有物料编码列，无法关联

  // 构建物料编码 → 行数据的映射
  const materialMap = new Map()
  for (const row of matRows) {
    const code = row[matMatCodeIdx]
    if (!isEmpty(code)) {
      materialMap.set(String(code).trim(), row)
    }
  }

  return pendingOrderRows.map((item) => {
    const row = item.row
    const materialCode = row[poMatCodeIdx]
    const codeStr = !isEmpty(materialCode) ? String(materialCode).trim() : ''

    if (!codeStr) {
      // 物料编码为空，无法关联，视为异常
      return addAnomaly(item, '缺失时长')
    }

    const matRow = materialMap.get(codeStr)
    if (!matRow) {
      // 在物料表中未找到对应的物料编码
      return addAnomaly(item, '缺失时长')
    }

    // 获取 materialInfo 中的时间字段
    const totalTime = matTotalTimeIdx >= 0 ? matRow[matTotalTimeIdx] : undefined
    const productionTime = matProdTimeIdx >= 0 ? matRow[matProdTimeIdx] : undefined
    const operationTime = matOperTimeIdx >= 0 ? matRow[matOperTimeIdx] : undefined

    // 判定为正常：合计时间存在，或 生产时间和操作时间都存在
    const hasTotalTime = !isEmpty(totalTime)
    const hasProductionTime = !isEmpty(productionTime)
    const hasOperationTime = !isEmpty(operationTime)

    if (hasTotalTime || (hasProductionTime && hasOperationTime)) {
      return item // 正常，时长信息完整
    }

    // 异常：缺失时长
    return addAnomaly(item, '缺失时长')
  })
}

function addAnomaly(item, anomalyText) {
  if (item.anomalies.includes(anomalyText)) return item
  return {
    ...item,
    anomalies: [...item.anomalies, anomalyText],
    hasAnomaly: true,
  }
}

/**
 * 跨 Sheet 检测待排产订单信息（pendingOrderInfo）的缺失模具异常。
 *
 * 关联逻辑：
 *   - pendingOrderInfo.materialCode → moldProductRelInfo.productCode
 *   - 检查 moldProductRelInfo 中对应行的 moldCode 是否为空
 *
 * 判定为正常：找到对应产品编码 且 模具编码不为空
 * 判定为异常：未找到对应产品编码 或 模具编码为空
 *
 * @param {Array} pendingOrderRows - pendingOrderInfo 的 annotated 数组
 * @param {Array} pendingOrderColumns - pendingOrderInfo 的列名数组
 * @param {Object|null} moldProductRelSheet - moldProductRelInfo 的 { columns, rows }
 * @returns {Array} 更新后的 annotated 数组
 */
export function detectPendingOrderMissingMold(
  pendingOrderRows,
  pendingOrderColumns,
  moldProductRelSheet,
) {
  if (!moldProductRelSheet || !moldProductRelSheet.rows || moldProductRelSheet.rows.length === 0) {
    return pendingOrderRows
  }

  const { columns: relColumns, rows: relRows } = moldProductRelSheet

  // 找到 pendingOrderInfo 中物料编码列的索引
  const poMatCodeIdx = pendingOrderColumns.indexOf('materialCode')
  if (poMatCodeIdx < 0) return pendingOrderRows

  // 找到 moldProductRelInfo 中各列的索引
  const relProductCodeIdx = relColumns.indexOf('productCode')
  const relMoldCodeIdx = relColumns.indexOf('moldCode')

  if (relProductCodeIdx < 0) return pendingOrderRows // 没有产品编码列，无法关联

  // 构建产品编码 → 行数据的映射（取第一条匹配）
  const productMap = new Map()
  for (const row of relRows) {
    const code = row[relProductCodeIdx]
    if (!isEmpty(code)) {
      const key = String(code).trim()
      if (!productMap.has(key)) {
        productMap.set(key, row)
      }
    }
  }

  return pendingOrderRows.map((item) => {
    const row = item.row
    const materialCode = row[poMatCodeIdx]
    const codeStr = !isEmpty(materialCode) ? String(materialCode).trim() : ''

    if (!codeStr) {
      // 物料编码为空，无法关联，视为异常
      return addAnomaly(item, '缺失模具')
    }

    const relRow = productMap.get(codeStr)
    if (!relRow) {
      // 在模具产品对应关系表中找不到对应的产品编码
      return addAnomaly(item, '缺失模具')
    }

    // 检查模具编码是否为空
    const moldCode = relMoldCodeIdx >= 0 ? relRow[relMoldCodeIdx] : undefined
    if (isEmpty(moldCode)) {
      return addAnomaly(item, '缺失模具')
    }

    return item // 正常，模具信息完整
  })
}

/**
 * 跨 Sheet 检测待排产订单信息（pendingOrderInfo）的缺失设备异常。
 *
 * 关联逻辑（两次关联）：
 *   第一步：pendingOrderInfo.materialCode → moldProductRelInfo.productCode → 获取 moldCode
 *   第二步：moldCode → deviceMoldRelInfo.moldCode → 检查 deviceCode 是否为空
 *
 * 判定为正常：两步均成功，且设备编码不为空
 * 判定为异常：
 *   1. 在模具产品对应关系表中找不到对应的产品编码
 *   2. 在设备模具对应关系表中找不到对应的模具编码
 *   3. 找到了模具编码但设备编码为空
 *
 * @param {Array} pendingOrderRows - pendingOrderInfo 的 annotated 数组
 * @param {Array} pendingOrderColumns - pendingOrderInfo 的列名数组
 * @param {Object|null} moldProductRelSheet - moldProductRelInfo 的 { columns, rows }
 * @param {Object|null} deviceMoldRelSheet - deviceMoldRelInfo 的 { columns, rows }
 * @returns {Array} 更新后的 annotated 数组
 */
export function detectPendingOrderMissingDevice(
  pendingOrderRows,
  pendingOrderColumns,
  moldProductRelSheet,
  deviceMoldRelSheet,
) {
  if (!moldProductRelSheet || !moldProductRelSheet.rows || moldProductRelSheet.rows.length === 0) {
    return pendingOrderRows
  }
  if (!deviceMoldRelSheet || !deviceMoldRelSheet.rows || deviceMoldRelSheet.rows.length === 0) {
    return pendingOrderRows
  }

  const { columns: relColumns, rows: relRows } = moldProductRelSheet
  const { columns: devColumns, rows: devRows } = deviceMoldRelSheet

  // 找到 pendingOrderInfo 中物料编码列的索引
  const poMatCodeIdx = pendingOrderColumns.indexOf('materialCode')
  if (poMatCodeIdx < 0) return pendingOrderRows

  // 找到 moldProductRelInfo 中各列的索引
  const relProductCodeIdx = relColumns.indexOf('productCode')
  const relMoldCodeIdx = relColumns.indexOf('moldCode')
  if (relProductCodeIdx < 0) return pendingOrderRows

  // 找到 deviceMoldRelInfo 中各列的索引
  const devMoldCodeIdx = devColumns.indexOf('moldCode')
  const devDeviceCodeIdx = devColumns.indexOf('deviceCode')
  if (devMoldCodeIdx < 0) return pendingOrderRows

  // 构建产品编码 → 模具编码的映射（取第一条匹配）
  const productToMoldMap = new Map()
  for (const row of relRows) {
    const code = row[relProductCodeIdx]
    if (!isEmpty(code)) {
      const key = String(code).trim()
      if (!productToMoldMap.has(key)) {
        productToMoldMap.set(key, relMoldCodeIdx >= 0 ? row[relMoldCodeIdx] : undefined)
      }
    }
  }

  // 构建模具编码 → 设备编码的映射（取第一条匹配）
  const moldToDeviceMap = new Map()
  for (const row of devRows) {
    const code = row[devMoldCodeIdx]
    if (!isEmpty(code)) {
      const key = String(code).trim()
      if (!moldToDeviceMap.has(key)) {
        moldToDeviceMap.set(key, devDeviceCodeIdx >= 0 ? row[devDeviceCodeIdx] : undefined)
      }
    }
  }

  return pendingOrderRows.map((item) => {
    const row = item.row
    const materialCode = row[poMatCodeIdx]
    const codeStr = !isEmpty(materialCode) ? String(materialCode).trim() : ''

    if (!codeStr) {
      // 物料编码为空，无法关联，视为异常
      return addAnomaly(item, '缺失设备')
    }

    // 第一步：在模具产品对应关系表中查找产品编码，获取模具编码
    const moldCode = productToMoldMap.get(codeStr)
    if (moldCode === undefined) {
      // 找不到对应的产品编码
      return addAnomaly(item, '缺失设备')
    }

    // 模具编码为空，无法进行第二步
    if (isEmpty(moldCode)) {
      return addAnomaly(item, '缺失设备')
    }

    // 第二步：在设备模具对应关系表中查找模具编码，检查设备编码
    const deviceCode = moldToDeviceMap.get(String(moldCode).trim())
    if (deviceCode === undefined) {
      // 找不到对应的模具编码
      return addAnomaly(item, '缺失设备')
    }

    if (isEmpty(deviceCode)) {
      // 找到了模具编码但设备编码为空
      return addAnomaly(item, '缺失设备')
    }

    return item // 正常，设备信息完整
  })
}

/**
 * 对待排产订单信息（pendingOrderInfo）执行全部三项跨 Sheet 异常检测：
 *   缺失时长、缺失模具、缺失设备
 *
 * @param {Array} pendingOrderRows - pendingOrderInfo 的 annotated 数组
 * @param {Array} pendingOrderColumns - pendingOrderInfo 的列名数组
 * @param {Object} sheetDataMap - 完整的 sheetDataMap，包含所有 Sheet 数据
 * @returns {Array} 更新后的 annotated 数组
 */
export function detectPendingOrderAnomalies(pendingOrderRows, pendingOrderColumns, sheetDataMap) {
  let rows = pendingOrderRows

  // 1. 缺失时长检测
  rows = detectPendingOrderMissingTime(rows, pendingOrderColumns, sheetDataMap['materialInfo'])

  // 2. 缺失模具检测
  rows = detectPendingOrderMissingMold(
    rows,
    pendingOrderColumns,
    sheetDataMap['moldProductRelInfo'],
  )

  // 3. 缺失设备检测
  rows = detectPendingOrderMissingDevice(
    rows,
    pendingOrderColumns,
    sheetDataMap['moldProductRelInfo'],
    sheetDataMap['deviceMoldRelInfo'],
  )

  return rows
}

/**
 * 为某个 Sheet 的所有行附加异常标记
 * @returns {Array<{ row: Array, anomalies: string[], hasAnomaly: boolean }>}
 */
export function annotateSheet(sheetName, rows) {
  // 优先用传入的 sheetName 查表；查不到时该 Sheet 无任何检测字段，全部视为正常
  const columns = SHEET_COLUMNS[sheetName] || []
  return rows.map((row) => {
    const anomalies = detectRowAnomalies(row, sheetName, columns)
    return { row, anomalies, hasAnomaly: anomalies.length > 0 }
  })
}

/**
 * 用显式 columns 标注（用于真实上传的 Excel，Sheet 名可能不在预设表内）
 * @param {Array} columns 该 Sheet 实际的列名
 */
export function annotateSheetWithColumns(columns, rows) {
  return rows.map((row) => {
    const anomalies = detectRowAnomalies(row, '', columns)
    return { row, anomalies, hasAnomaly: anomalies.length > 0 }
  })
}

/**
 * 统计全 Sheet 异常数量
 */
export function countSheetAnomalies(sheetName, rows) {
  return annotateSheet(sheetName, rows).filter((r) => r.hasAnomaly).length
}
