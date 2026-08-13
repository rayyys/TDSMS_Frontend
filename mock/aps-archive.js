/**
 * APS 排产信息档案 Mock（无后端时前端联调用）
 * 覆盖：档案数据保存 + 品种唯一性校验 + 重复时按品种分组排序
 * 注意：响应函数需为同步函数，延迟用 timeout 字段控制。
 */

/**
 * 服务端保存逻辑：
 * 1. 数据校验：检查本次新增行的「品种」是否已存在于其他历史行中
 * 2. 情况一（品种不存在）：保持原位置，正常保存
 * 3. 情况二（品种已存在）：按品种稳定排序，并将新增行移动到对应分组的最下方
 * @param {Object} body { planId, rows, newRowIndex }
 */
function handleSave({ planId, rows = [], newRowIndex } = {}) {
  // 新行下标：优先用前端传入值，兜底取最后一行
  const idx =
    Number.isInteger(newRowIndex) && newRowIndex >= 0 ? newRowIndex : rows.length - 1
  const newRow = rows[idx] || null
  const newProduct = newRow ? String(newRow.product || '').trim() : ''

  // 品种唯一性校验：排除新行自身，在其余行中查找同名品种
  const duplicate = Boolean(
    newProduct &&
      rows.some((r, i) => i !== idx && String(r.product || '').trim() === newProduct),
  )

  let resultRows = rows
  let resultNewIndex = idx
  if (duplicate) {
    // 情况二：先按品种稳定排序，再将新增行移动至其对应分组的最下方
    const indexed = rows.map((row, origin) => ({ row, origin }))
    indexed.sort((a, b) =>
      String(a.row.product || '').localeCompare(String(b.row.product || ''), 'zh'),
    )
    // 剔除新增行后，定位其品种分组末尾位置
    const withoutNew = indexed.filter((it) => it.origin !== idx)
    let insertIndex = withoutNew.length
    for (let i = withoutNew.length - 1; i >= 0; i--) {
      if (String(withoutNew[i].row.product || '').trim() === newProduct) {
        insertIndex = i + 1
        break
      }
    }
    withoutNew.splice(insertIndex, 0, { row: newRow, origin: idx })
    resultRows = withoutNew.map((it) => it.row)
    resultNewIndex = insertIndex
  }

  return {
    success: true,
    code: 0,
    message: duplicate ? '保存成功，检测到品种重复，已按品种分组排序' : '保存成功',
    data: { rows: resultRows, duplicate, newRowIndex: resultNewIndex },
  }
}

// 系统中已存在的 APS 排产信息档案方案（模拟后端持久化数据）
const archivePlans = [
  { id: 'plan-1', name: '方案一' },
  { id: 'plan-2', name: '方案二' },
  { id: 'plan-3', name: '方案三' },
]

export default [
  // 查询 APS 排产信息档案方案列表
  {
    url: '/ivsms/aps/archive/list',
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
  // 保存 APS 排产信息档案（含品种唯一性校验与排序）
  {
    url: '/ivsms/aps/archive/save',
    method: 'post',
    timeout: 600,
    response: ({ body }) => handleSave(body || {}),
  },
]
