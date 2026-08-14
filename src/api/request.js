import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'
import { readAuthSession } from '@/utils/authSession'
import { useAuthStore } from '@/stores/auth'

const skipAuthPaths = ['/auth/login']
const skipAuthRedirectPaths = ['/auth/login']
let authRedirecting = false

const service = axios.create({
  // 开发环境使用相对路径，走 Vite 代理；生产环境可在打包时通过环境变量注入
  baseURL: '/tdsms',
  timeout: 600000,
})

// 请求拦截器：自动带 token
service.interceptors.request.use(
  (config) => {
    if (config.url && !skipAuthPaths.includes(config.url)) {
      const token = readAuthSession()?.token
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }

    // 上传 FormData 时强制移除 Content-Type，由浏览器自动补全 boundary
    // 避免手动设置 multipart/form-data 但没有 boundary，导致后端解析失败
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  (error) => {
    console.error('请求错误:', error)
    return Promise.reject(error)
  },
)

// 响应拦截器：401 跳登录
service.interceptors.response.use(
  (response) => response,
  async (error) => {
    const response = error.response
    const msg = typeof error.message === 'string' ? error.message : ''
    const isTimeout =
      error.code === 'ECONNABORTED' || /timeout/i.test(msg) || error.code === 'ETIMEDOUT'
    if (isTimeout && !response) {
      error.message = '请求超时'
    }

    // 后端将登录态失效统一返回 403（部分场景返回 401），两者都需要跳转登录页
    if (response?.status === 401 || response?.status === 403) {
      const requestUrl = error.config?.url ?? ''
      const isAuthUrl = skipAuthRedirectPaths.some((p) => requestUrl.includes(p))
      if (!isAuthUrl && !authRedirecting) {
        authRedirecting = true
        // 清除登录状态（sessionStorage + Pinia store），保持两端状态一致
        useAuthStore().clearUser()
        // 先提示再跳转，确保用户能看到失效信息
        ElMessage.warning('登录状态已失效，请重新登录')
        try {
          // router.replace 在 Vue Router 4 中失败时不抛异常，而是 resolve(NavigationFailure)
          // 需判断返回值来检测导航是否成功
          const navResult = await router.replace('/login')
          if (navResult) {
            // 导航失败（如被守卫拦截），降级使用 location.href 强制跳转
            window.location.href = '/login'
          }
        } catch {
          // router 抛出异常时降级使用 location.href
          window.location.href = '/login'
        } finally {
          authRedirecting = false
        }
        // 返回 resolved promise，阻止错误继续传播到业务代码的 catch
        // 避免出现第二条错误提示（如"提交失败：Request failed with status code 403"）
        return Promise.resolve({ data: null })
      }
    }

    return Promise.reject(error)
  },
)

export default service
