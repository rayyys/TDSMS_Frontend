<template>
  <div class="header-el">
    <div class="brand">
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
      <!-- 开发调试开关：跳过权限校验，后端未就绪时可访问受限页面 -->
      <div
        v-if="authStore.isLoggedIn"
        class="dev-skip-auth"
        title="开发调试用：开启后可访问账号管理等受限页面"
      >
        <span class="dev-skip-auth-label">跳过权限</span>
        <el-switch v-model="skipAuth" size="small" @change="handleToggleSkip" />
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
        <!-- v-show 绑定 showMenu：点击头像切换显示，点击外部/菜单项后自动收起 -->
        <div class="dropdown-menu" v-show="showMenu" @click.stop>
          <!-- 账号管理：管理员可见；开发调试开关开启时对所有人可见，便于联调 -->
          <div v-if="isAdminVisible" class="dropdown-item" @click="goToAccount">
            <el-icon><UserFilled /></el-icon>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, SwitchButton, UserFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useSchedulingStore } from '@/stores/scheduling'
import { useApsStore } from '@/stores/aps'
import { logout as logoutApi } from '@/api/user'
import { isSkipAuthEnabled, setSkipAuthEnabled } from '@/utils/authUser'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const schedulingStore = useSchedulingStore()
const apsStore = useApsStore()

const showMenu = ref(false)

// 开发调试开关：开启后绕过路由守卫，可访问账号管理等受限页面（状态持久化到 localStorage）
const skipAuth = ref(isSkipAuthEnabled())

// 账号管理入口可见性：真实管理员，或开发调试开关开启
const isAdminVisible = computed(() => authStore.isAdmin || skipAuth.value)

// 切换开发调试开关
function handleToggleSkip(val) {
  setSkipAuthEnabled(val)
  ElMessage.success(val ? '已开启跳过权限，可访问任何页面' : '已关闭跳过权限')
}

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

// 任务流是否处于进行状态：存在已创建任务（taskId/importId）或曾发起求解（含进行中/已结束）
const isTaskFlowInProgress = computed(
  () =>
    Boolean(schedulingStore.taskInfo?.taskId || schedulingStore.taskInfo?.importId) ||
    schedulingStore.solveStatus !== 'idle',
)

// 再次点击"新建任务"标签：任务流进行中时二次确认，确认后清空当前任务并回到任务上传页
// 在模型求解页触发时，行为与操作栏"返回任务上传页面"按钮一致（含停止后端求解）
async function handleRestartTask() {
  try {
    await ElMessageBox.confirm('是否开始新的任务？', '新建任务', {
      type: 'warning',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    })
    await schedulingStore.backToUpload()
    router.push('/upload')
  } catch {
    // 用户取消
  }
}

// 点击 tab：若已在对应路由则不重复跳转，避免触发无意义重渲染
function goToTab(tabKey) {
  if (tabKey === 'aps') {
    if (route.path === APS_PATH) return
    // 记录进入档案页前的来源工作流页面，供"新建任务"标签返回原页面（非工作流来源不记录）
    if (WORKFLOW_PATHS.includes(route.path)) {
      schedulingStore.setApsOrigin(route.path)
    }
    router.push(APS_PATH)
    return
  }
  if (tabKey === 'workflow') {
    // 已在档案页：优先返回进入档案页前的来源页面，恢复原页面状态
    if (route.path === APS_PATH) {
      const origin = schedulingStore.apsOriginPath
      router.push(WORKFLOW_PATHS.includes(origin) ? origin : '/upload')
      return
    }
    // 已处于"新建任务"工作流中：任务进行中时再次点击需二次确认后重开新任务
    if (WORKFLOW_PATHS.includes(route.path)) {
      if (isTaskFlowInProgress.value) {
        handleRestartTask()
      }
      return
    }
    router.push('/upload')
  }
}

// 跳转账号管理页面（仅管理员可见入口），跳转前关闭下拉菜单
function goToAccount() {
  showMenu.value = false
  if (route.path === '/account') return
  router.push('/account')
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
    // 清空 APS 方案状态与本地缓存，避免切换账号时串用上一账号的方案数据
    apsStore.resetState()
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

    // 开发调试开关：跳过权限校验（后端未就绪时用于联调）
    .dev-skip-auth {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #fff;

      .dev-skip-auth-label {
        font-size: 0.95rem;
        white-space: nowrap;
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
