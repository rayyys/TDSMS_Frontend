import { AUTH_STORAGE_KEY } from '@/constants/storageKeys'

export function readAuthSession() {
  const raw = sessionStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeAuthSession(data) {
  if (!data) {
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
    return
  }
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data))
}

/**
 * 检查 token 是否已过期
 * 支持 JWT 格式 token：解码 payload 中的 exp 字段判断是否过期
 * 非 JWT 格式 token 无法判断过期时间，返回 false 交由后端 401 处理
 * @param {string} token
 * @returns {boolean} 已过期返回 true，未过期或无法判断返回 false
 */
export function isTokenExpired(token) {
  if (!token || typeof token !== 'string') return true
  const parts = token.split('.')
  // 非 JWT 格式（不足三段），无法前端判断过期时间
  if (parts.length !== 3) return false
  try {
    // JWT payload 使用 base64url 编码，需转为 base64 再解码
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(payload))
    if (decoded.exp === undefined) return false
    // exp 是秒级时间戳，与当前时间比较
    return Date.now() >= decoded.exp * 1000
  } catch {
    return false
  }
}
