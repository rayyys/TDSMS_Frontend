import { ref, computed, watch, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useSchedulingStore } from '@/stores/scheduling'
import { getTaskDetail, getTaskDetailFilterOptions } from '@/api/scheduling'

/**
 * 任务数据导入明细页 - composable
 * 包含筛选 / 搜索 / 翻页 / 表格展示逻辑
 *
 * 与旧版（多 sheet Tab + 异常数据）不同，新版采用单表 + 顶部筛选条的设计，
 * 字段集与生产管理业务对齐：部门 / 物料编码 / 存货名称 / 规格 / U8现存量 / 总供部门 / 月度生产计划 / 提报合计。
 */

// 表格列定义（与原型图严格对齐）
const TABLE_COLUMNS = [
  { key: 'department', label: '部门', width: 130 },
  { key: 'materialCode', label: '物料编码', width: 160 },
  { key: 'materialName', label: '存货名称', width: 240 },
  { key: 'specification', label: '规格', width: 220 },
  { key: 'u8Stock', label: 'U8现存量', width: 130 },
  { key: 'monthlyPlan', label: '月份生产计划', width: 170 },
  { key: 'submitTotal', label: '提报合计', width: 140 },
]

// 后端接口字段 → 前端表格字段 映射
// 后端明细接口返回的字段名与前端列定义不一致（如 departmentName / inventoryName / u8CurrentStock 等），
// 在数据入口统一转换为前端约定的字段名，保证表格、筛选、下一步同步 store 共用同一套键
const ROW_FIELD_MAP = {
  departmentName: 'department',
  inventoryName: 'materialName',
  u8CurrentStock: 'u8Stock',
  monthlyProductionPlan: 'monthlyPlan',
  submittedTotal: 'submitTotal',
}

// 生产计划下拉框特殊选项：置于真实选项最顶端的「全选」与「(空)」
// 二者为前端合成的伪选项，不真实存在于后端返回的月度生产计划列表中
const PLAN_OPTION_ALL = '__ALL__'
const PLAN_OPTION_EMPTY = '__EMPTY__'

// 将后端返回的行数据映射为前端表格字段结构（未在映射中的字段原样透传，便于后续扩展）
function mapRow(row) {
  const mapped = {}
  for (const [backendKey, frontendKey] of Object.entries(ROW_FIELD_MAP)) {
    if (backendKey in row) mapped[frontendKey] = row[backendKey]
  }
  for (const key of Object.keys(row)) {
    if (!(key in ROW_FIELD_MAP)) mapped[key] = row[key]
  }
  return mapped
}

export function useTaskData() {
  const schedulingStore = useSchedulingStore()

  // —— 筛选区状态 ——
  // 部门 / 生产计划 / 存货名称均为多选（空数组 = 全部）
  const filterDepartment = ref([])
  const filterProductionPlan = ref([])
  const filterInventoryName = ref([])

  // —— 搜索 / 翻页状态 ——
  // 需求：表格始终固定展示 10 行，与实际数据量无关
  const keyword = ref('')
  const inputKeyword = ref('')
  const currentPage = ref(1)
  const pageSize = ref(10)
  const totalRows = ref(0)
  const tableLoading = ref(false)
  // 页面跳转输入框绑定的页码
  const jumpPage = ref('')

  // —— 表格行 ——
  const rawRows = ref([])

  // 记录在途的任务数据请求 Promise，供「下一步」等待数据加载完成后放行导航
  let pendingFetch = null

  // 任务文件信息（兼容旧版：保留 fileName / uploadTime，供模板可选展示）
  const fileName = computed(() => {
    return schedulingStore.taskInfo?.fileName || schedulingStore.uploadedFileName || ''
  })
  const uploadTime = computed(() => schedulingStore.taskInfo?.uploadTime || '')

  // —— 筛选下拉选项 ——
  // 从后端 /task/detailFilterOptions 接口按 taskId + 当前已选筛选值动态获取去重后的
  // 部门 / 月度生产计划 / 存货名称，用于构建多选下拉框。
  // 部门 / 存货名称直接使用后端返回的字符串数组；生产计划模板要求 { value, label } 结构，在此统一转换。
  // 后端接口未就绪 / 返回为空时，回退到当前页数据提取的去重值，保证下拉框始终有可用选项。
  const remoteDepartmentOptions = ref([])
  const remoteInventoryOptions = ref([])
  const remoteProductionPlanOptions = ref([])
  const filterOptionsLoading = ref(false)
  // 筛选选项请求序号：用于丢弃连续切换筛选时过期的并发响应
  let filterOptionsSeq = 0

  // 从已加载的 rawRows 中动态提取「部门 / 存货名称」的去重值（作为后端兜底）
  const localDepartmentOptions = computed(() => {
    const set = new Set()
    rawRows.value.forEach((r) => {
      if (r.department) set.add(r.department)
    })
    return Array.from(set)
  })
  const localInventoryOptions = computed(() => {
    const set = new Set()
    rawRows.value.forEach((r) => {
      if (r.materialName) set.add(r.materialName)
    })
    return Array.from(set)
  })

  // 导出给模板的选项：优先用后端数据，为空时回退到本地提取值
  const departmentOptions = computed(() =>
    remoteDepartmentOptions.value.length > 0
      ? remoteDepartmentOptions.value
      : localDepartmentOptions.value,
  )
  const inventoryOptions = computed(() =>
    remoteInventoryOptions.value.length > 0
      ? remoteInventoryOptions.value
      : localInventoryOptions.value,
  )
  const productionPlanOptions = computed(() =>
    remoteProductionPlanOptions.value.map((p) => ({ value: p, label: p })),
  )

  // 生产计划下拉框实际展示选项：在真实选项最顶端插入「全选」「(空)」两个特殊选项
  const productionPlanDisplayOptions = computed(() => [
    { value: PLAN_OPTION_ALL, label: '全选' },
    { value: PLAN_OPTION_EMPTY, label: '(空)' },
    ...productionPlanOptions.value,
  ])

  // 传给后端 /task/detailQuery 与 /task/detailFilterOptions 的月度生产计划筛选值：
  // 剔除「全选」伪标记，并将「(空)」映射为空字符串（后端据此过滤生产计划为空的记录）
  const serializedProductionPlans = computed(() =>
    filterProductionPlan.value
      .filter((v) => v !== PLAN_OPTION_ALL)
      .map((v) => (v === PLAN_OPTION_EMPTY ? '' : v)),
  )

  /**
   * 拉取筛选下拉选项
   * 并发请求部门 / 月度生产计划 / 存货名称三类选项，taskId 兼容上传与历史导入两种来源；
   * 请求体携带当前已选筛选值，后端据此联动计算各下拉框的可用选项
   */
  async function fetchFilterOptions() {
    // 未获取到任务 ID（尚未上传 / 历史导入）时清空选项
    const taskId = schedulingStore.taskInfo?.taskId ?? schedulingStore.taskInfo?.importId
    if (!taskId) {
      remoteDepartmentOptions.value = []
      remoteInventoryOptions.value = []
      remoteProductionPlanOptions.value = []
      return
    }
    // 请求序号：仅应用最后一次发起的响应，避免连续切换筛选时旧响应覆盖新结果
    const seq = ++filterOptionsSeq
    filterOptionsLoading.value = true
    try {
      // 三类选项互不依赖，并发请求提升加载速度；同时携带当前已选筛选值作为联动上下文
      const baseFilter = {
        departmentNames: filterDepartment.value,
        monthlyProductionPlans: serializedProductionPlans.value,
        inventoryNames: filterInventoryName.value,
      }
      const [deptRes, planRes, invRes] = await Promise.all([
        getTaskDetailFilterOptions({ taskId, option: 'departmentNames', ...baseFilter }),
        getTaskDetailFilterOptions({ taskId, option: 'monthlyProductionPlans', ...baseFilter }),
        getTaskDetailFilterOptions({ taskId, option: 'inventoryNames', ...baseFilter }),
      ])
      // 若期间又发起了新的拉取，丢弃本次结果，避免旧数据覆盖新数据
      if (seq !== filterOptionsSeq) return
      // 兼容 { data: [...] } 与 { data: { data: [...] } } 两种返回结构
      const toArray = (res) => {
        const arr = res?.data?.data ?? res?.data
        return Array.isArray(arr) ? arr : []
      }
      remoteDepartmentOptions.value = toArray(deptRes)
      remoteProductionPlanOptions.value = toArray(planRes)
      remoteInventoryOptions.value = toArray(invRes)
    } catch (err) {
      // 接口异常不打扰用户，清空远程选项后自动回退到本地提取值
      if (seq !== filterOptionsSeq) return
      remoteDepartmentOptions.value = []
      remoteInventoryOptions.value = []
      remoteProductionPlanOptions.value = []
    } finally {
      // 仅当本次请求仍是最新请求时才结束 loading，避免提前关闭新请求的加载态
      if (seq === filterOptionsSeq) filterOptionsLoading.value = false
    }
  }

  // 任务信息（taskId）变化时重新拉取选项，覆盖上传 / 历史导入 / 刷新恢复等场景
  watch(
    () => schedulingStore.taskInfo?.taskId ?? schedulingStore.taskInfo?.importId,
    () => fetchFilterOptions(),
    { immediate: true },
  )

  // 下拉框展开时重新拉取选项
  // 勾选当前下拉框内的选项不再触发请求；仅当打开某个下拉框时才携带当前已选值，
  // 向后端联动刷新各下拉框的可用选项（请求体带当前已选筛选值，后端据此过滤）
  function handleFilterDropdownVisibleChange(visible) {
    if (visible) fetchFilterOptions()
  }

  // —— 生产计划下拉框「全选 / (空)」特殊选项的勾选联动 ——
  // 记录上一次勾选集合，用于区分「全选」是刚被勾选还是刚被取消
  let prevPlanSelection = []

  /**
   * 处理生产计划多选勾选变化
   * - 勾选「全选」：自动补全所有真实生产计划选项
   * - 取消「全选」：同时清空全部真实生产计划选项
   * - 「全选」保持勾选时单独取消某个真实选项：联动取消「全选」
   * - 「(空)」为独立选项，不参与全选联动
   */
  function handleProductionPlanChange(selected) {
    const realValues = productionPlanOptions.value.map((o) => o.value)
    const realSelected = selected.filter((v) => v !== PLAN_OPTION_ALL && v !== PLAN_OPTION_EMPTY)
    const hasAll = selected.includes(PLAN_OPTION_ALL)
    const hasEmpty = selected.includes(PLAN_OPTION_EMPTY)
    const allJustChecked = hasAll && !prevPlanSelection.includes(PLAN_OPTION_ALL)
    const allJustUnchecked = !hasAll && prevPlanSelection.includes(PLAN_OPTION_ALL)
    // 重组勾选集合：「(空)」独立选项始终按当前勾选状态保留
    const next = new Set(realSelected)
    if (hasEmpty) next.add(PLAN_OPTION_EMPTY)
    if (allJustChecked && realValues.length > 0) {
      // 勾选「全选」：补全全部真实选项并保留「全选」标记
      realValues.forEach((v) => next.add(v))
      next.add(PLAN_OPTION_ALL)
    } else if (allJustUnchecked) {
      // 取消「全选」：清空全部真实选项，仅保留独立选项
      next.clear()
      if (hasEmpty) next.add(PLAN_OPTION_EMPTY)
    } else if (hasAll && prevPlanSelection.includes(PLAN_OPTION_ALL)) {
      // 全选保持勾选态：仅在全部真实选项仍勾选时才保留「全选」，否则联动取消
      const allRealChecked = realValues.length > 0 && realValues.every((v) => next.has(v))
      if (allRealChecked) next.add(PLAN_OPTION_ALL)
    }
    filterProductionPlan.value = Array.from(next)
    prevPlanSelection = filterProductionPlan.value
  }

  // —— 展示数据 ——
  // 筛选 / 搜索均由后端 /task/detailQuery 处理（点击「筛选」或「搜索」才发起请求），
  // 前端只负责展示服务端按 page/pageSize 返回的当前页数据（rawRows）。
  // 始终保持 pageSize 行，不足时用占位行填充空白行，确保表格高度恒定
  const pagedRows = computed(() => {
    const rows = rawRows.value
    const fillCount = pageSize.value - rows.length
    if (fillCount > 0) {
      // 占位行：_isPlaceholder 标记用于样式区分（隐藏文字但保留行高）
      const fillers = Array.from({ length: fillCount }, () => ({ _isPlaceholder: true }))
      return [...rows, ...fillers]
    }
    return rows
  })

  // 行 class：占位行应用 row-placeholder 类，用于 CSS 隐藏文字但保留行高
  function rowClassName({ row }) {
    if (row && row._isPlaceholder) return 'row-placeholder'
    return ''
  }

  // 表格列定义（直接导出固定配置）
  const tableColumns = TABLE_COLUMNS

  // —— 操作方法 ——
  function handleSearch() {
    inputKeyword.value = keyword.value
    currentPage.value = 1
    fetchData()
  }

  // 输入框被清空时自动重置搜索
  watch(keyword, (val) => {
    if (!val) {
      inputKeyword.value = ''
      currentPage.value = 1
      fetchData()
    }
  })

  // 每页条数变化时重置分页并重新拉取
  watch(pageSize, () => {
    currentPage.value = 1
    fetchData()
  })

  // 翻页：服务端分页，页码变化时重新请求数据
  watch(currentPage, () => {
    fetchData()
  })

  /**
   * 重置筛选 + 搜索
   */
  function handleReset() {
    filterDepartment.value = []
    filterProductionPlan.value = []
    filterInventoryName.value = []
    keyword.value = ''
    inputKeyword.value = ''
    currentPage.value = 1
    fetchData()
  }

  /**
   * 触发筛选（兼容原型图显式「筛选」按钮）
   */
  function handleFilter() {
    currentPage.value = 1
    fetchData()
  }

  // 记录上一次三个筛选是否全部为空，用于「叉掉全部筛选条件时自动触发重置」
  let prevFilterAllEmpty = true
  watch([filterDepartment, filterProductionPlan, filterInventoryName], () => {
    const allEmpty =
      filterDepartment.value.length === 0 &&
      filterProductionPlan.value.length === 0 &&
      filterInventoryName.value.length === 0
    // 仅当筛选条件从「有值」变为「全部清空」时，自动触发一次重置（等价于点击「重置」按钮）
    // prevFilterAllEmpty 标志避免 handleReset 内部再次置空触发递归
    if (!prevFilterAllEmpty && allEmpty) {
      handleReset()
    }
    prevFilterAllEmpty = allEmpty
  })

  /**
   * 页面跳转：根据输入框页码跳转到指定页，越界时自动收敛到首尾页
   */
  function handleJump() {
    const page = Number(jumpPage.value)
    // 非法输入（非数字 / 小于 1）时忽略
    if (!page || page < 1) {
      jumpPage.value = ''
      return
    }
    const maxPage = Math.max(1, Math.ceil(totalRows.value / pageSize.value))
    currentPage.value = Math.min(page, maxPage)
    jumpPage.value = ''
  }

  /**
   * 加载数据（调用后端 /task/detailQuery 接口）
   * 服务端按 taskId 分页返回已解析保存的计划明细，并将部门 / 生产计划 / 存货名称筛选、
   * 关键词搜索一并交给后端处理（不同筛选条件为 AND、同组内为 OR，均未选时传空数组）。
   * 返回在途请求的 Promise，调用方可通过 await 等待数据加载完成。
   */
  async function fetchData() {
    // 存在在途请求时直接复用，避免筛选 / 翻页等联动触发重复请求
    if (pendingFetch) return pendingFetch
    // 未获取到任务 ID（尚未上传或历史导入），清空数据并提示用户先上传
    // taskId 兼容上传（importId）与历史导入两种来源
    const taskId = schedulingStore.taskInfo?.taskId ?? schedulingStore.taskInfo?.importId
    if (!taskId) {
      rawRows.value = []
      totalRows.value = 0
      return
    }
    tableLoading.value = true
    // 保存本次请求的 Promise（onMounted 触发的加载也存于此），
    // 「下一步」可通过 ensureDataLoaded 等待其完成后放行导航
    pendingFetch = (async () => {
      try {
        const res = await getTaskDetail({
          taskId,
          page: currentPage.value,
          pageSize: pageSize.value,
          keyword: inputKeyword.value || undefined,
          // 三个筛选条件均非必填，未选时传空数组表示不限制
          departmentNames: filterDepartment.value,
          monthlyProductionPlans: serializedProductionPlans.value,
          inventoryNames: filterInventoryName.value,
        })
        const result = res?.data
        // 兼容两种返回结构：{ data: { records, total } } 或 { data: { data: { records, total } } }
        const payload = result?.data ?? result
        const rows = payload?.records ?? []
        // 后端字段名与前端列 key 不一致，在此统一映射（materialCode / specification 保持一致）
        rawRows.value = (Array.isArray(rows) ? rows : []).map(mapRow)
        totalRows.value = payload?.total ?? rawRows.value.length
        // 同步数据到 store，使「任务数据」步骤满足下一步前置条件（hasParsedData = true）
        // 否则页面能显示数据，但 store 的 sheetDataMap 为空，下一步会被拦截
        schedulingStore.loadParsedData({
          任务数据: { columns: TABLE_COLUMNS, rows: rawRows.value },
        })
      } catch (err) {
        ElMessage.error(err?.response?.data?.message || '任务数据加载失败，请稍后重试')
        rawRows.value = []
        totalRows.value = 0
      } finally {
        tableLoading.value = false
        pendingFetch = null
      }
    })()
    return pendingFetch
  }

  /**
   * 确保任务数据已加载完成，供「下一步」在导航前等待数据就绪
   * - 已加载完成（hasParsedData 为 true）：直接返回
   * - 存在在途请求（如 onMounted 触发的加载）：复用该请求等待完成
   * - 尚未加载：触发一次新的加载请求
   */
  async function ensureDataLoaded() {
    if (schedulingStore.hasParsedData) return
    if (pendingFetch) return pendingFetch
    return fetchData()
  }

  onMounted(() => {
    fetchData()
  })

  return {
    // icons
    Search,
    // store
    schedulingStore,
    // 任务信息（兼容）
    fileName,
    uploadTime,
    // 筛选状态
    filterDepartment,
    filterProductionPlan,
    filterInventoryName,
    departmentOptions,
    inventoryOptions,
    productionPlanOptions,
    productionPlanDisplayOptions,
    filterOptionsLoading,
    handleFilterDropdownVisibleChange,
    handleProductionPlanChange,
    // 搜索 / 翻页
    keyword,
    currentPage,
    pageSize,
    totalRows,
    tableLoading,
    jumpPage,
    // 表格数据
    pagedRows,
    tableColumns,
    // 行 className
    rowClassName,
    // 方法
    handleSearch,
    handleFilter,
    handleReset,
    handleJump,
    fetchData,
    ensureDataLoaded,
  }
}
