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
  { key: 'monthlyPlan', label: '07月份生产计划', width: 170 },
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
  // 从后端 /task/detailFilterOptions 接口按 taskId 动态获取去重后的部门 / 月度生产计划 / 存货名称。
  // 部门 / 存货名称直接使用后端返回的字符串数组；生产计划模板要求 { value, label } 结构，在此统一转换。
  // 后端接口未就绪 / 返回为空时，回退到当前页数据提取的去重值，保证下拉框始终有可用选项。
  const remoteDepartmentOptions = ref([])
  const remoteInventoryOptions = ref([])
  const remoteProductionPlanOptions = ref([])
  const filterOptionsLoading = ref(false)

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
    remoteDepartmentOptions.value.length > 0 ? remoteDepartmentOptions.value : localDepartmentOptions.value,
  )
  const inventoryOptions = computed(() =>
    remoteInventoryOptions.value.length > 0 ? remoteInventoryOptions.value : localInventoryOptions.value,
  )
  const productionPlanOptions = computed(() =>
    remoteProductionPlanOptions.value.map((p) => ({ value: p, label: p })),
  )

  /**
   * 拉取筛选下拉选项
   * 并发请求部门 / 月度生产计划 / 存货名称三类选项，taskId 兼容上传与历史导入两种来源
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
    filterOptionsLoading.value = true
    try {
      // 三类选项互不依赖，并发请求提升加载速度
      const [deptRes, planRes, invRes] = await Promise.all([
        getTaskDetailFilterOptions({ taskId, option: 'departmentNames' }),
        getTaskDetailFilterOptions({ taskId, option: 'monthlyProductionPlans' }),
        getTaskDetailFilterOptions({ taskId, option: 'inventoryNames' }),
      ])
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
      remoteDepartmentOptions.value = []
      remoteInventoryOptions.value = []
      remoteProductionPlanOptions.value = []
    } finally {
      filterOptionsLoading.value = false
    }
  }

  // 任务信息（taskId）变化时重新拉取选项，覆盖上传 / 历史导入 / 刷新恢复等场景
  watch(
    () => schedulingStore.taskInfo?.taskId ?? schedulingStore.taskInfo?.importId,
    () => fetchFilterOptions(),
    { immediate: true },
  )

  // —— 过滤后的数据（前端二次过滤，服务端按基础参数返回数据后本地按筛选 / 关键字过滤） ——
  const filteredRows = computed(() => {
    let rows = rawRows.value
    // 部门多选：选中的部门作为集合，命中任一部门即保留
    if (filterDepartment.value.length > 0) {
      const depts = new Set(filterDepartment.value)
      rows = rows.filter((r) => depts.has(r.department))
    }
    // 生产计划多选：选中的计划作为集合，命中任一计划即保留
    if (filterProductionPlan.value.length > 0) {
      const plans = new Set(filterProductionPlan.value)
      rows = rows.filter((r) => {
        if (!r.monthlyPlan) return false
        // 后端返回的月度计划格式可能是 "2026-07" 或 "2026年07月"，做兼容判断
        const raw = String(r.monthlyPlan)
        const normalized = raw.replace(/年|月/g, '-').replace(/-$/, '').replace(/^(\d{4})-(\d{1,2})$/, '$1-0$2')
        return [...plans].some((p) => raw.includes(p) || normalized.includes(p))
      })
    }
    // 存货名称多选：命中任一名称即保留
    if (filterInventoryName.value.length > 0) {
      const names = new Set(filterInventoryName.value)
      rows = rows.filter((r) => names.has(r.materialName))
    }
    // 关键词搜索：对整行所有字段做模糊匹配（不区分大小写）
    if (inputKeyword.value) {
      const kw = inputKeyword.value.trim().toLowerCase()
      rows = rows.filter((r) =>
        Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(kw))
      )
    }
    return rows
  })

  // 当前页数据：服务端已按 page/pageSize 分页返回，rawRows 即为当前页；
  // 前端再按部门 / 生产计划 / 存货名称做二次筛选。始终保持 pageSize 行，
  // 不足时用占位行填充空白行，确保表格高度恒定
  const pagedRows = computed(() => {
    const rows = filteredRows.value
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

  // 筛选条件变化时重置分页并重新拉取
  watch([filterDepartment, filterProductionPlan, filterInventoryName], () => {
    currentPage.value = 1
    fetchData()
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
   * 服务端按 importId 分页返回已解析保存的计划明细，支持关键词搜索；
   * 前端在返回的当前页数据上再按部门 / 生产计划 / 存货名称做二次筛选。
   * 返回在途请求的 Promise，调用方可通过 await 等待数据加载完成。
   */
  async function fetchData() {
    // 存在在途请求时直接复用，避免筛选 / 翻页等联动触发重复请求
    if (pendingFetch) return pendingFetch
    // 未获取到任务 ID（尚未上传或历史导入），清空数据并提示用户先上传
    const importId = schedulingStore.taskInfo?.importId
    if (!importId) {
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
          importId,
          page: currentPage.value,
          pageSize: pageSize.value,
          keyword: inputKeyword.value || undefined,
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
    filterOptionsLoading,
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
