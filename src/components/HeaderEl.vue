<template>
  <div class="header-el">
    <div class="brand">
      <!-- 圆形 Logo：使用项目内置轮胎图标 -->
      <span class="brand-logo">
        <!-- <img src="@/img/轮胎icon.svg" alt="logo" /> -->
      </span>
      <span class="brand-name">片剂药物智能排程系统</span>
    </div>
    <div class="right">
      <!-- 顶部一级导航 Tab：新建任务 / APS排产信息档案 -->
      <div class="header-tabs">
        <div
          class="header-tab"
          :class="{ active: isTabActive('workflow') }"
          @click="goToTab('workflow')"
        >
          <span class="header-tab-label">新建任务</span>
          <span class="header-tab-underline"></span>
        </div>
        <div
          class="header-tab"
          :class="{ active: isTabActive('aps') }"
          @click="goToTab('aps')"
        >
          <span class="header-tab-label">APS排产信息档案</span>
          <span class="header-tab-underline"></span>
        </div>
      </div>
      <div v-if="authStore.isLoggedIn" class="user-dropdown">
        <span class="user-info" @click="showMenu = !showMenu">
          <!-- 圆形头像（固定像素，不随 rem 缩放） -->
          <span class="user-avatar-circle">
            <svg viewBox="0 0 1024 1024" width="16" height="16" fill="currentColor">
              <path
                d="M288 320a224 224 0 1 0 448 0 224 224 0 1 0-448 0m544 608H160a32 32 0 0 1-32-32v-96a160 160 0 0 1 160-160h448a160 160 0 0 1 160 160v96a32 32 0 0 1-32 32z"
              />
            </svg>
          </span>
          <span class="user-dept">{{ userDept }} -</span>
          <span class="user-name">{{
            authStore.user?.realName || authStore.user?.username || '用户'
          }}</span>
          <el-icon><ArrowDown /></el-icon>
        </span>
        <div v-if="showMenu" class="dropdown-menu" @click.stop>
          <div v-if="authStore.isAdmin" class="dropdown-item" @click="goAccount">
            <el-icon><Setting /></el-icon>
            <span>账号管理</span>
          </div>
          <div class="dropdown-item" @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
            <span>退出登录</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowDown, SwitchButton, Setting } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useSchedulingStore } from '@/stores/scheduling'
import { logout as logoutApi } from '@/api/user'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const schedulingStore = useSchedulingStore()

const showMenu = ref(false)

// 部门/角色信息：优先展示部门名称，其次取角色字段兜底
const userDept = computed(() => authStore.user?.departmentName || '部门')

// 工作流页面（新建任务）对应的路径集合，命中任一即认为当前位于"新建任务"tab
const WORKFLOW_PATHS = ['/upload', '/task-data', '/model-build', '/model-solve']
const APS_PATH = '/aps-archive'

// 判断指定 tab 是否处于激活态（用于显示底部下划线）
function isTabActive(tabKey) {
  if (tabKey === 'aps') {
    return route.path === APS_PATH
  }
  if (tabKey === 'workflow') {
    return WORKFLOW_PATHS.includes(route.path)
  }
  return false
}

// 点击 tab：若已在对应路由则不重复跳转，避免触发无意义重渲染
function goToTab(tabKey) {
  if (tabKey === 'aps') {
    if (route.path === APS_PATH) return
    router.push(APS_PATH)
    return
  }
  if (tabKey === 'workflow') {
    if (WORKFLOW_PATHS.includes(route.path)) return
    router.push('/upload')
  }
}

function goAccount() {
  showMenu.value = false
  router.push({ name: 'AccountManagement' })
}

async function handleLogout() {
  showMenu.value = false
  try {
    await logoutApi({})
    ElMessage.success('退出登录成功')
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || '退出登录失败'
    ElMessage.error(message)
  } finally {
    schedulingStore.resetAll()
    authStore.clearUser()
    router.replace('/login')
  }
}

// 点击外部关闭菜单
function handleClickOutside(e) {
  const dropdown = document.querySelector('.user-dropdown')
  if (dropdown && !dropdown.contains(e.target)) {
    showMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style lang="less" scoped>
@import '@/styles/variables.less';

.header-el {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 24px;
  background: @brand-primary; // 顶部导航栏背景改为品牌蓝
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);

  .brand {
    margin-left: -10px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;

    .brand-logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;

      img {
        width: 32px;
        height: 32px;
        object-fit: contain;
      }
    }

    .brand-name {
      font-size: 1.45rem;
      // font-size: 1.8rem;
      font-weight: 700;
      color: #fff; // 品牌名在蓝色背景上改为白色
      letter-spacing: 1px;
    }
  }

  .right {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 24px;

    // 顶部一级导航 Tab：新建任务 / APS排产信息档案
    .header-tabs {
      padding-right: 24px;
      display: flex;
      align-items: center;
      gap: 36px;
      height: 100%;

      .header-tab {
        position: relative;
        display: flex;
        align-items: center;
        height: 100%;
        padding: 0 4px;
        cursor: pointer;
        user-select: none;
        transition: color 0.2s;

        .header-tab-label {
          font-size: 1.25rem;
          color: #fff; // Tab 文字在蓝色背景上改为白色
          font-weight: 500;
          letter-spacing: 0.5px;
        }

        // 底部激活下划线，默认隐藏，激活时显示
        .header-tab-underline {
          position: absolute;
          left: 0;
          right: 0;
          bottom: -5px;
          height: 2px;
          background: #fff; // 下划线在蓝色背景上改为白色
          border-radius: 2px;
          transform: scaleX(0);
          transform-origin: center;
          transition: transform 0.2s ease;
        }

        // 悬停时浅色提示
        &:hover .header-tab-label {
          color: rgba(255, 255, 255, 0.85);
        }

        // 激活态：加粗 + 下划线展开
        &.active .header-tab-label {
          color: #fff;
          font-weight: 700;
        }
        &.active .header-tab-underline {
          transform: scaleX(1);
        }
      }
    }

    .user-dropdown {
      position: relative;

      .user-info {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        color: #fff; // 用户信息在蓝色背景上改为白色

        .user-avatar-circle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2); // 白色半透明圆底，在蓝底上更清晰
          color: #fff;
          flex-shrink: 0;

          /* 固定图标像素尺寸，避免被全局 svg(em) 样式覆盖而随 rem 缩放 */
          svg {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
          }
        }

        .user-dept,
        .user-name {
          font-size: 1rem;
        }
      }

      .dropdown-menu {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 8px;
        background: #fff;
        border: 1px solid @border-color;
        border-radius: 4px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
        min-width: 140px;
        z-index: 2000;

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          cursor: pointer;
          font-size: 14px;
          color: @text-dark;

          &:hover {
            background: #f5f7fa;
          }
        }
      }
    }
  }
}
</style>
