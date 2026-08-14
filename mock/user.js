/**
 * 用户认证模块 Mock（无后端时前端联调用）
 * 覆盖：登录 / 退出登录 / 注册
 *
 * 注意：本插件响应函数需为同步函数，延迟用 timeout 字段控制；
 *      需要动态 HTTP 状态码（如登录失败 401）的接口用 rawResponse 手动返回。
 */

export default [
  {
    url: '/tdsms/auth/login',
    method: 'post',
    timeout: 600,
    // 登录需要动态返回 200/401，故用 rawResponse 手动控制状态码
    rawResponse(req, res) {
      this.parseJson().then((body) => {
        const { username = '', password = '' } = body || {}
        res.setHeader('Content-Type', 'application/json')

        // 异常模拟：密码为 error 时返回 401（账户或密码错误）
        if (password === 'error') {
          res.statusCode = 401
          res.end(JSON.stringify({ success: false, code: 401, message: '账户或密码错误' }))
          return
        }

        // 正常登录：返回 token 与用户信息（role=admin 使"账号管理"入口可见）
        res.statusCode = 200
        res.end(
          JSON.stringify({
            success: true,
            code: 0,
            message: '登录成功',
            data: {
              token: `mock-token-${Date.now()}`,
              userInfo: {
                userId: 1,
                username,
                realName: '演示管理员',
                departmentName: '生产管理部',
                role: 'admin',
                status: 1,
              },
            },
          }),
        )
      })
    },
  },
  {
    url: '/tdsms/auth/logout',
    method: 'post',
    timeout: 300,
    response: () => {
      return { success: true, code: 0, message: '退出登录成功' }
    },
  },
  {
    url: '/tdsms/user/register/',
    method: 'post',
    response: () => {
      return { success: true, code: 0, message: '注册成功', data: {} }
    },
  },
]
