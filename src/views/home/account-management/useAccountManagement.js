import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  createTestUser,
  updateTestUserValidity,
  getTestUserList,
  updateUserStatus,
} from '@/api/scheduling'

export function useAccountManagement() {
  // 创建表单
  const createForm = reactive({
    username: '',
    password: '',
    validDays: 30,
    departmentName: '',
    realName: '',
  })

  const creating = ref(false)

  // 表格加载状态
  const loading = ref(true)

  // 用户列表
  const users = ref([])

  // 分页
  const currentPage = ref(1)
  const pageSize = ref(10)

  const totalUsers = ref(0)

  // 填充空白行至 pageSize，使表格始终渲染固定行数，避免数据不足时高度不一致
  const pagedUsers = computed(() => {
    const rows = users.value
    if (rows.length >= pageSize.value) return rows
    const fillCount = pageSize.value - rows.length
    const fillers = Array.from({ length: fillCount }, () => ({ _isPlaceholder: true }))
    return [...rows, ...fillers]
  })

  // 加载用户列表
  async function fetchUsers() {
    loading.value = true
    try {
      const res = await getTestUserList({
        page: currentPage.value,
        pageSize: pageSize.value,
      })
      const result = res?.data
      if (result?.success === false) {
        ElMessage.error(result.message || '查询失败')
        return
      }
      if (result?.data?.records) {
        users.value = result.data.records
        totalUsers.value = result.data.total ?? 0
      }
    } catch (err) {
      ElMessage.error(err?.response?.data?.message || '用户列表加载失败，请稍后重试')
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    fetchUsers()
  })

  // 分页变化时重新请求数据
  watch([currentPage, pageSize], () => {
    fetchUsers()
  })

  // 创建测试用户
  async function handleCreate() {
    if (!createForm.username || !createForm.password) {
      ElMessage.warning('请填写账号和密码')
      return
    }
    creating.value = true
    try {
      const res = await createTestUser({
        username: createForm.username,
        password: createForm.password,
        validDays: createForm.validDays,
        departmentName: createForm.departmentName,
        realName: createForm.realName,
      })
      // 接口返回失败（HTTP 200 但 success=false）时，仅提示不继续刷新
      if (res?.data?.success === false) {
        ElMessage.error(res.data.message || '创建失败，请重试')
        return
      }
      ElMessage.success('测试用户创建成功')
      // 重置表单
      createForm.username = ''
      createForm.password = ''
      createForm.validDays = 30
      createForm.departmentName = ''
      createForm.realName = ''
      currentPage.value = 1
      // 刷新列表
      await fetchUsers()
    } catch (err) {
      const status = err?.response?.status
      const msg = err?.response?.data?.detail || err?.response?.data?.message
      if (status === 400) {
        ElMessage.warning(msg || '账号、密码和有效天数不能为空')
      } else if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else if (status === 500) {
        ElMessage.error('测试用户创建失败，请稍后重试')
      } else {
        ElMessage.error(msg || '创建失败，请重试')
      }
    } finally {
      creating.value = false
    }
  }

  // 保存剩余天数
  async function handleSave(row) {
    try {
      const res = await updateTestUserValidity({
        userId: row.userId,
        validDays: row.remainingDays,
      })
      // 接口返回失败（HTTP 200 但 success=false）时，仅提示
      if (res?.data?.success === false) {
        ElMessage.error(res.data.message || '保存失败，请重试')
        return
      }
      ElMessage.success('保存成功')
    } catch (err) {
      ElMessage.error(err?.response?.data?.message || '保存失败，请重试')
    }
  }

  // 启用或停用测试用户
  async function handleToggleStatus(row, targetStatus) {
    const action = targetStatus === 1 ? '启用' : '停用'
    try {
      const res = await updateUserStatus({
        userId: row.userId,
        status: targetStatus,
      })
      const result = res?.data
      if (result?.success === false) {
        ElMessage.error(result.message || `${action}失败`)
        return
      }
      ElMessage.success(`${action}成功`)
      // 仅同步启用/停用状态，statusName 由到期时间决定，不在操作后更新
      if (result?.data) {
        row.status = result.data.status
      }
    } catch (err) {
      const status = err?.response?.status
      if (status === 400) {
        ElMessage.error(err?.response?.data?.message || '用户不存在或已删除')
      } else if (status === 401) {
        // 401 已在响应拦截器中统一处理（提示 + 跳转）
      } else {
        ElMessage.error(err?.response?.data?.message || err.message || `${action}失败`)
      }
    }
  }

  return {
    createForm,
    creating,
    loading,
    pagedUsers,
    totalUsers,
    currentPage,
    pageSize,
    handleCreate,
    handleSave,
    handleToggleStatus,
  }
}
