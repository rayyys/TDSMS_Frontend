<template>
  <div class="login-wrap">
    <div class="login-form">
      <h1 class="title">片剂药物智能排程系统（TVIS）</h1>
      <el-form :model="loginForm" @keydown.enter="login">
        <el-form-item>
          <el-input v-model="loginForm.username" placeholder="账号" :prefix-icon="User" />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="loginForm.password"
            placeholder="密码"
            show-password
            :prefix-icon="Lock"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" style="width: 100%" :loading="loginLoading" @click="login">
            登&nbsp;&nbsp;录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { login as loginApi } from '@/api/user'

const router = useRouter()
const authStore = useAuthStore()

const loginForm = ref({ username: '', password: '' })
const loginLoading = ref(false)

function validateForm() {
  const { username, password } = loginForm.value
  if (!username?.trim() || !password?.trim()) {
    ElMessage.warning('账户和密码不能为空')
    return false
  }
  return true
}

function extractApiMessage(error) {
  const data = error?.response?.data
  if (data && typeof data.message === 'string') {
    return data.message
  }
  return error?.message || '登录失败，请稍后重试'
}

async function login() {
  if (loginLoading.value) return
  if (!validateForm()) return

  loginLoading.value = true
  try {
    const res = await loginApi({
      username: loginForm.value.username.trim(),
      password: loginForm.value.password,
    })
    const result = res?.data
    const token = result?.data?.token
    const userInfo = result?.data?.userInfo

    if (!result?.success || !token || !userInfo) {
      ElMessage.error(result?.message || '登录失败，请稍后重试')
      return
    }

    authStore.setUser({ token, user: userInfo })
    router.push('/upload')
    ElMessage.success(
      result.message || `登录成功，欢迎 ${userInfo.realName || userInfo.username || '用户'}`,
    )
  } catch (error) {
    const status = error?.response?.status
    const message = extractApiMessage(error)

    if (status === 400) {
      ElMessage.error(message || '请求参数错误')
    } else if (status === 401) {
      ElMessage.error(message || '账户或密码错误')
    } else if (status === 403) {
      ElMessage.error(message || '该账户已被禁用，请联系管理员')
    } else {
      ElMessage.error(message)
    }
  } finally {
    loginLoading.value = false
  }
}
</script>

<style lang="less" scoped>
@import '@/styles/variables.less';

.login-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  // 背景：药品生产车间实景图（用相对路径避免 less 中 @ 被误判为变量）
  background: url('../img/背景图片@2x.jpg') center center / cover no-repeat;
  position: relative;

  .login-form {
    position: relative;
    z-index: 1;
    width: 35rem;
    height: 18rem;
    padding: 40px;
    // 毛玻璃效果：半透明 + 模糊
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);

    .title {
      margin-top: 18px;
      text-align: center;
      margin-bottom: 50px;
      color: @brand-primary;
      font-size: 22px;
      font-weight: 700;
    }

    // 登录按钮：白色背景 + 蓝色文字（与设计稿一致）
    :deep(.el-button--primary) {
      background: #fff;
      color: @brand-primary;
      border-color: @brand-primary;
      font-size: 20px;
      padding: 18px;
      font-weight: 700;
      letter-spacing: 4px;
      margin-top: 20px;
      &:hover {
        background: @brand-primary-light;
        color: @brand-primary;
        border-color: @brand-primary;
      }
    }
  }
}
</style>
