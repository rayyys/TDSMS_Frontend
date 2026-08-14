import { ref, computed, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { parseExcelFile, isExcelFile } from '@/utils/excelParse'
import { createApsArchive } from '@/api/scheduling'

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
  }
}

/**
 * APS 排产信息档案 - 页面逻辑组合式函数
 * 支持多方案隔离：切换方案时自动保存/恢复各自的上传状态与表格数据
 */
export function useApsArchive() {
  // ================== 方案管理 ==================
  // 方案列表：首次进入为空，点击"新增方案"后追加
  const planList = ref([])
  const activePlanId = ref(null)

  // 每个方案对应一个独立的状态对象（reactive），切换方案时互不干扰
  const planStateMap = ref({})

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

  // 点击"新增方案"：追加方案并设为激活
  function onAddPlan() {
    const newPlan = {
      id: `plan-${Date.now()}`,
      name: `方案${toChineseNum(nextPlanNo())}`,
    }
    planList.value.push(newPlan)
    activePlanId.value = newPlan.id
    ElMessage.success(`${newPlan.name}已创建`)
  }

  // 点击方案项：切换激活，状态由 planState 自动切换，无需手动重置
  function onSelectPlan(planId) {
    if (planId === activePlanId.value) return
    activePlanId.value = planId
  }

  // 删除方案：同时清理该方案的状态缓存
  async function onDeletePlan(plan) {
    try {
      await ElMessageBox.confirm(`确定删除「${plan.name}」吗？`, '删除方案', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
      planList.value = planList.value.filter((p) => p.id !== plan.id)
      delete planStateMap.value[plan.id]
      if (activePlanId.value === plan.id) {
        activePlanId.value = planList.value[0]?.id ?? null
      }
      ElMessage.success('已删除')
    } catch {
      /* 用户取消 */
    }
  }

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

  // 下载模板占位
  function onDownloadTemplate() {
    ElMessage.info('模板下载功能待接入')
  }

  // ================== 工具栏操作 ==================
  // 多选变化事件
  function onSelectionChange(selection) {
    planState.value.selectedRows = selection
  }

  // 取消选择
  function onCancelSelection() {
    planState.value.selectedRows = []
    // 通知表格清空选中：由调用方通过 el-table ref 调用 clearSelection
  }

  // 批量删除
  async function onBatchDelete() {
    const selected = planState.value.selectedRows
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
      const selectedSet = new Set(selected)
      const state = planState.value
      state.tableData = state.tableData.filter((row) => !selectedSet.has(row))
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
    const newRow = {}
    state.tableData.push(newRow)
    // 记录新增行下标，供保存时定位该行进行品种校验
    state.newRowIndex = state.tableData.length - 1
    // 新增行即刻进入可编辑状态（替换原可编辑行，保证仅一行）
    state.editingRow = newRow
    ElMessage.success('已新增数据行')
  }

  // 导出表格（占位）
  function onExportTable() {
    ElMessage.info('导出表格功能待接入')
  }

  // 保存：上传原始 Excel 文件给后端解析，创建 APS 方案
  async function onSaveTable() {
    const state = planState.value
    if (state.saving) return

    // 校验：必须先上传 Excel 文件
    if (!state.rawFile) {
      ElMessage.warning('请先上传 Excel 文件')
      return
    }

    // 获取当前方案名称作为 archiveName
    const activePlan = planList.value.find((p) => p.id === activePlanId.value)
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
      // 保存成功后，用后端返回的 archiveId 更新方案 ID
      if (data.archiveId && activePlan) {
        activePlan.id = String(data.archiveId)
        activePlanId.value = activePlan.id
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

  // ================== 行操作 ==================
  function onEditRow(row) {
    // 点击编辑按钮：该行进入可编辑状态（自动替换原可编辑行，保证仅一行）
    planState.value.editingRow = row
  }

  async function onDeleteRow(index) {
    try {
      await ElMessageBox.confirm('确定删除该条数据吗？', '删除确认', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
      const state = planState.value
      state.tableData.splice(index, 1)
      // 若被删行正是可编辑行，则清空可编辑状态
      if (state.editingRow && !state.tableData.includes(state.editingRow)) {
        state.editingRow = null
      }
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
    onSelectionChange,
    onCancelSelection,
    onBatchDelete,
    onResetSearch,
    onAddRow,
    onExportTable,
    onSaveTable,
    // 行操作
    onEditRow,
    onDeleteRow,
  }
}
