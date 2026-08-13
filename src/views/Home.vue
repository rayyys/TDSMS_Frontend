<template>
  <div class="workflow">
    <el-container class="whole">
      <el-header class="top-bar">
        <HeaderEl />
      </el-header>
      <el-container class="body">
        <!-- 左侧：步骤标签栏（已完成步骤可点击回退，不允许通过侧栏前进） -->
        <el-aside v-if="!isStandalone" class="sidebar" width="220px">
          <ul class="step-list">
            <li
              v-for="(step, idx) in schedulingStore.steps"
              :key="step.key"
              class="step-item"
              :class="{
                active: idx === schedulingStore.currentStepIndex,
                done: idx < schedulingStore.currentStepIndex,
                clickable: idx <= schedulingStore.maxVisitedStepIndex,
                disabled: idx > schedulingStore.maxVisitedStepIndex,
              }"
              @click="idx <= schedulingStore.maxVisitedStepIndex && handleSidebarClick(idx)"
            >
              <el-icon v-if="stepImgMap[step.key]" class="step-icon">
                <img class="step-img" :src="stepImgMap[step.key]" alt="" />
              </el-icon>
              <el-icon v-else class="step-icon"><component :is="stepIconMap[step.key]" /></el-icon>
              <span class="step-label">{{ step.label }}</span>
              <el-icon v-if="idx < schedulingStore.currentStepIndex" class="step-check">
                <Check />
              </el-icon>
            </li>
          </ul>
        </el-aside>
        <!-- 右侧：内容区 -->
        <el-main class="content" :class="{ 'content-full': isStandalone }">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Check, Upload, View, Tools, Cpu } from '@element-plus/icons-vue'
import HeaderEl from '@/components/HeaderEl.vue'
import imgModelBuild from '@/img/3.png'
import imgModelSolve from '@/img/4.png'
import { useSchedulingStore } from '@/stores/scheduling'
import { useAuthStore } from '@/stores/auth'
import { readAuthSession, isTokenExpired } from '@/utils/authSession'

const router = useRouter()
const route = useRoute()
const schedulingStore = useSchedulingStore()
const authStore = useAuthStore()

// 步骤图标映射（数据上传/任务数据/模型构建/模型求解）
const stepIconMap = {
  upload: Upload,
  taskData: View,
  modelBuild: Tools,
  modelSolve: Cpu,
}

// 步骤图片映射：模型构建 / 模型求解 使用本地图片作为图标
const stepImgMap = {
  modelBuild: imgModelBuild,
  modelSolve: imgModelSolve,
}

// 步骤与路由的映射
const STEP_ROUTES = ['/upload', '/task-data', '/model-build', '/model-solve']

// 独立页面（如账号管理）：隐藏工作流侧栏
const isStandalone = computed(() => Boolean(route.meta?.standalone))

// 挂载时根据当前 URL 同步步骤（支持直接访问 /task-data 等）
onMounted(() => {
  const idx = STEP_ROUTES.indexOf(route.path)
  if (idx >= 0 && idx !== schedulingStore.currentStepIndex) {
    schedulingStore.goToStep(idx)
  }
})

// 路由变化后同步步骤（处理浏览器前进/后退、从账号管理返回等场景）
watch(
  () => route.path,
  (path) => {
    const idx = STEP_ROUTES.indexOf(path)
    if (idx >= 0 && idx !== schedulingStore.currentStepIndex) {
      schedulingStore.goToStep(idx)
    }
  },
)

// 侧边栏点击：只允许回退到当前页或之前的页面，不允许通过侧栏前进
function handleSidebarClick(idx) {
  router.push(STEP_ROUTES[idx])
}

// ===== 定时检测 token 过期，实时跳转登录页 =====
let tokenCheckTimer = null

function checkTokenExpired() {
  const token = readAuthSession()?.token
  if (token && isTokenExpired(token)) {
    clearInterval(tokenCheckTimer)
    tokenCheckTimer = null
    schedulingStore.resetAll()
    authStore.clearUser()
    ElMessage.warning('登录状态已失效，请重新登录')
    router.replace('/login')
  }
}

onMounted(() => {
  // 每 30 秒检查一次 token 是否过期
  tokenCheckTimer = setInterval(checkTokenExpired, 30000)
})

onBeforeUnmount(() => {
  if (tokenCheckTimer) {
    clearInterval(tokenCheckTimer)
    tokenCheckTimer = null
  }
})
</script>

<style lang="less" scoped>
@import '@/styles/variables.less';

.workflow {
  width: 100%;
  height: 100vh;
  box-sizing: border-box;
  // border-bottom: 10px solid #f4f7fc;

  .whole {
    height: 100%;
    flex-direction: column;
  }

  .top-bar {
    height: 80px !important;
    padding: 0;
    background: #fff;
    border-bottom: 1px solid @border-color;
    border-left: 10px solid #fff;
    border-top: 10px solid #fff;
    border-right: 10px solid #fff;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .sidebar {
    width: 220px;
    flex-shrink: 0;
    // background: #f9fbfb;
    color: @text-dark;
    display: flex;
    flex-direction: column;
    // border-left: 10px solid #fff;
    margin-left: 10px;
    margin-bottom: 10px;
    // border-bottom: 10px solid #f4f7fc;
    border: 1.8px solid #F1F3F6;

    .step-list {
      list-style: none;
      padding: 12px 0;
      margin: 0;
    }

    .step-item {
      border-radius: 6px;
      display: flex;
      align-items: center;
      height: 50px;
      padding: 0 16px;
      margin-left: 8px;
      margin-right: 30px;
      margin-bottom: 10px;
      cursor: not-allowed;
      color: #718096;
      position: relative;

      .step-icon {
        margin-right: 10px;
        font-size: 16px;
        flex-shrink: 0;
      }

      .step-img {
        width: 16px;
        height: 16px;
        display: block;
      }

      .step-label {
        flex: 1;
        font-size: 1rem;
      }

      .step-check {
        color: #48bb78;
      }

      &.clickable {
        cursor: pointer;

        &:not(.active):hover {
          background: @brand-primary-light;
        }
      }

      &.active {
        color: #fff;
        background: @brand-primary;

        .step-img {
          // 选中态下将图片变为白色
          filter: brightness(0) invert(1);
        }

        .step-check {
          color: #fff;
        }
      }

      &.done {
        color: #4a5568;

        .step-check {
          color: #48bb78;
        }
      }

      &.disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }
    }
  }

  .content {
    // background: #f4f7fc;
    padding: 20px 20px 0px 20px;
    overflow: auto;
  }

  // 独立页面（如 APS 档案）使用白色内容背景，四周 1.25rem 内边距
  .content-full {
    background: #fff;
    padding: 1.25rem;
  }
}
</style>
