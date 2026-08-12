import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, RefreshRight, Loading } from '@element-plus/icons-vue'
import { useSchedulingStore } from '@/stores/scheduling'
import { useStepNav } from '../useStepNav'
import { isExcelFile } from '@/utils/excelParse'
import {
  uploadScheduleFile,
  downloadExcelTemplate,
  getHistoryUploadRecords,
  historyImport,
  deleteHistoryRecord,
} from '@/api/scheduling'

export function useDataUpload() {
  const schedulingStore = useSchedulingStore()
  const { handleNext } = useStepNav()

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

  // APS 排产信息档案选择（当前为演示选项，后续可对接 APS 档案接口）
  const apsArchiveId = ref('')
  const apsArchiveOptions = ref([
    { label: '方案一', value: '1' },
    { label: '方案二', value: '2' },
  ])

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

  async function processFile(file) {
    if (!isExcelFile(file)) {
      ElMessage.error('仅支持 .xlsx / .xls 格式文件')
      return
    }

    uploading.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('remark', schedulingStore.taskRemark || '')

      const res = await uploadScheduleFile(formData)
      const result = res?.data

      if (result?.success === false) {
        ElMessage.error(result.message || '文件上传失败')
        return
      }

      // 上传成功，才在页面中显示文件
      const taskData = result?.data || result || {}
      schedulingStore.setUploadedFile(file)
      if (taskData.taskId) {
        schedulingStore.setTaskInfo(taskData)
      }
      ElMessage.success('文件上传成功')
    } catch (err) {
      const status = err?.response?.status
      if (status === 400) {
        ElMessage.error('文件格式或数据内容存在问题，请检查后重新上传')
      } else if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else {
        ElMessage.error(err?.response?.data?.message || err.message || '文件上传失败，请稍后重试')
      }
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
      const res = await downloadExcelTemplate()
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
      const res = await deleteHistoryRecord({ taskId: row.taskId })
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
      const res = await getHistoryUploadRecords({
        pageNum: historyPageNum.value,
        pageSize: historyPageSize.value,
      })
      const result = res?.data
      if (result?.success === false) {
        ElMessage.error(result.message || '查询失败')
        return
      }
      // 接口返回 { total, pageNum, pageSize, records }
      const data = result?.data || result || {}
      historyDialogData.value = data.records || []
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
      const res = await historyImport({ sourceTaskId: row.taskId })
      const result = res?.data
      if (result?.success === false) {
        ElMessage.error(result.message || '导入失败')
        return
      }
      // 接口返回新生成的任务信息
      const taskData = result?.data || result || {}
      schedulingStore.setUploadedFile({ name: taskData.fileName || row.fileName })
      schedulingStore.taskRemark = taskData.taskRemark || row.taskRemark || ''
      if (taskData.taskId) {
        schedulingStore.setTaskInfo(taskData)
      }
      importMode.value = 'manual'
      activeTab.value = 'upload'
      historyDialogVisible.value = false
      ElMessage.success('已导入历史记录')
      // 导入成功后自动跳转到任务数据页
      handleNext()
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
    // upload
    uploadDragOver,
    uploading,
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
  }
}
