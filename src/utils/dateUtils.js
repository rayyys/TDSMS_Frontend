/**
 * 日期公共工具函数
 */

/**
 * 判断测试账号是否已过期
 * @param {string|null} expiresAt 过期时间字符串（如 "2024-12-31 23:59"）
 * @returns {boolean}
 */
export function isExpired(expiresAt) {
  if (!expiresAt) return false
  const t = new Date(expiresAt.replace(' ', 'T')).getTime()
  return Number.isFinite(t) && t < Date.now()
}

/**
 * 格式化当前时间为 YYYY-MM-DD HH:mm
 * @returns {string}
 */
export function nowStr() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
