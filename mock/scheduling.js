/**
 * 排程业务模块 Mock（无后端时前端联调用）
 * 覆盖：模型构建配置 / 排程结果提交 / 整单提交 / 测试用户启停（旧接口）
 */

export default [
  // 提交模型构建配置
  {
    url: '/tdsms/scheduling/model-build/',
    method: 'post',
    timeout: 500,
    response: async ({ body }) => {
      return { success: true, code: 0, message: '模型配置已保存', data: {} }
    },
  },
  // 提交排程结果（完成排程）
  {
    url: '/tdsms/scheduling/result/',
    method: 'post',
    timeout: 600,
    response: async ({ body }) => {
      return { success: true, code: 0, message: '排程结果已提交', data: {} }
    },
  },
  // 提交整个排程任务
  {
    url: '/tdsms/scheduling/submit/',
    method: 'post',
    timeout: 600,
    response: async () => {
      return { success: true, code: 0, message: '排程任务已提交', data: {} }
    },
  },
  // 启用或停用测试用户（旧接口，已由 /admin/statusUpdate 取代，此处保留兜底）
  {
    url: '/tdsms/scheduling/test-user/toggle-status/',
    method: 'post',
    timeout: 400,
    response: async ({ body }) => {
      const { userId, isActive } = body || {}
      return { success: true, code: 0, message: '操作成功', data: { userId, isActive } }
    },
  },
]
