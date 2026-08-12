import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { nowStr } from '@/utils/dateUtils'

/**
 * 账号管理 Store
 * 字段：
 *   - userId    工号
 *   - name      姓名
 *   - role      角色（admin 管理员 / user 普通用户 / test 测试账号）
 *   - isActive  是否启用
 *   - isTestUser 是否测试账号
 *   - testExpiresAt 测试账号过期时间（ISO 字符串，可空）
 *   - createdAt 创建时间
 *   - remark    备注
 */

const STORAGE_KEY = 'ivsms_account_list'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveToStorage(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export const useAccountStore = defineStore('account', () => {
  const accounts = ref(loadFromStorage())
  const keyword = ref('')

  const filteredAccounts = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    if (!kw) return accounts.value
    return accounts.value.filter(
      (a) =>
        a.userId.toLowerCase().includes(kw) ||
        a.name.toLowerCase().includes(kw) ||
        (a.remark || '').toLowerCase().includes(kw),
    )
  })

  function genUserId() {
    const max = accounts.value.reduce((m, a) => {
      const n = parseInt(String(a.userId).replace(/\D/g, ''), 10)
      return Number.isFinite(n) && n > m ? n : m
    }, 0)
    return `user${String(max + 1).padStart(3, '0')}`
  }

  function addAccount(data) {
    const exists = accounts.value.some((a) => a.userId === data.userId)
    if (exists) {
      return { ok: false, msg: `工号「${data.userId}」已存在` }
    }
    const account = {
      userId: data.userId || genUserId(),
      name: data.name || '',
      role: data.role || 'user',
      isActive: data.isActive !== false,
      isTestUser: data.role === 'test' || data.isTestUser === true,
      testExpiresAt: data.testExpiresAt || null,
      createdAt: nowStr(),
      remark: data.remark || '',
    }
    accounts.value.unshift(account)
    saveToStorage(accounts.value)
    return { ok: true }
  }

  function updateAccount(userId, updates) {
    const idx = accounts.value.findIndex((a) => a.userId === userId)
    if (idx < 0) return { ok: false, msg: '账号不存在' }
    const next = { ...accounts.value[idx], ...updates }
    // 测试账号联动
    if (next.role === 'test') {
      next.isTestUser = true
    } else {
      next.isTestUser = false
      next.testExpiresAt = null
    }
    accounts.value[idx] = next
    saveToStorage(accounts.value)
    return { ok: true }
  }

  function deleteAccount(userId) {
    if (userId === 'admin') {
      return { ok: false, msg: '默认管理员不可删除' }
    }
    accounts.value = accounts.value.filter((a) => a.userId !== userId)
    saveToStorage(accounts.value)
    return { ok: true }
  }

  function resetPassword(userId) {
    const exists = accounts.value.some((a) => a.userId === userId)
    if (!exists) return { ok: false, msg: '账号不存在' }
    // mock：返回默认密码
    return { ok: true, password: '123456' }
  }

  function toggleActive(userId) {
    const idx = accounts.value.findIndex((a) => a.userId === userId)
    if (idx < 0) return { ok: false, msg: '账号不存在' }
    accounts.value[idx].isActive = !accounts.value[idx].isActive
    saveToStorage(accounts.value)
    return { ok: true }
  }

  function toggleAdmin(userId) {
    const idx = accounts.value.findIndex((a) => a.userId === userId)
    if (idx < 0) return { ok: false, msg: '账号不存在' }
    const cur = accounts.value[idx]
    if (userId === 'admin') {
      return { ok: false, msg: '默认管理员不可取消' }
    }
    cur.role = cur.role === 'admin' ? 'user' : 'admin'
    saveToStorage(accounts.value)
    return { ok: true }
  }

  return {
    accounts,
    keyword,
    filteredAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
    resetPassword,
    toggleActive,
    toggleAdmin,
  }
})
