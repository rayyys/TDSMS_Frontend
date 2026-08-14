export function isAuthTestUser(user) {
  return Boolean(user?.isTestUser)
}

export function isAuthAdmin(user) {
  return user?.isAdmin === 1
}

// —— 开发调试开关：跳过管理员权限校验 ——
// 后端未就绪时，临时开启后可访问账号管理等受限页面，方便联调
const SKIP_AUTH_KEY = 'ivsms_skip_auth'

export function isSkipAuthEnabled() {
  return localStorage.getItem(SKIP_AUTH_KEY) === '1'
}

export function setSkipAuthEnabled(enabled) {
  if (enabled) {
    localStorage.setItem(SKIP_AUTH_KEY, '1')
  } else {
    localStorage.removeItem(SKIP_AUTH_KEY)
  }
}
