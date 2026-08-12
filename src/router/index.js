import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { readAuthSession, isTokenExpired } from '@/utils/authSession'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/Login.vue'),
  },
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/Home.vue'),
    redirect: '/upload',
    children: [
      {
        path: '/upload',
        name: 'DataUpload',
        component: () => import('@/views/home/data-upload/DataUpload.vue'),
      },
      {
        path: '/task-data',
        name: 'TaskData',
        component: () => import('@/views/home/task-data/TaskData.vue'),
      },
      {
        path: '/model-build',
        name: 'ModelBuild',
        component: () => import('@/views/home/model-build/ModelBuild.vue'),
      },
      {
        path: '/model-solve',
        name: 'ModelSolve',
        component: () => import('@/views/home/model-solve/ModelSolve.vue'),
      },
      {
        path: '/account',
        name: 'AccountManagement',
        component: () => import('@/views/home/account-management/AccountManagement.vue'),
        meta: { standalone: true },
      },
      {
        // APS 排产信息档案：顶部 Tab 入口，目标独立于工作流流程
        path: '/aps-archive',
        name: 'ApsArchive',
        component: () => import('@/views/home/aps-archive/ApsArchive.vue'),
        meta: { standalone: true },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 全局前置守卫：未登录或 token 过期则跳转到 /login
// Vue Router 5：守卫返回值替代 next() 回调
router.beforeEach(async (to, from) => {
  if (to.path === '/login') {
    return true
  }
  const session = readAuthSession()
  const token = session?.token ?? null
  if (!token) {
    return '/login'
  }

  // token 已过期：清除登录状态并提示用户
  if (isTokenExpired(token)) {
    useAuthStore().clearUser()
    ElMessage.warning('登录状态已失效，请重新登录')
    return '/login'
  }

  return true
})

export default router
