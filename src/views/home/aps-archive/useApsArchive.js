import { ref, computed, reactive, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import { parseExcelFile, isExcelFile } from '@/utils/excelParse'
import { useApsStore } from '@/stores/aps'
import { loadApsDraftStates, saveApsDraftStates } from '@/utils/apsStorage'
import {
  createApsArchive,
  createApsArchiveItem,
  batchDeleteApsArchiveItems,
  deleteApsArchive,
  exportApsArchive,
  downloadApsTemplate,
  getApsArchiveItems,
} from '@/api/scheduling'

/**
 * 创建单个方案的默认状态
 * 每个方案独立维护自己的数据、上传记录、选中项与搜索条件
 */
function createPlanState() {
  return {
    tableData: [],
    uploadedFileName: '',
    hasImported: false,
    selectedRows: [],
    searchQuery: '',
    tableLoading: false,
    // 保存过程中的加载态
    saving: false,
    // 最近一次「新增数据行」所在下标，用于保存时定位该行
    newRowIndex: null,
    // 排序后需要滚动定位到的新增行对象
    scrollToRow: null,
    // 当前处于可编辑状态的行（同时仅一行，null 表示无）
    editingRow: null,
    // 原始上传文件对象（保存时上传给后端解析）
    rawFile: null,
    // 是否已从后端加载过该方案明细（避免切换方案时重复请求）
    detailLoaded: false,
    // 大数据量时分片渲染：当前已渲染行数（滚动到底自动追加），避免一次性渲染全部行导致卡顿
    renderCount: 200,
    // 每次滚动到底追加的行数
    renderStep: 200,
  }
}

// 判断方案是否已保存为后端档案（本地临时方案的 id 以 "plan-" 前缀标记）
function isSavedArchive(plan) {
  return !!plan && typeof plan.id === 'string' && !plan.id.startsWith('plan-')
}

// 从响应头 Content-Disposition 中解析文件名（与 data-upload 页面保持一致）
function extractFilename(res) {
  const disposition = res?.headers?.['content-disposition']
  if (!disposition) return ''
  const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
  return match ? decodeURIComponent(match[1].replace(/['"]/g, '')) : ''
}

// 触发浏览器下载文件流
function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

// 将表格行字段映射为「新增 APS 明细」接口的请求参数
function mapRowToItemPayload(row, archiveId) {
  return {
    archiveId: Number(archiveId),
    productName: row.product ?? '',
    packageSpecification: row.packageSpec ?? '',
    mixingLine: row.dispensingLine ?? '',
    mixingBatchQuantity: row.batchQty ?? '',
    mixingShiftOutput: row.shiftOutput ?? '',
    mixingWorkerCount: row.dispensingStaff ?? '',
    tabletPress: row.pressMachine ?? '',
    tabletingShiftOutput: row.pressOutput ?? '',
    tabletingWorkerCount: row.pressStaff ?? '',
    coatingMachine: row.coatingMachine ?? '',
    coatingShiftOutput: row.coatingOutput ?? '',
    coatingWorkerCount: row.coatingStaff ?? '',
    dividingEquipment: row.fillingEquip ?? '',
    dividingShiftOutput: row.fillingOutput ?? '',
    dividingWorkerCount: row.fillingStaff ?? '',
    packagingEquipment: row.packingEquip ?? '',
    packagingShiftOutput: row.packingOutput ?? '',
    manualPackagingOutput: row.manualOutput ?? '',
    packagingWorkerCount: row.packingStaff ?? '',
    productionCycleDays: row.cycleDays ?? '',
    centralizedProcurement: row.isProcurement ?? '',
    annualSales: row.annualSales ?? '',
  }
}

// 后端明细记录字段 → 表格行字段 的映射（与 mapRowToItemPayload 互为逆操作）
const ITEM_TO_ROW_KEYS = {
  productName: 'product',
  packageSpecification: 'packageSpec',
  mixingLine: 'dispensingLine',
  mixingBatchQuantity: 'batchQty',
  mixingShiftOutput: 'shiftOutput',
  mixingWorkerCount: 'dispensingStaff',
  tabletPress: 'pressMachine',
  tabletingShiftOutput: 'pressOutput',
  tabletingWorkerCount: 'pressStaff',
  coatingMachine: 'coatingMachine',
  coatingShiftOutput: 'coatingOutput',
  coatingWorkerCount: 'coatingStaff',
  dividingEquipment: 'fillingEquip',
  dividingShiftOutput: 'fillingOutput',
  dividingWorkerCount: 'fillingStaff',
  packagingEquipment: 'packingEquip',
  packagingShiftOutput: 'packingOutput',
  manualPackagingOutput: 'manualOutput',
  packagingWorkerCount: 'packingStaff',
  productionCycleDays: 'cycleDays',
  centralizedProcurement: 'isProcurement',
  annualSales: 'annualSales',
}

// 将后端明细记录转为表格行数据：空值统一转为空字符串，避免表格显示 null/undefined
function mapItemToRow(item) {
  const row = {}
  for (const [fromKey, toKey] of Object.entries(ITEM_TO_ROW_KEYS)) {
    const value = item?.[fromKey]
    row[toKey] = value === null || value === undefined ? '' : String(value)
  }
  // 保留后端明细主键 itemId，供「单条精确删除」接口使用
  row.itemId = item?.itemId ?? null
  return row
}

/**
 * APS 排产信息档案 - 页面逻辑组合式函数
 * 支持多方案隔离：切换方案时自动保存/恢复各自的上传状态与表格数据
 */
export function useApsArchive() {
  // ================== 方案管理 ==================
  // 方案列表与当前选中方案由全局 store 管理，并持久化到 localStorage（刷新后不丢失）
  const apsStore = useApsStore()
  const { planList, activePlanId } = storeToRefs(apsStore)

  // 每个方案对应一个独立的状态对象（reactive），切换方案时互不干扰
  const planStateMap = ref({})

  // 获取当前激活的方案对象
  function getActivePlan() {
    return planList.value.find((p) => p.id === activePlanId.value)
  }

  // 确保当前激活方案已有状态对象，没有则初始化
  function ensurePlanState(planId) {
    if (!planStateMap.value[planId]) {
      planStateMap.value[planId] = reactive(createPlanState())
    }
    return planStateMap.value[planId]
  }

  // 当前激活方案的状态（始终返回一个可用对象，避免模板空值判断）
  const planState = computed(() => {
    if (!activePlanId.value) return reactive(createPlanState())
    return ensurePlanState(activePlanId.value)
  })

  // 过滤后的表格数据（按品种/包装规格搜索）
  const filteredTableData = computed(() => {
    const rows = planState.value.tableData
    const keyword = (planState.value.searchQuery || '').trim()
    if (!keyword) return rows
    return rows.filter((row) => {
      const product = String(row.product ?? '')
      const packageSpec = String(row.packageSpec ?? '')
      return product.includes(keyword) || packageSpec.includes(keyword)
    })
  })

  // 表格实际渲染的数据：按片渲染，滚动接近底部时自动追加下一片（分片渲染，保持从上至下滚动体验）
  const displayTableData = computed(() => {
    const rows = filteredTableData.value
    return rows.slice(0, planState.value.renderCount)
  })

  // 搜索条件变化后重置已渲染片数，避免停留在空白区域
  watch(
    () => planState.value.searchQuery,
    () => {
      planState.value.renderCount = planState.value.renderStep
    },
  )

  // 删除数据导致总行数减少时，修正已渲染片数，避免超出实际行数
  watch(
    () => filteredTableData.value.length,
    (len) => {
      if (planState.value.renderCount > len) {
        planState.value.renderCount = len
      }
    },
  )

  // 滚动加载更多：追加渲染下一片（幂等，达到总行数后不再增长）
  function loadMoreRows() {
    const state = planState.value
    const total = filteredTableData.value.length
    if (state.renderCount >= total) return
    state.renderCount = Math.min(total, state.renderCount + state.renderStep)
  }

  // 下一个方案的序号
  function nextPlanNo() {
    return planList.value.length + 1
  }

  // 阿拉伯数字 → 中文数字（1 → 一）
  function toChineseNum(n) {
    const map = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    if (n <= 10) return map[n]
    return String(n)
  }

  // 点击"新增方案"：通过 store 创建本地草稿并持久化，刷新后方案不丢失
  function onAddPlan() {
    const newPlan = apsStore.addLocalPlan(`方案${toChineseNum(nextPlanNo())}`)
    ElMessage.success(`${newPlan.name}已创建`)
  }

  // 点击方案项：切换激活（同步持久化选中态），已保存方案按需拉取明细
  function onSelectPlan(planId) {
    if (planId === activePlanId.value) return
    apsStore.selectPlan(planId)
    // 切换到已保存但明细尚未加载过的方案时，拉取其明细数据
    loadPlanDetail(getActivePlan())
  }

  // 删除方案：已保存方案先删除后端数据（避免刷新后重新出现），再清理本地缓存
  async function onDeletePlan(plan) {
    let confirmed = false
    try {
      await ElMessageBox.confirm(`确定删除「${plan.name}」吗？`, '删除方案', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
      confirmed = true
    } catch {
      /* 用户取消 */
    }
    if (!confirmed) return

    // 已保存方案需同步删除后端数据，删除失败则中断，避免本地/后端不一致
    if (isSavedArchive(plan)) {
      try {
        const res = await deleteApsArchive({ archiveId: plan.id })
        const result = res?.data
        if (result?.success === false) {
          ElMessage.error(result.message || '删除方案失败')
          return
        }
      } catch (err) {
        const status = err?.response?.status
        if (status !== 401) {
          // 401 已在响应拦截器中统一处理（提示 + 跳转）
          ElMessage.error(err?.response?.data?.message || err.message || '删除方案失败，请稍后重试')
        }
        return
      }
    }

    apsStore.removePlan(plan.id)
    delete planStateMap.value[plan.id]
    ElMessage.success('已删除')
  }

  // ================== 初始化数据加载 ==================
  // 页面刷新时加载方案列表的 loading 态
  const listLoading = ref(false)

  // 加载指定方案的明细数据（GET /aps/infoQuery）
  // 已加载过的方案不重复请求，保留会话内的本地编辑
  async function loadPlanDetail(plan) {
    if (!isSavedArchive(plan)) return
    const state = ensurePlanState(plan.id)
    if (state.detailLoaded) return
    state.tableLoading = true
    try {
      const res = await getApsArchiveItems({ archiveId: Number(plan.id) })
      const result = res?.data
      if (result?.success === false) {
        ElMessage.error(result.message || '获取方案明细失败')
        return
      }
      // 兼容 data 为 { records } 分页结构 / 直接为数组两种返回
      const raw = result?.data ?? result
      const records = Array.isArray(raw?.records) ? raw.records : Array.isArray(raw) ? raw : []
      state.tableData = records.map(mapItemToRow)
      state.uploadedFileName = `${plan.name}.xlsx`
      state.hasImported = true
      state.selectedRows = []
      state.editingRow = null
      state.newRowIndex = null
      state.detailLoaded = true
    } catch (err) {
      const status = err?.response?.status
      if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else {
        ElMessage.error(err?.response?.data?.message || err.message || '获取方案明细失败')
      }
    } finally {
      state.tableLoading = false
    }
  }

  // 页面刷新时：从 store 拉取方案列表（含已持久化的本地草稿，刷新后不丢失），并对当前选中的方案加载明细
  async function loadPlanList() {
    listLoading.value = true
    try {
      await apsStore.ensurePlanList()
      // 对应当前选中的方案加载其明细
      const activePlan = getActivePlan()
      if (activePlan) {
        await loadPlanDetail(activePlan)
      }
    } finally {
      listLoading.value = false
    }
  }

  // 页面每次刷新：先拉取方案列表，再对当前选中的方案加载明细
  onMounted(() => {
    loadPlanList()
    // 恢复本地草稿已上传的表格数据（刷新后不丢失）
    restoreDraftStates()
  })

  // ================== 本地草稿数据持久化（刷新后的双保障） ==================
  // 已保存方案：刷新时由 loadPlanDetail 走 /aps/infoQuery 接口重新拉取；
  // 本地草稿（未保存）：无 archiveId 无法走接口，故将表格数据持久化到 localStorage，
  // 刷新后 restoreDraftStates 恢复，保证已上传的 Excel 数据不丢失。

  // 刷新后恢复所有草稿方案的表格数据
  function restoreDraftStates() {
    const drafts = loadApsDraftStates()
    if (!drafts) return
    for (const plan of planList.value) {
      if (plan.isSaved) continue
      const saved = drafts[plan.id]
      if (!saved) continue
      const state = ensurePlanState(plan.id)
      if (Array.isArray(saved.tableData)) {
        state.tableData = saved.tableData
      }
      state.uploadedFileName = saved.uploadedFileName || ''
      state.hasImported = !!saved.hasImported
    }
  }

  // 收集当前草稿方案的表格数据，写入 localStorage
  function persistDraftStates() {
    const drafts = {}
    for (const [planId, state] of Object.entries(planStateMap.value)) {
      // 仅持久化本地草稿（plan- 前缀），已保存方案由后端接口保证
      if (!planId.startsWith('plan-')) continue
      drafts[planId] = {
        tableData: state.tableData,
        uploadedFileName: state.uploadedFileName,
        hasImported: state.hasImported,
      }
    }
    saveApsDraftStates(drafts)
  }

  // 监听草稿状态变化，防抖后持久化（避免编辑单元格时高频写入）
  let persistTimer = null
  watch(
    () => planStateMap.value,
    () => {
      clearTimeout(persistTimer)
      persistTimer = setTimeout(persistDraftStates, 300)
    },
    { deep: true },
  )

  // ================== 表格样式 ==================
  // 表头样式：固定浅灰背景，加粗居中
  function headerCellStyle() {
    return {
      background: '#eef1f6',
      color: '#303133',
      fontWeight: '600',
      textAlign: 'center',
      borderColor: '#dfe4ec',
    }
  }

  // 单元格样式：行高统一，禁止换行溢出
  function cellStyle() {
    return {
      color: '#2d3436',
      textAlign: 'center',
      borderColor: '#eaeef4',
    }
  }

  // ================== Excel 上传与解析 ==================
  const uploadDragOver = ref(false)
  const fileInputRef = ref(null)

  function triggerFileInput() {
    fileInputRef.value?.click()
  }

  function onFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    handleSelectedFile(file)
    // 重置 input value，允许重复选择同一文件
    e.target.value = ''
  }

  function onFileDrop(e) {
    uploadDragOver.value = false
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    handleSelectedFile(file)
  }

  async function handleSelectedFile(file) {
    if (!isExcelFile(file)) {
      ElMessage.warning('仅支持 .xlsx / .xls 格式文件')
      return
    }
    const state = planState.value
    state.tableLoading = true
    try {
      const parsed = await parseExcelFile(file)
      const rows = parseApsSheetToRows(parsed)
      state.tableData = rows
      state.uploadedFileName = file.name
      state.hasImported = true
      state.selectedRows = []
      // 保留原始文件对象，保存时上传给后端解析
      state.rawFile = file
      if (rows.length === 0) {
        ElMessage.warning('Excel 中未解析到数据行，请检查模板')
      } else {
        ElMessage.success(`解析成功，共 ${rows.length} 条数据`)
      }
    } catch (err) {
      ElMessage.error(err?.message || 'Excel 解析失败')
      // 解析失败时保持未上传状态，避免显示空表格
      state.hasImported = false
    } finally {
      state.tableLoading = false
    }
  }

  /**
   * 将 parseExcelFile 的结果转为表格行数据
   * 模板首行为合并表头（品种/包装规格/配料/...），次行为字段表头
   * 数据从第 3 行（数组下标 2）开始
   */
  function parseApsSheetToRows(parsed) {
    const sheetName = Object.keys(parsed)[0]
    if (!sheetName) return []
    const { rows } = parsed[sheetName]
    if (!Array.isArray(rows) || rows.length < 2) return []

    // 数据从第 3 行（index 2）开始
    return rows.slice(2).map((row) =>
      trimRowWhitespace({
        product: row[0] ?? '',
        packageSpec: row[1] ?? '',
        dispensingLine: row[2] ?? '',
        batchQty: row[3] ?? '',
        shiftOutput: row[4] ?? '',
        dispensingStaff: row[5] ?? '',
        pressMachine: row[6] ?? '',
        pressOutput: row[7] ?? '',
        pressStaff: row[8] ?? '',
        coatingMachine: row[9] ?? '',
        coatingOutput: row[10] ?? '',
        coatingStaff: row[11] ?? '',
        fillingEquip: row[12] ?? '',
        fillingOutput: row[13] ?? '',
        fillingStaff: row[14] ?? '',
        packingEquip: row[15] ?? '',
        packingOutput: row[16] ?? '',
        manualOutput: row[17] ?? '',
        packingStaff: row[18] ?? '',
        cycleDays: row[19] ?? '',
        isProcurement: row[20] ?? '',
        annualSales: row[21] ?? '',
      }),
    )
  }

  // 表格行数据字段键列表（用于统一清理首尾空白）
  const TABLE_FIELD_KEYS = [
    'product', 'packageSpec', 'dispensingLine', 'batchQty', 'shiftOutput',
    'dispensingStaff', 'pressMachine', 'pressOutput', 'pressStaff',
    'coatingMachine', 'coatingOutput', 'coatingStaff', 'fillingEquip',
    'fillingOutput', 'fillingStaff', 'packingEquip', 'packingOutput',
    'manualOutput', 'packingStaff', 'cycleDays', 'isProcurement', 'annualSales',
  ]

  // 去除一行所有字段值左右两侧的空白，避免 Excel 或手动输入带多余空格
  function trimRowWhitespace(row) {
    if (!row || typeof row !== 'object') return row
    for (const key of TABLE_FIELD_KEYS) {
      if (typeof row[key] === 'string') {
        row[key] = row[key].trim()
      }
    }
    return row
  }

  // 下载模板：调用后端接口获取 APS 排产信息模板文件
  async function onDownloadTemplate() {
    try {
      const res = await downloadApsTemplate()
      const blob = res?.data
      if (!blob || !(blob instanceof Blob)) {
        ElMessage.error('模板下载失败，未获取到文件流')
        return
      }
      const filename = extractFilename(res) || 'APS排产信息模板.xlsx'
      downloadBlob(blob, filename)
      ElMessage.success('模板下载成功')
    } catch (err) {
      const status = err?.response?.status
      if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else if (status === 500) {
        ElMessage.error('Excel模板文件不存在，请联系管理员')
      } else {
        ElMessage.error(err?.response?.data?.message || err.message || '模板下载失败')
      }
    }
  }

  // ================== 工具栏操作 ==================
  // 取消选择：清空选中集合，表格选择框的勾选态由选中集合派生、自动刷新
  function onCancelSelection() {
    planState.value.selectedRows = []
  }

  // 批量删除：已保存的方案调用「按品种批量删除」接口，再同步本地表格
  async function onBatchDelete() {
    const state = planState.value
    const selected = state.selectedRows
    if (!selected.length) {
      ElMessage.warning('请先选择要删除的数据')
      return
    }
    try {
      await ElMessageBox.confirm(`确定删除选中的 ${selected.length} 条数据吗？`, '批量删除确认', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })

      // 收集选中行的品种名（去重），后端按品种软删除
      const productNames = [...new Set(selected.map((row) => row.product).filter(Boolean))]
      if (!productNames.length) {
        ElMessage.warning('选中的数据缺少品种信息，无法删除')
        return
      }

      const activePlan = getActivePlan()
      // 已保存的方案同步删除后端数据；未保存的方案仅本地删除
      if (isSavedArchive(activePlan)) {
        const res = await batchDeleteApsArchiveItems({
          archiveId: activePlan.id,
          // 批量删除：按品种软删除，传品种名列表；itemId 不使用传空
          batchMode: true,
          itemId: null,
          productNames,
        })
        const result = res?.data
        if (result?.success === false) {
          ElMessage.error(result.message || '批量删除失败')
          return
        }
      }

      // 本地删除：先移除选中的行，再同步移除选中品种下的其余行（与后端按品种删除语义一致）
      const selectedSet = new Set(selected)
      const productSet = new Set(productNames)
      state.tableData = state.tableData.filter(
        (row) => !selectedSet.has(row) && !productSet.has(row.product),
      )
      state.selectedRows = []
      // 若被删行正是可编辑行，则清空可编辑状态
      if (state.editingRow && !state.tableData.includes(state.editingRow)) {
        state.editingRow = null
      }
      ElMessage.success('已删除')
    } catch {
      /* 用户取消 */
    }
  }

  // 重置搜索
  function onResetSearch() {
    planState.value.searchQuery = ''
  }

  // 新增空行
  function onAddRow() {
    const state = planState.value
    // _isNewRow 标记新增行，保存时据此调用「新增 APS 明细」接口逐行入库
    const newRow = { _isNewRow: true }
    state.tableData.push(newRow)
    // 新增行在数据末尾，先渲染至包含该行，保证新增行立即可见
    state.renderCount = Math.max(state.renderCount, state.tableData.length)
    // 记录新增行下标，供保存时定位该行进行品种校验
    state.newRowIndex = state.tableData.length - 1
    // 新增行即刻进入可编辑状态（替换原可编辑行，保证仅一行）
    state.editingRow = newRow
    ElMessage.success('已新增数据行')
  }

  // 导出表格：调用后端接口导出当前档案全部明细为 Excel 文件
  async function onExportTable() {
    const activePlan = getActivePlan()
    // 导出需要档案 ID，未保存的方案无法导出
    if (!isSavedArchive(activePlan)) {
      ElMessage.warning('请先保存方案后再导出')
      return
    }
    try {
      const res = await exportApsArchive({ archiveId: activePlan.id })
      const blob = res?.data
      if (!blob || !(blob instanceof Blob)) {
        ElMessage.error('导出失败，未获取到文件流')
        return
      }
      const filename = extractFilename(res) || `${activePlan.name}.xlsx`
      downloadBlob(blob, filename)
      ElMessage.success('导出成功')
    } catch (err) {
      const status = err?.response?.status
      if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else {
        ElMessage.error(err?.response?.data?.message || err.message || '导出失败，请稍后重试')
      }
    }
  }

  // 保存：存在新增数据行时逐条调用「新增 APS 明细」接口；否则上传原始 Excel 创建档案
  async function onSaveTable() {
    const state = planState.value
    if (state.saving) return

    const activePlan = getActivePlan()

    // 场景一：存在通过「新增数据行」添加的本地行 → 调用新增明细接口逐行保存
    const newRows = state.tableData.filter((row) => row._isNewRow)
    if (newRows.length) {
      await saveNewRows(newRows, activePlan)
      return
    }

    // 场景二：首次保存 → 上传 Excel 文件给后端解析，创建 APS 方案
    // 校验：必须先上传 Excel 文件
    if (!state.rawFile) {
      ElMessage.warning('请先上传 Excel 文件')
      return
    }

    // 获取当前方案名称作为 archiveName
    const archiveName = activePlan?.name || '未命名方案'

    state.saving = true

    const loadingMsg = ElMessage({
      message: '正在上传并解析文件...',
      type: 'info',
      duration: 0,
    })

    try {
      const formData = new FormData()
      formData.append('archiveName', archiveName)
      formData.append('file', state.rawFile)

      const res = await createApsArchive(formData)
      const result = res?.data
      if (result?.success === false) {
        ElMessage.error(result.message || '保存失败')
        return
      }

      const data = result?.data || {}
      // 保存成功后：将本地草稿升级为已保存方案，并迁移表格状态，避免保存后表格被清空
      if (data.archiveId && activePlan) {
        const oldId = activePlan.id
        const newId = String(data.archiveId)
        apsStore.markPlanSaved(oldId, newId)
        // 迁移表格状态到新 id：保证保存后仍显示当前数据，刷新后也能正常展示
        if (planStateMap.value[oldId]) {
          planStateMap.value[newId] = planStateMap.value[oldId]
          delete planStateMap.value[oldId]
        }
      }
      state.selectedRows = []
      state.newRowIndex = null
      state.editingRow = null

      ElMessage.success(
        `保存成功，共导入 ${data.dataCount ?? state.tableData.length} 条数据`,
      )
    } catch (err) {
      const status = err?.response?.status
      if (status === 400) {
        ElMessage.error(err?.response?.data?.message || '保存失败，请检查文件格式')
      } else if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else {
        ElMessage.error(err?.response?.data?.message || err.message || '保存失败，请稍后重试')
      }
    } finally {
      state.saving = false
      loadingMsg.close()
    }
  }

  // 将新增数据行逐条调用「新增 APS 明细」接口保存到后端
  async function saveNewRows(newRows, activePlan) {
    // 新增明细需要档案 ID，未保存的方案（本地临时 id）无法调用
    if (!isSavedArchive(activePlan)) {
      ElMessage.warning('请先上传并保存 Excel 文件创建档案，再新增数据行')
      return
    }
    // 过滤出已填写品种的数据行，避免把空白行提交到后端
    const validRows = newRows.filter((row) => row.product && String(row.product).trim())
    if (!validRows.length) {
      ElMessage.warning('请先填写新增行的品种信息')
      return
    }

    const state = planState.value
    state.saving = true

    const loadingMsg = ElMessage({
      message: '正在保存新增数据...',
      type: 'info',
      duration: 0,
    })

    try {
      for (const row of validRows) {
        const res = await createApsArchiveItem(mapRowToItemPayload(row, activePlan.id))
        const result = res?.data
        if (result?.success === false) {
          ElMessage.error(result.message || '新增明细失败')
          return
        }
        // 保存成功后将行标记为已保存，避免下次重复提交
        row._isNewRow = false
      }
      state.newRowIndex = null
      state.editingRow = null
      ElMessage.success(`保存成功，共新增 ${validRows.length} 条数据`)
    } catch (err) {
      const status = err?.response?.status
      if (status === 400) {
        ElMessage.error(err?.response?.data?.message || '保存失败，请检查数据填写是否完整')
      } else if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else {
        ElMessage.error(err?.response?.data?.message || err.message || '保存失败，请稍后重试')
      }
    } finally {
      state.saving = false
      loadingMsg.close()
    }
  }

  // ================== 行操作 ==================
  function onEditRow(row) {
    // 点击编辑按钮：该行进入可编辑状态（自动替换原可编辑行，保证仅一行）
    planState.value.editingRow = row
  }

  // 精确删除单条明细：已保存的方案调用「按 itemId 删除」接口，再同步本地表格
  async function onDeleteRow(row) {
    try {
      await ElMessageBox.confirm('确定删除该条数据吗？', '删除确认', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
      const state = planState.value
      const activePlan = getActivePlan()
      // 已保存的方案同步删除后端数据；未保存的方案或新增未入库行仅本地删除
      if (isSavedArchive(activePlan) && row.itemId) {
        const res = await batchDeleteApsArchiveItems({
          archiveId: activePlan.id,
          // 精确删除：按 itemId 删除单条，productNames 不使用传空数组
          batchMode: false,
          itemId: row.itemId,
          productNames: [],
        })
        const result = res?.data
        if (result?.success === false) {
          ElMessage.error(result.message || '删除失败')
          return
        }
      }
      // 本地删除该行（按行对象定位，避免搜索过滤后下标错位）
      const idx = state.tableData.indexOf(row)
      if (idx >= 0) state.tableData.splice(idx, 1)
      // 若被删行正是可编辑行，则清空可编辑状态
      if (state.editingRow && !state.tableData.includes(state.editingRow)) {
        state.editingRow = null
      }
      // 同步从选中集合中移除该行
      state.selectedRows = state.selectedRows.filter((r) => r !== row)
      ElMessage.success('已删除')
    } catch {
      /* 用户取消 */
    }
  }

  return {
    // 方案管理
    planList,
    activePlanId,
    planState,
    filteredTableData,
    displayTableData,
    listLoading,
    onAddPlan,
    onSelectPlan,
    onDeletePlan,
    // 表格样式
    headerCellStyle,
    cellStyle,
    // Excel 上传与解析
    uploadDragOver,
    fileInputRef,
    triggerFileInput,
    onFileChange,
    onFileDrop,
    onDownloadTemplate,
    // 工具栏操作
    onCancelSelection,
    onBatchDelete,
    onResetSearch,
    onAddRow,
    onExportTable,
    onSaveTable,
    // 分片渲染（滚动加载更多）
    loadMoreRows,
    // 行操作
    onEditRow,
    onDeleteRow,
  }
}
