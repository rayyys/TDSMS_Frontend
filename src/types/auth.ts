/** 登录接口返回的用户信息 */
export interface AuthUser {
  userId?: number
  username?: string
  realName?: string
  departmentName?: string
  role?: string
  status?: number
  [key: string]: unknown
}

/** 登录接口 data 字段 */
export interface AuthLoginData {
  token?: string
  userInfo?: AuthUser
  [key: string]: unknown
}

/** 登录接口统一响应 */
export interface AuthLoginResponse {
  success?: boolean
  code?: number
  message?: string
  data?: AuthLoginData
  [key: string]: unknown
}

/** 本地会话存储结构 */
export interface AuthSession {
  token?: string
  user?: AuthUser
  [key: string]: unknown
}
