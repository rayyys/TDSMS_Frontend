<template>
  <div class="model-solve-page">
    <div class="page-header">
      <h2 class="page-title">模型求解</h2>
      <p class="page-desc">系统正在根据当前模型配置生成最优排产方案，请耐心等待...</p>
    </div>

    <div class="solve-layout">
      <!-- 上：求解状态（占满整行） -->
      <div class="solve-status">
        <!-- 求解状态卡片（水平布局：图标 + 文案 + 信息列 + 操作按钮） -->
        <div class="custom-card status-card">
          <div class="card-header">求解状态</div>
          <div class="status-row">
            <!-- 左侧：状态图标 + 主副文案 -->
            <div class="status-info">
              <div class="status-main" :class="statusClass">
                <div class="icon-wrapper">
                  <!-- 运行中：脉冲动画图标 -->
                  <svg
                    v-if="schedulingStore.solveStatus === 'running'"
                    class="pulse-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline
                      class="pulse-line"
                      points="2 12 6 12 9 3 15 21 18 12 22 12"
                    ></polyline>
                  </svg>
                  <!-- 已停止：空心方块 -->
                  <svg
                    v-else-if="schedulingStore.solveStatus === 'stopped'"
                    class="stopped-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                  </svg>
                  <!-- 默认/已完成：脉冲折线图标 -->
                  <svg
                    v-else
                    class="pulse-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline
                      class="pulse-line"
                      points="2 12 6 12 9 3 15 21 18 12 22 12"
                    ></polyline>
                  </svg>
                </div>
                <div class="status-text-block">
                  <div class="status-title">{{ statusText }}</div>
                  <div class="status-subtitle">{{ statusSubtitle }}</div>
                </div>
              </div>
            </div>

            <!-- 中间：3 列时间信息 -->
            <div class="status-time-grid">
              <div class="time-item">
                <div class="time-label">已运行时间</div>
                <div class="time-value">
                  <template v-if="schedulingStore.syncingElapsed">
                    <el-icon class="is-loading"><Loading /></el-icon>
                    <span class="syncing-hint">校准中...</span>
                  </template>
                  <template v-else>
                    {{ formatElapsed(schedulingStore.solveElapsed) }}
                  </template>
                </div>
              </div>
              <div class="time-item">
                <div class="time-label">最长求解时间</div>
                <div class="time-value">{{ maxSolveDurationText }}</div>
              </div>
              <div class="time-item">
                <div class="time-label">开始时间</div>
                <div class="time-value time-value--small">{{ solveStartTimeText }}</div>
              </div>
            </div>

            <!-- 右侧：操作按钮 -->
            <div class="status-actions">
              <el-button
                class="btn-stop"
                :loading="stoppingLoading"
                :disabled="schedulingStore.solveStatus !== 'running' || stoppingLoading"
                @click="handleStop"
              >
                <el-icon class="btn-icon"><VideoPause /></el-icon>
                停止求解
              </el-button>
              <el-button
                class="btn-export"
                :class="{ 'is-disabled': !canExport }"
                @click="handleExport"
              >
                <el-icon class="btn-icon"><Download /></el-icon>
                导出结果
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 下：左右布局：左侧求解日志，右侧参数配置概览 -->
      <div class="solve-bottom">
        <!-- 左：求解日志卡片 -->
        <div class="solve-bottom-left">
          <div class="custom-card log-card">
            <div class="card-header">求解日志</div>
            <div ref="logBoxRef" class="log-list">
              <div v-if="schedulingStore.solveLogs.length === 0" class="log-empty">
                等待求解开始...
              </div>
              <div v-for="(log, i) in schedulingStore.solveLogs" :key="i" class="log-item">
                <span class="log-dot"></span>
                <span class="log-time">{{ log.time }}</span>
                <span class="log-msg">{{ log.message }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 右：参数配置概览（4 个编号分组） -->
        <div class="solve-bottom-right">
          <div class="custom-card config-card">
            <div class="card-header">参数配置概览</div>

            <!-- 1. 排产时间设置 -->
            <div class="config-section">
              <div class="config-section-title">
                <span class="section-num">1</span>
                <span>排产时间设置</span>
              </div>
              <div class="config-list">
                <div class="config-item">
                  <span class="config-label">排产月份：</span>
                  <span class="config-value">{{ productionMonth }}</span>
                </div>
              </div>
            </div>

            <!-- 2. 生产规则配置（默认展示值，仅用于参数概览，不参与业务计算） -->
            <div class="config-section">
              <div class="config-section-title">
                <span class="section-num">2</span>
                <span>生产规则配置</span>
              </div>
              <div class="config-list">
                <div class="config-item">
                  <span class="config-label">连续运行上限：</span>
                  <span class="config-value">5.5 天</span>
                </div>
                <div class="config-item">
                  <span class="config-label">大清场时长：</span>
                  <span class="config-value">0.5 天</span>
                </div>
                <div class="config-item">
                  <span class="config-label">小清场时长：</span>
                  <span class="config-value">0.25 天</span>
                </div>
                <div class="config-item">
                  <span class="config-label">定期清场时长：</span>
                  <span class="config-value">0.5 天</span>
                </div>
              </div>
            </div>

            <!-- 3. 人员客量配置（默认展示值，仅用于参数概览，不参与业务计算） -->
            <div class="config-section">
              <div class="config-section-title">
                <span class="section-num">3</span>
                <span>人员容量配置</span>
              </div>
              <div class="config-list">
                <div class="config-item config-item--column">
                  <span class="config-label">人员容量：</span>
                  <span class="config-value">配料 2 人，压片 2 人，包衣 2 人，包装 2 人</span>
                </div>
                <!-- <div class="config-item config-item--column"> -->
                <!-- <span class="config-label">晚班人员容量：</span> -->
                <!-- <span class="config-value">配料 2 人，压片 2 人，包衣 2 人，包装 2 人</span> -->
                <!-- </div> -->
              </div>
            </div>

            <!-- 4. 算法求解时长配置 -->
            <div class="config-section">
              <div class="config-section-title">
                <span class="section-num">4</span>
                <span>算法求解时长配置</span>
              </div>
              <div class="config-list">
                <div class="config-item">
                  <span class="config-label">最大求解时间：</span>
                  <span class="config-value">{{ maxSolveDurationText }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部提示（蓝色信息条，告知导出注意事项） -->
    <div class="info-alert">
      <el-icon class="alert-icon"><InfoFilled /></el-icon>
      <div class="alert-content">
        请等待当前任务求解完成后导出排产结果。若中途退出或关闭页面，可能无法再次进入当前任务并获取求解结果。
      </div>
    </div>
  </div>

  <div class="action-bar">
    <el-button class="btn-prev" @click="handlePrev">
      <el-icon class="el-icon--left"><Back /></el-icon> 上一步
    </el-button>
    <el-button class="btn-next" @click="handleBackToUpload">
      <el-icon class="el-icon--left"><Tickets /></el-icon> 返回任务上传页面
    </el-button>
  </div>

  <!-- 底部吸底占位盒：位于操作栏下方，吸底定位 -->
  <div class="action-bar-space"></div>
</template>

<script setup>
import { VideoPause, Download, Back, Tickets, Loading, InfoFilled } from '@element-plus/icons-vue'
import { useModelSolve } from './useModelSolve'
import { useStepNav } from '../useStepNav'

const {
  schedulingStore,
  logBoxRef,
  stoppingLoading,
  statusText,
  statusSubtitle,
  statusClass,
  canExport,
  formatElapsed,
  handleStop,
  handleExport,
  // 参数概览展示数据
  productionMonth,
  solveStartTimeText,
  maxSolveDurationText,
} = useModelSolve()

const { handlePrev, handleBackToUpload } = useStepNav()
</script>

<style lang="less" scoped>
@import './modelSolve.less';
</style>
