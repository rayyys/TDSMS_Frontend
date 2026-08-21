import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { Search, RefreshRight, Loading } from '@element-plus/icons-vue'
import { useSchedulingStore } from '@/stores/scheduling'
import { useApsStore } from '@/stores/aps'
import { useStepNav } from '../useStepNav'
import { isExcelFile } from '@/utils/excelParse'
import {
  importTask,
  downloadTaskTemplate,
  getTaskHistory,
  historyImportTask,
  deleteTaskHistory,
} from '@/api/scheduling'

export function useDataUpload() {
  const schedulingStore = useSchedulingStore()
  const { handleNext: stepNavHandleNext, navigating } = useStepNav()

  // ==================== Tabs ====================
  const activeTab = ref('upload')

  function handleTabClick(tab) {
    const name = tab.paneName || tab.props?.name || tab.name
    if (name === 'history') {
      getHistoryList()
    }
  }

  // ==================== 导入模式 ====================
  const importMode = ref('manual')

  // APS 排产信息档案选择：选项由全局 aps store 提供（登录后统一拉取，各页面复用，避免重复请求）
  const router = useRouter()
  const apsArchiveId = ref('')
  const apsStore = useApsStore()
  // store 的已保存方案下拉选项与列表加载态（storeToRefs 保持响应式引用）
  const { planOptions: apsArchiveOptions, listLoading: apsArchiveLoading } = storeToRefs(apsStore)
  // 「新增方案」特殊选项值，用于触发跳转而非真正选中
  const APS_ARCHIVE_ADD = '__add__'

  // 下拉框变化：选择「新增方案」时跳转到 APS 排产信息档案管理页面
  function onApsArchiveChange(val) {
    if (val === APS_ARCHIVE_ADD) {
      // 跳转前清空选择，避免「新增方案」作为档案被记录
      apsArchiveId.value = ''
      // 记录来源工作流页面，供档案页"新建任务"标签返回原页面
      schedulingStore.setApsOrigin(router.currentRoute.value.path)
      router.push('/aps-archive')
      return
    }
    // 记录当前求解流程所选用的档案方案 id，供模型构建页「前往APS排产信息档案」选中同一方案
    schedulingStore.apsArchiveId = val
  }

  // 页面加载时确保方案列表已拉取（登录后已预拉取，此处复用 store 缓存，不会重复请求）
  onMounted(() => {
    apsStore.ensurePlanList()
  })

  // 方案在档案页被删除后，若当前下拉框仍选中失效方案，则联动清空，避免携带不存在的 archiveId 提交
  watch(
    () => apsArchiveOptions.value,
    (options) => {
      const selected = apsArchiveId.value
      if (!selected || options.some((o) => o.value === selected)) return
      // 草稿被保存为档案后 id 会替换（plan- 前缀 → 真实 archiveId），此时静默清空即可；
      // 已保存方案从下拉框中消失则说明已被删除，给出提示
      const wasDraft = selected.startsWith('plan-')
      apsArchiveId.value = ''
      // 选择失效时同步清空求解流程记录的档案 id，避免跳转档案页时选中已不存在的方案
      schedulingStore.apsArchiveId = null
      if (!wasDraft) {
        ElMessage.warning('当前选择的 APS 方案已被删除，请重新选择')
      }
    },
  )

  // 判断当前选中的方案是否为本地草稿（未保存档案没有真实 archiveId，不能作为档案提交）
  function isSelectedPlanDraft() {
    const opt = apsArchiveOptions.value.find((o) => o.value === apsArchiveId.value)
    return !!opt && !opt.isSaved
  }

  // ==================== 下一步校验 ====================
  async function handleNext() {
    const hasApsArchive = Boolean(apsArchiveId.value)
    const hasUploadedFile = Boolean(schedulingStore.uploadedFileName)

    if (!hasApsArchive && !hasUploadedFile) {
      ElMessage.warning('当前缺少 APS 排产信息档案及药业车间分解编排计划，请完成上传后继续。')
      return
    }
    if (!hasApsArchive) {
      ElMessage.warning('当前未选择 APS 排产信息档案方案，请选择后继续。')
      return
    }
    // 草稿方案未保存为档案，无真实 archiveId，需先到档案页保存后才能继续
    if (isSelectedPlanDraft()) {
      ElMessage.warning(
        '所选方案尚未保存为档案，请先在「APS排产信息档案」页上传 Excel 并保存后再继续。',
      )
      return
    }
    if (!hasUploadedFile) {
      ElMessage.warning('当前未上传药业车间分解编排计划，请上传文件后继续。')
      return
    }

    // 文件尚未提交到后端（无任务信息）时，先将文件连同已填写的备注一并上传，成功后再进入下一步
    if (!schedulingStore.taskInfo?.importId) {
      const submitted = await submitUpload()
      if (!submitted) return
    }

    stepNavHandleNext()
  }

  function onImportModeChange(val) {
    if (val === 'history') {
      openHistoryImportDialog()
    }
  }

  // ==================== 文件拖拽上传 ====================
  const uploadDragOver = ref(false)
  const uploading = ref(false)

  function onDragOver(e) {
    e.preventDefault()
    uploadDragOver.value = true
  }
  function onDragLeave(e) {
    e.preventDefault()
    uploadDragOver.value = false
  }
  function onDrop(e) {
    e.preventDefault()
    uploadDragOver.value = false
    const files = e.dataTransfer && e.dataTransfer.files
    if (files && files.length > 0) {
      processFile(files[0])
    }
  }

  function triggerFileSelect() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.xls'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        processFile(file)
      }
    }
    input.click()
  }

  function processFile(file) {
    if (!isExcelFile(file)) {
      ElMessage.error('仅支持 .xlsx / .xls 格式文件')
      return
    }

    // 强制选择机制：上传文件前必须先选择一个 APS 排产信息档案方案
    if (!apsArchiveId.value) {
      ElMessage.warning('请先选择 APS 排产信息档案方案')
      return
    }
    // 草稿方案未保存为档案，无真实 archiveId，拦截上传
    if (isSelectedPlanDraft()) {
      ElMessage.warning(
        '所选方案尚未保存为档案，请先在「APS排产信息档案」页上传 Excel 并保存后再上传计划文件',
      )
      return
    }

    // 仅本地暂存文件（含原始 File 对象），真正调用上传接口延后到「下一步」时执行，
    // 此时任务备注已填写完整，可随文件一并提交给后端
    // 更换文件时清空旧任务信息，确保「下一步」会重新上传，避免沿用上一次的任务数据
    schedulingStore.setUploadedFile(file)
    schedulingStore.setTaskInfo(null)
    ElMessage.success('文件已就绪，填写备注后点击「下一步」完成上传')
  }

  // 将暂存的文件连同任务备注提交到后端，成功后写入任务信息；失败返回 false 阻止进入下一步
  async function submitUpload() {
    const file = schedulingStore.uploadedFileRaw
    if (!file) {
      ElMessage.warning('文件上传信息已丢失，请重新选择文件后继续')
      return false
    }

    uploading.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('remark', schedulingStore.taskRemark || '')
      formData.append('apsArchiveId', apsArchiveId.value)

      const res = await importTask(formData)
      const result = res?.data

      if (result?.success === false) {
        ElMessage.error(result.message || '文件上传失败')
        return false
      }

      // 上传成功，才在页面中展示文件并写入任务信息
      schedulingStore.setUploadedFile(file)
      const taskData = result?.data || result || {}
      if (taskData.importId) {
        schedulingStore.setTaskInfo(taskData)
      }
      ElMessage.success('文件上传成功')
      return true
    } catch (err) {
      const status = err?.response?.status
      if (status === 400) {
        ElMessage.error('文件格式或数据内容存在问题，请检查后重新上传')
      } else if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else {
        ElMessage.error(err?.response?.data?.message || err.message || '文件上传失败，请稍后重试')
      }
      return false
    } finally {
      uploading.value = false
    }
  }

  function handleRemove() {
    schedulingStore.clearUploadedFile()
    ElMessage.success('已删除上传文件')
  }

  // ==================== 下载模板 ====================
  async function downloadTemplate() {
    try {
      const res = await downloadTaskTemplate()
      const blob = res?.data
      if (!blob || !(blob instanceof Blob)) {
        ElMessage.error('模板下载失败，未获取到文件流')
        return
      }

      const filename = extractFilename(res) || '排程系统测试数据模板.xlsx'
      downloadBlob(blob, filename)
      ElMessage.success('模板下载成功')
    } catch (error) {
      const status = error?.response?.status
      if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else if (status === 500) {
        ElMessage.error('Excel模板文件不存在，请联系管理员')
      } else {
        ElMessage.error(error?.response?.data?.message || error?.message || '模板下载失败')
      }
    }
  }

  function extractFilename(res) {
    const disposition = res?.headers?.['content-disposition']
    if (!disposition) return ''
    const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
    return match ? decodeURIComponent(match[1].replace(/['"]/g, '')) : ''
  }

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

  // ==================== 历史记录（以往上传文件） ====================
  const searchQuery = ref('')
  const historyTableData = ref([])
  const totalRecords = ref(0)

  // 后端历史记录接口字段 → 前端历史表格字段 映射
  // 返回体字段名与前端列 prop 不一致（如 originalFileName / remark 等），
  // 在数据入口统一转换为前端约定的字段名；taskId 保留原字段（供删除/导入操作使用）
  const HISTORY_ROW_MAP = {
    originalFileName: 'fileName',
    remark: 'taskRemark',
  }

  // 将后端返回的历史记录行数据映射为前端表格字段结构（未在映射中的字段原样透传）
  function mapHistoryRow(row) {
    const mapped = { ...row }
    for (const [backendKey, frontendKey] of Object.entries(HISTORY_ROW_MAP)) {
      if (backendKey in row) mapped[frontendKey] = row[backendKey]
    }
    // 方案名称：后端返回体顶层字段为 apsName，兼容旧数据从嵌套 apsArchive.archiveName 取值
    mapped.apsName = row.apsName ?? row.apsArchive?.archiveName ?? ''
    // 上传人：直接使用后端返回的 createdBy 字段
    return mapped
  }

  function getHistoryList() {
    // 已废弃，历史记录通过弹窗展示
  }

  function resetHistorySearch() {
    searchQuery.value = ''
  }

  // 删除函数，deletingTaskMap 按 taskId 独立追踪，同一文件防重复，不同文件互不阻塞
  async function deleteHistory(row) {
    if (deletingTaskMap.value[row.taskId]) return // 该文件正在删除中
    deletingTaskMap.value = { ...deletingTaskMap.value, [row.taskId]: true }
    try {
      const res = await deleteTaskHistory({ importId: row.taskId })
      const result = res?.data
      if (result?.success === false) {
        ElMessage.error(result.message || '删除失败')
        return
      }
      ElMessage.success('删除成功')

      // 删除成功后，自动重新查询数据以保持页面实时更新
      // 若当前页仅剩一条数据且不在第一页，则回退到上一页，避免空页
      if (historyDialogData.value.length === 1 && historyPageNum.value > 1) {
        historyPageNum.value -= 1
      }
      fetchHistoryList()
    } catch (err) {
      const status = err?.response?.status
      if (status === 400) {
        ElMessage.error(err?.response?.data?.message || '历史记录不存在或已删除')
      } else if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else if (status === 500) {
        ElMessage.error('历史记录删除失败，请稍后重试')
      } else {
        ElMessage.error(err?.response?.data?.message || err.message || '删除失败')
      }
    } finally {
      const next = { ...deletingTaskMap.value }
      delete next[row.taskId]
      deletingTaskMap.value = next
    }
  }

  function downloadHistory(row) {
    ElMessage.success(`已下载「${row.fileName}」`)
  }

  // ==================== 历史记录导入弹窗 ====================
  const historyDialogVisible = ref(false)
  const historyDialogLoading = ref(false)
  const historyDialogData = ref([])
  const historyTotal = ref(0)
  const historyPageNum = ref(1)
  const historyPageSize = ref(10)
  // 当前正在删除的记录 taskId 集合，不同文件互不阻塞，同一文件防重复
  const deletingTaskMap = ref({})

  async function fetchHistoryList() {
    historyDialogLoading.value = true
    try {
      const res = await getTaskHistory({
        page: historyPageNum.value,
        pageSize: historyPageSize.value,
      })
      const result = res?.data
      if (result?.success === false) {
        ElMessage.error(result.message || '查询失败')
        return
      }
      // 接口返回 { total, pageNum, pageSize, records }
      const data = result?.data || result || {}
      // 后端字段名与前端历史表格列 prop 不一致，在此统一映射（taskId 原样保留供删除/导入使用）；
      // 任务编号由前端按列表顺序自动生成：从 1 开始连续递增，列表变化（分页/删除后重新拉取）时自动重算
      historyDialogData.value = (data.records || []).map((row, index) => {
        const mapped = mapHistoryRow(row)
        mapped.taskNo = index + 1
        return mapped
      })
      historyTotal.value = data.total || 0
    } catch (err) {
      const status = err?.response?.status
      if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else {
        ElMessage.error(err?.response?.data?.message || err.message || '查询历史上传记录失败')
      }
      historyDialogData.value = []
      historyTotal.value = 0
    } finally {
      historyDialogLoading.value = false
    }
  }

  function openHistoryImportDialog() {
    historyDialogVisible.value = true
    historyPageNum.value = 1
    fetchHistoryList()
  }

  function onHistoryPageChange(page) {
    historyPageNum.value = page
    fetchHistoryList()
  }

  function onHistoryPageSizeChange(size) {
    historyPageSize.value = size
    historyPageNum.value = 1
    fetchHistoryList()
  }

  async function reimportHistory(row) {
    historyDialogLoading.value = true
    try {
      const res = await historyImportTask({ taskId: row.taskId })
      const result = res?.data
      if (result?.success === false) {
        ElMessage.error(result.message || '导入失败')
        return
      }
      // 接口返回新生成的任务信息
      const taskData = result?.data || result || {}
      schedulingStore.setUploadedFile({ name: taskData.fileName || row.fileName })
      schedulingStore.taskRemark = taskData.taskRemark || row.taskRemark || ''
      // 历史导入返回 taskId，同时作为 importId 供后续 /solve/start 使用
      if (taskData.taskId) {
        taskData.importId = taskData.importId ?? taskData.taskId
        schedulingStore.setTaskInfo(taskData)
      }
      importMode.value = 'manual'
      activeTab.value = 'upload'
      historyDialogVisible.value = false
      // 仅导入文件到当前数据上传页，不自动跳转；如需创建新任务流，由用户点击「下一步」进入任务数据页
      ElMessage.success('历史记录导入成功，文件已就绪')
    } catch (err) {
      const status = err?.response?.status
      if (status === 400) {
        ElMessage.error(err?.response?.data?.message || '来源历史任务不存在或已删除')
      } else if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else {
        ElMessage.error(err?.response?.data?.message || err.message || '导入失败')
      }
    } finally {
      historyDialogLoading.value = false
    }
  }

  return {
    // icons
    Search,
    RefreshRight,
    // store
    schedulingStore,
    // tabs
    activeTab,
    // radio
    importMode,
    // APS 排产信息档案
    apsArchiveId,
    apsArchiveOptions,
    apsArchiveLoading,
    APS_ARCHIVE_ADD,
    onApsArchiveChange,
    // upload
    uploadDragOver,
    uploading,
    navigating,
    // history
    searchQuery,
    historyTableData,
    totalRecords,
    historyDialogVisible,
    historyDialogLoading,
    historyDialogData,
    historyTotal,
    historyPageNum,
    historyPageSize,
    deletingTaskMap,
    // methods
    handleTabClick,
    onImportModeChange,
    triggerFileSelect,
    onDragOver,
    onDragLeave,
    onDrop,
    handleRemove,
    downloadTemplate,
    getHistoryList,
    resetHistorySearch,
    deleteHistory,
    downloadHistory,
    openHistoryImportDialog,
    onHistoryPageChange,
    onHistoryPageSizeChange,
    reimportHistory,
    handleNext,
  }
}
