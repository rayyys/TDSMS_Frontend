import { ref, computed, reactive, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import { parseExcelFile, isExcelFile } from '@/utils/excelParse'
import { useApsStore } from '@/stores/aps'
import { loadApsDraftStates, saveApsDraftStates } from '@/utils/apsStorage'
import {
  createApsArchive,
  createApsArchiveItem,
  updateApsArchiveItem,
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
    // 编辑前各字段值的快照，用于「取消编辑」时恢复编辑前状态
    editingBackup: null,
    // 原始上传文件对象（保存时上传给后端解析）
    rawFile: null,
    // 是否已从后端加载过该方案明细（避免切换方案时重复请求）
    detailLoaded: false,
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

// 行对象唯一 key 的自增序号：用于虚拟滚动表格的 rowKey，
// 保证每行（含新增行/Excel 解析行/后端明细行）都有稳定且唯一的标识
let rowSeq = 0

// 将后端明细记录转为表格行数据：空值统一转为空字符串，避免表格显示 null/undefined
function mapItemToRow(item) {
  const row = {}
  for (const [fromKey, toKey] of Object.entries(ITEM_TO_ROW_KEYS)) {
    const value = item?.[fromKey]
    row[toKey] = value === null || value === undefined ? '' : String(value)
  }
  // 保留后端明细主键 itemId，供「单条精确删除」接口使用
  row.itemId = item?.itemId ?? null
  // 注入唯一行 key（itemId 非空则复用，否则退回自增序号）
  // row.itemId 已在上方通过 item?.itemId ?? null 归一化，非 null 即表示主键存在
  row.__rowKey = row.itemId !== null ? `item-${row.itemId}` : `excel-${++rowSeq}`
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

  // 方案列表按方案编号升序排列（方案一、方案二…… 自上而下编号递增）
  // 无法解析编号的方案（如后端返回的"未命名方案"）统一排到末尾
  const sortedPlanList = computed(() =>
    [...planList.value].sort((a, b) => {
      const na = parsePlanNo(a.name)
      const nb = parsePlanNo(b.name)
      if (na === null && nb === null) return 0
      if (na === null) return 1
      if (nb === null) return -1
      return na - nb
    }),
  )

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

  // 中文数字 → 阿拉伯数字（一 → 1，十 → 10，十一 → 11，二十一 → 21，一百零一 → 101，一万零一 → 10001）
  // 解析非法字符返回 null，供 parsePlanNo 判定该命名不参与编号占位
  function parseChineseNum(text) {
    const digits = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
    const units = { 十: 10, 百: 100, 千: 1000 }
    const bigUnits = { 万: 10000, 亿: 100000000 }
    let total = 0
    let current = 0
    for (const ch of text) {
      if (ch in digits) {
        current += digits[ch]
      } else if (ch in units) {
        // 十/百/千 前无数字时视为 1（如 十 → 1×10，十五 → 10+5）
        if (current === 0) current = 1
        total += current * units[ch]
        current = 0
      } else if (ch in bigUnits) {
        // 万/亿 前的数字（含当前累计的十/百/千部分）整体乘以对应倍数
        // 注意：此处不能像十/百/千那样在 current 为 0 时注入 1，否则 十万 会被误算为 110000
        total = (total + current) * bigUnits[ch]
        current = 0
      } else {
        return null
      }
    }
    return total + current
  }

  // 从方案名解析序号：兼容中文数字（方案一 / 方案十一 / 方案二十一）与阿拉伯数字（方案11）两种命名
  // 解析失败（如后端返回的"未命名方案"）返回 null，不参与编号占位
  function parsePlanNo(name) {
    if (!name) return null
    const text = String(name)
    // 优先匹配末尾的阿拉伯数字（兼容历史上已用阿拉伯数字命名的方案，如 方案11）
    const arabicMatch = text.match(/(\d+)$/)
    if (arabicMatch) return Number(arabicMatch[1])
    // 再匹配末尾的中文数字（方案一 ~ 方案二十一）
    const chineseMatch = text.match(/([一二三四五六七八九十百千万亿零]+)$/)
    if (chineseMatch) {
      const num = parseChineseNum(chineseMatch[1])
      if (num !== null && num > 0) return num
    }
    return null
  }

  // 计算下一个可用方案序号：从 1 开始递增，自动填补已删除方案留下的空缺编号
  // 例如已有 方案一、方案三 时，新方案应命名为 方案二
  function nextPlanNo() {
    const usedNos = new Set(
      planList.value.map((p) => parsePlanNo(p.name)).filter((n) => n !== null && n !== undefined),
    )
    let no = 1
    while (usedNos.has(no)) no++
    return no
  }

  // 阿拉伯数字 → 中文数字（1 → 一，10 → 十，11 → 十一，21 → 二十一，101 → 一百零一）
  // 方案编号统一保持中文数字形态，不再回落为阿拉伯数字
  function toChineseNum(n) {
    if (!Number.isInteger(n) || n <= 0) return String(n)
    const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
    const smallUnits = ['', '十', '百', '千']
    const bigUnits = ['', '万', '亿']

    // 单个 4 位段（个/万/亿组）转中文：逢零补位，仅在中高位出现 0 且后续还有非零数字时输出“零”
    function segToText(seg) {
      let text = ''
      let pendingZero = false
      for (let pos = 3; pos >= 0; pos--) {
        const digit = Math.floor(seg / 10 ** pos) % 10
        if (digit === 0) {
          if (text) pendingZero = true
        } else {
          if (pendingZero) {
            text += '零'
            pendingZero = false
          }
          text += digits[digit] + smallUnits[pos]
        }
      }
      return text
    }

    // 从低位开始，每 4 位切一段（个/万/亿）
    const groups = []
    let num = n
    while (num > 0) {
      groups.push(num % 10000)
      num = Math.floor(num / 10000)
    }

    let result = ''
    for (let i = groups.length - 1; i >= 0; i--) {
      const text = segToText(groups[i])
      if (text) {
        // 低位段不足四位（以 0 开头）且前面已有高位内容时补一个“零”
        if (result && groups[i] < 1000) result += '零'
        result += text + (i > 0 ? bigUnits[i] : '')
      }
    }

    // 10~19 省略开头的“一”（十、十一……十九），其余位置的“一十”需保留（如 110 → 一百一十）
    return result.replace(/^一十/, '十')
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
  // 右侧主区域的整体 loading 态：查询 /aps/infoQuery 期间整块区域进入 loading，
  // 禁止用户点击（如导入表格、保存等），避免查询过程中并发上传导致数据混乱
  const mainLoading = ref(false)

  // 加载指定方案的明细数据（GET /aps/infoQuery）
  // 已加载过的方案不重复请求，保留会话内的本地编辑
  async function loadPlanDetail(plan) {
    if (!isSavedArchive(plan)) return
    const state = ensurePlanState(plan.id)
    if (state.detailLoaded) return
    // 查询期间右侧主区域整体 loading，屏蔽所有点击操作
    mainLoading.value = true
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
      clearEditingState(state)
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
      mainLoading.value = false
    }
  }

  // 页面刷新时：从 store 拉取方案列表（含已持久化的本地草稿，刷新后不丢失），并对当前选中的方案加载明细
  async function loadPlanList() {
    mainLoading.value = true
    try {
      await apsStore.ensurePlanList()
      // 对应当前选中的方案加载其明细
      const activePlan = getActivePlan()
      if (activePlan) {
        await loadPlanDetail(activePlan)
      }
    } finally {
      mainLoading.value = false
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

  // ================== Excel 上传与解析 ==================
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
    return rows.slice(2).map((row) => {
      const parsedRow = trimRowWhitespace({
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
      })
      // 注入唯一行 key（Excel 行无 itemId，用自增序号）
      parsedRow.__rowKey = `excel-${++rowSeq}`
      return parsedRow
    })
  }

  // 表格行数据字段键列表（用于统一清理首尾空白）
  const TABLE_FIELD_KEYS = [
    'product',
    'packageSpec',
    'dispensingLine',
    'batchQty',
    'shiftOutput',
    'dispensingStaff',
    'pressMachine',
    'pressOutput',
    'pressStaff',
    'coatingMachine',
    'coatingOutput',
    'coatingStaff',
    'fillingEquip',
    'fillingOutput',
    'fillingStaff',
    'packingEquip',
    'packingOutput',
    'manualOutput',
    'packingStaff',
    'cycleDays',
    'isProcurement',
    'annualSales',
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

  // ================== 本地数据重建 Excel（刷新后原始文件丢失的兜底） ==================
  // 表格字段 → 模板数据列 的列序（与 parseApsSheetToRows 中的下标一一对应）
  const ROW_TO_APS_COLUMNS = [
    'product',
    'packageSpec',
    'dispensingLine',
    'batchQty',
    'shiftOutput',
    'dispensingStaff',
    'pressMachine',
    'pressOutput',
    'pressStaff',
    'coatingMachine',
    'coatingOutput',
    'coatingStaff',
    'fillingEquip',
    'fillingOutput',
    'fillingStaff',
    'packingEquip',
    'packingOutput',
    'manualOutput',
    'packingStaff',
    'cycleDays',
    'isProcurement',
    'annualSales',
  ]
  // 模板首行（合并组表头）与次行（字段表头），与 docs/APS排产信息.xlsx 保持一致
  const APS_HEADER_ROW1 = [
    '品种',
    '包装规格',
    '配料',
    '',
    '',
    '',
    '压片',
    '',
    '',
    '包衣',
    '',
    '',
    '分装/铝塑',
    '',
    '',
    '包装',
    '',
    '',
    '',
    '生产周期/天',
    '是否集采品种',
    '年销量/万',
  ]
  const APS_HEADER_ROW2 = [
    '',
    '',
    '配料线体',
    '批量（万片/粒）',
    '班产量（万片）',
    '用人',
    '压片机',
    '班产量',
    '用人',
    '包衣机',
    '班产量',
    '用人',
    '操作间及设备',
    '班产量（万片）',
    '用人',
    '操作间及设备',
    '班产量（万片）',
    '手工包装（1人产量）',
    '用人',
    '',
    '',
    '',
  ]
  // 首行组表头的横向合并区间（起始列 → 结束列）
  const APS_HEADER_MERGES = [
    [2, 5],
    [6, 8],
    [9, 11],
    [12, 14],
    [15, 18],
  ]
  // 首行与次行跨行纵向合并的列（品种/包装规格/生产周期/集采/年销量）
  const APS_HEADER_VERTICAL_MERGES = [0, 1, 19, 20, 21]

  // 用本地表格数据重建 APS 模板格式的 Excel 文件
  // 原始 File 对象仅存内存，刷新或切换页面后丢失；此时表格数据仍在，
  // 按模板结构（合并表头 + 数据行）重新生成文件后即可正常上传保存
  function buildApsExcelFile(tableData, fileName) {
    const aoa = [
      APS_HEADER_ROW1.slice(),
      APS_HEADER_ROW2.slice(),
      ...tableData.map((row) => ROW_TO_APS_COLUMNS.map((key) => row[key] ?? '')),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    // 恢复模板的合并单元格，保证后端按模板结构解析
    ws['!merges'] = [
      ...APS_HEADER_MERGES.map(([start, end]) => ({ s: { r: 0, c: start }, e: { r: 0, c: end } })),
      ...APS_HEADER_VERTICAL_MERGES.map((c) => ({ s: { r: 0, c }, e: { r: 1, c } })),
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    return new File([buf], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
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
        clearEditingState(state)
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
    // 若已有其他行处于编辑状态，先恢复其编辑前快照，避免切换导致未保存修改丢失
    if (state.editingRow && state.editingBackup) {
      restoreRowFromSnapshot(state.editingRow, state.editingBackup)
    }
    // _isNewRow 标记新增行，保存时据此调用「新增 APS 明细」接口逐行入库
    const newRow = { _isNewRow: true, __rowKey: `new-${++rowSeq}` }
    state.tableData.push(newRow)
    // 记录新增行下标，供保存时定位该行进行品种校验
    state.newRowIndex = state.tableData.length - 1
    // 新增行即刻进入可编辑状态（替换原可编辑行，保证仅一行），并记录空快照以便取消时清空
    state.editingRow = newRow
    state.editingBackup = snapshotRow(newRow)
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

    // 已保存的方案且未重新导入文件：数据已存在于后端，无需再走上传创建流程，
    // 直接给出明确提示，避免误触发「请先上传 Excel 文件」
    if (isSavedArchive(activePlan) && !state.rawFile) {
      ElMessage.info('当前方案数据已保存，无需重复保存')
      return
    }

    // 场景二：首次保存 → 上传 Excel 文件给后端解析，创建 APS 方案
    // 校验：必须有可上传的文件。草稿方案在刷新/切换页面后原始 File 对象会丢失，
    // 此时本地仍保留已解析的表格数据，按模板结构重建 Excel 后再上传，无需重复选择文件
    if (!state.rawFile) {
      const canRebuild = !isSavedArchive(activePlan) && state.tableData.length
      if (!canRebuild) {
        ElMessage.warning('请先上传 Excel 文件')
        return
      }
      state.rawFile = buildApsExcelFile(state.tableData, `${activePlan?.name || '未命名方案'}.xlsx`)
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
      clearEditingState(state)

      ElMessage.success(`保存成功，共导入 ${data.dataCount ?? state.tableData.length} 条数据`)
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
      clearEditingState(state)
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
  // 快照某行所有可编辑字段的值，用于「取消编辑」时恢复编辑前状态
  function snapshotRow(row) {
    const snap = {}
    for (const key of TABLE_FIELD_KEYS) {
      snap[key] = row[key] ?? ''
    }
    return snap
  }

  // 将快照恢复到指定行（覆盖编辑期间产生的改动）
  function restoreRowFromSnapshot(row, snap) {
    if (!row || !snap) return
    for (const key of TABLE_FIELD_KEYS) {
      row[key] = snap[key] ?? ''
    }
  }

  // 退出编辑状态：清空当前编辑行与编辑前快照
  function clearEditingState(state) {
    state.editingRow = null
    state.editingBackup = null
  }

  function onEditRow(row) {
    const state = planState.value
    // 若已有其他行处于编辑状态，先恢复其编辑前快照，避免切换行导致未保存修改丢失
    if (state.editingRow && state.editingRow !== row && state.editingBackup) {
      restoreRowFromSnapshot(state.editingRow, state.editingBackup)
    }
    // 记录编辑前快照，取消编辑时据此恢复
    state.editingBackup = snapshotRow(row)
    // 点击编辑按钮：该行进入可编辑状态（自动替换原可编辑行，保证仅一行）
    state.editingRow = row
  }

  // 取消编辑：恢复编辑前状态并退出编辑（由失焦确认弹窗「是」触发）
  function onCancelEdit() {
    const state = planState.value
    if (state.editingRow && state.editingBackup) {
      restoreRowFromSnapshot(state.editingRow, state.editingBackup)
    }
    clearEditingState(state)
  }

  // 行编辑确认（对号按钮）：已保存的行调用「修改明细」接口，新增行沿用原保存流程
  async function onConfirmRowEdit(row) {
    const state = planState.value
    if (state.saving) return
    const activePlan = getActivePlan()

    // 新增行（尚未入库、无 itemId）或草稿方案：没有可修改的后端记录，沿用原保存逻辑
    if (!row?.itemId || !isSavedArchive(activePlan)) {
      return onSaveTable()
    }

    state.saving = true
    const loadingMsg = ElMessage({
      message: '正在保存修改...',
      type: 'info',
      duration: 0,
    })
    try {
      const res = await updateApsArchiveItem({
        // 与新增明细一致的字段 + 明细主键 itemId
        ...mapRowToItemPayload(row, activePlan.id),
        itemId: row.itemId,
      })
      const result = res?.data
      if (result?.success === false) {
        ElMessage.error(result.message || '修改失败')
        return
      }
      if (result?.code === 200) {
        ElMessage.success('表格行修改成功')
        // 修改成功后退出该行的编辑状态
        clearEditingState(state)
      }
    } catch (err) {
      const status = err?.response?.status
      if (status === 400) {
        ElMessage.error(err?.response?.data?.message || '修改失败，请检查数据填写是否完整')
      } else if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else {
        ElMessage.error(err?.response?.data?.message || err.message || '修改失败，请稍后重试')
      }
    } finally {
      state.saving = false
      loadingMsg.close()
    }
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
        clearEditingState(state)
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
    sortedPlanList,
    activePlanId,
    planState,
    filteredTableData,
    mainLoading,
    onAddPlan,
    onSelectPlan,
    onDeletePlan,
    // Excel 上传与解析
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
    // 行操作
    onEditRow,
    onCancelEdit,
    onConfirmRowEdit,
    onDeleteRow,
  }
}
