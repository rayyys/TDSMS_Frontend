/**
 * 账号管理模块 Mock（无后端时前端联调用）
 * 覆盖：创建测试用户 / 查询用户列表 / 更新有效期 / 启用停用
 * 注意：响应函数需为同步函数，延迟用 timeout 字段控制；动态状态码用 rawResponse。
 */

// 测试用户列表（内存态，创建后会追加）
let userSeq = 10
const testUsers = [
  { userId: 1, username: 'tester01', company: '华东轮胎销售公司', departmentName: '生产部', remainingDays: 25, status: 1, statusName: '正常' },
  { userId: 2, username: 'tester02', company: '华南汽配集团', departmentName: '质检部', remainingDays: 3, status: 1, statusName: '正常' },
  { userId: 3, username: 'tester03', company: '西南工程机械', departmentName: '设备部', remainingDays: 0, status: 0, statusName: '已过期' },
  { userId: 4, username: 'tester04', company: '北方重工', departmentName: '调度中心', remainingDays: 15, status: 1, statusName: '正常' },
  { userId: 5, username: 'tester05', company: '长三角物流', departmentName: '信息部', remainingDays: 7, status: 1, statusName: '正常' },
]

export default [
  // 创建测试用户（需要动态返回 400，故用 rawResponse）
  {
    url: '/ivsms/admin/create',
    method: 'post',
    timeout: 600,
    rawResponse(req, res) {
      this.parseJson().then((body) => {
        const { username = '', password = '', validDays, departmentName = '', company = '' } = body || {}
        res.setHeader('Content-Type', 'application/json')

        // 异常模拟：用户名为 error 时返回 400（账号已存在）
        if (username === 'error') {
          res.statusCode = 400
          res.end(JSON.stringify({ success: false, code: 400, message: '账号已存在' }))
          return
        }

        const user = {
          userId: ++userSeq,
          username,
          company,
          departmentName,
          remainingDays: Number(validDays) || 30,
          status: 1,
          statusName: '正常',
        }
        testUsers.unshift(user)
        res.statusCode = 200
        res.end(JSON.stringify({ success: true, code: 0, message: '创建成功', data: user }))
      })
    },
  },
  // 查询测试用户列表（分页）
  {
    url: '/ivsms/admin/query',
    method: 'get',
    timeout: 400,
    response: ({ query }) => {
      const { page = 1, pageSize = 10 } = query || {}
      const start = (Number(page) - 1) * Number(pageSize)
      const records = testUsers.slice(start, start + Number(pageSize))
      return {
        success: true,
        code: 0,
        message: 'success',
        data: { total: testUsers.length, pageNum: Number(page), pageSize: Number(pageSize), records },
      }
    },
  },
  // 更新测试用户有效期
  {
    url: '/ivsms/admin/expireUpdate',
    method: 'post',
    timeout: 400,
    response: ({ body }) => {
      const { userId, validDays } = body || {}
      const user = testUsers.find((u) => u.userId === Number(userId))
      if (user) {
        user.remainingDays = Number(validDays)
        user.status = Number(validDays) > 0 ? 1 : 0
        user.statusName = Number(validDays) > 0 ? '正常' : '已过期'
      }
      return { success: true, code: 0, message: '更新成功', data: {} }
    },
  },
  // 启用或停用测试用户（status: 0=停用, 1=启用）
  {
    url: '/ivsms/admin/statusUpdate',
    method: 'post',
    timeout: 400,
    response: ({ body }) => {
      const { userId, status } = body || {}
      const user = testUsers.find((u) => u.userId === Number(userId))
      if (user) {
        user.status = Number(status)
        if (Number(status) === 0) {
          user.statusName = '已停用'
        }
      }
      return { success: true, code: 0, message: '操作成功', data: { status: Number(status) } }
    },
  },
]
