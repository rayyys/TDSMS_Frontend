<template>
  <div class="model-build-page">
    <div class="page-header">
      <h2 class="page-title">模型构建</h2>
      <p class="page-desc">配置求解所需的业务参数，系统将根据配置进行排程计算。</p>
    </div>

    <!-- 部门选择（必填，下拉选项来自上传 Excel 的“部门”列） -->
    <div class="department-block">
      <div class="department-label-row">
        <span class="department-name">部门</span>
        <span class="required-mark">*</span>
        <span class="department-colon">：</span>
        <span class="department-desc">请选择本次排产对应的生产车间，仅可选择一个车间。</span>
      </div>
      <div class="department-select-row">
        <el-select
          v-model="schedulingStore.selectedDepartment"
          placeholder="请选择车间"
          class="department-select"
          :disabled="isModelBuildLocked"
          :loading="departmentOptionsLoading"
          style="width: 15.25rem !important"
        >
          <el-option v-for="dept in departmentOptions" :key="dept" :label="dept" :value="dept" />
        </el-select>
      </div>
    </div>

    <div class="model-build-container">
      <!-- 1. 排产时间设置 -->
      <div class="section">
        <div class="section-title">
          <span class="section-num">1</span>
          <span>排产时间设置</span>
          <span class="required-mark">*</span>
        </div>

        <div class="time-settings-grid">
          <div class="setting-item setting-item--narrow">
            <div class="setting-content">
              <span class="setting-name">排产月份</span>
              <el-date-picker
                v-model="schedulingStore.productionMonth"
                type="month"
                placeholder="选择月份"
                format="YYYY年MM月"
                value-format="YYYY-MM"
                class="full-width-input"
                :disabled="isModelBuildLocked"
                style="width: 15.25rem !important"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 2. 生产规则配置 -->
      <div class="section">
        <div class="section-title">
          <span class="section-num">2</span>
          <span>生产规则配置</span>
          <span class="required-mark">*</span>
        </div>

        <div class="rules-block">
          <!-- 连续运行上限 -->
          <div class="rule-row">
            <div class="rule-label">连续运行上限</div>
            <div class="rule-control">
              <el-input-number
                v-model="schedulingStore.continuousRunLimit"
                :min="0"
                :step="0.5"
                :precision="2"
                :controls="true"
                controls-position="right"
                :disabled="isModelBuildLocked"
                class="stable-input-number"
              />
              <span class="rule-unit">天</span>
            </div>
            <div class="rule-hint">
              配置设备连续运行的最大时长，若连续生产时间超过该上限，则需要插入定期清场。
            </div>
          </div>

          <!-- 清场时长配置 -->
          <div class="rule-group">
            <div class="rule-group-title">清场时长配置</div>
            <div class="rule-row rule-row--triple">
              <div class="rule-subitem">
                <div class="rule-sublabel">大清场（配料、压片、包衣工序）</div>
                <div class="rule-control">
                  <el-input-number
                    v-model="schedulingStore.cleaningTimeLarge"
                    :min="0"
                    :step="0.05"
                    :precision="2"
                    :controls="true"
                    controls-position="right"
                    :disabled="isModelBuildLocked"
                    class="stable-input-number"
                  />
                  <span class="rule-unit">天</span>
                </div>
              </div>
              <div class="rule-subitem">
                <div class="rule-sublabel">小清场（包装工序）</div>
                <div class="rule-control">
                  <el-input-number
                    v-model="schedulingStore.cleaningTimeSmall"
                    :min="0"
                    :step="0.05"
                    :precision="2"
                    :controls="true"
                    controls-position="right"
                    :disabled="isModelBuildLocked"
                    class="stable-input-number"
                  />
                  <span class="rule-unit">天</span>
                </div>
              </div>
              <div class="rule-subitem">
                <div class="rule-sublabel">定期清场（所有工序）</div>
                <div class="rule-control">
                  <el-input-number
                    v-model="schedulingStore.cleaningTimeRegular"
                    :min="0"
                    :step="0.05"
                    :precision="2"
                    :controls="true"
                    controls-position="right"
                    :disabled="isModelBuildLocked"
                    class="stable-input-number"
                  />
                  <span class="rule-unit">天</span>
                </div>
              </div>
            </div>
            <div class="rule-hint">
              大清场用于配料、压片、包衣前三道工序切换；小清场用于包装工序切换；定期清场在设备连续运行达到上限后插入。
            </div>
          </div>

          <!-- 班次换算配置 -->
          <div class="rule-group">
            <div class="rule-group-title">班次换算配置</div>
            <div class="rule-row rule-row--shift">
              <div class="rule-control">
                <!-- 天数固定为 1 天，不允许用户手动修改，提交时统一引用 SHIFT_DAYS_FIXED 固定值 -->
                <span class="shift-days-fixed">{{ SHIFT_DAYS_FIXED }}</span>
                <span class="rule-unit">天 =</span>
                <el-input-number
                  v-model="schedulingStore.shiftHours"
                  :min="1"
                  :step="1"
                  :precision="0"
                  :controls="true"
                  controls-position="right"
                  :disabled="isModelBuildLocked"
                  class="stable-input-number"
                />
                <span class="rule-unit">班时</span>
              </div>
            </div>
            <div class="rule-hint">设置自然时间与生产班次的换算规则，用于排产过程中时间计算。</div>
          </div>
        </div>
      </div>

      <!-- 3. 人员容量配置 -->
      <div class="section">
        <div class="section-title">
          <span class="section-num">3</span>
          <span>人员容量配置</span>
          <span class="required-mark">*</span>
        </div>

        <div class="capacity-block">
          <!-- 早班人员容量 -->
          <div class="capacity-group">
            <div class="capacity-group-title"></div>
            <div class="capacity-row">
              <div v-for="key in capacityKeys" :key="`morning-${key}`" class="capacity-item">
                <span class="capacity-label">{{ key }}用人</span>
                <div class="capacity-control">
                  <el-input-number
                    v-model="schedulingStore.morningShiftCapacity[key]"
                    :min="0"
                    :step="1"
                    :precision="0"
                    :controls="false"
                    :disabled="isModelBuildLocked"
                    class="stable-input-number"
                    style="padding-left: 12px"
                  >
                    <template #suffix>
                      <span class="rule-unit">人</span>
                    </template>
                  </el-input-number>
                </div>
              </div>
            </div>
          </div>

          <!-- 晚班人员容量已下线，不再展示与提交 -->

          <div class="rule-hint capacity-hint">
            表示每个工序在同一时间内，最多可同时开启的各工序的人员容量。
          </div>
        </div>
      </div>

      <!-- 4. 算法求解时长配置 -->
      <div class="section">
        <div class="section-title">
          <span class="section-num">4</span>
          <span>算法求解时长配置</span>
          <span class="required-mark">*</span>
        </div>

        <div class="time-settings-grid">
          <div class="setting-item setting-item--narrow">
            <div class="setting-content">
              <span class="setting-name">最大求解时间</span>
              <el-select
                v-model="schedulingStore.maxSolveTime"
                placeholder="选择时间"
                class="full-width-input"
                :disabled="isModelBuildLocked"
                style="width: 10.25rem !important"
              >
                <el-option
                  v-for="opt in schedulingStore.solveTimeOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </div>
          </div>
        </div>
        <div class="rule-hint">设置算法最大求解时间，时间越长通常有更多机会得到更优方案。</div>
      </div>
    </div>
  </div>

  <div class="action-bar">
    <el-button class="btn-prev" @click="handlePrev">
      <el-icon class="el-icon--left"><Back /></el-icon> 上一步
    </el-button>
    <!-- 右侧操作按钮组：恢复默认参数 + 开始求解，紧邻排列 -->
    <div class="action-right">
      <el-button class="btn-reset" :disabled="isModelBuildLocked" @click="handleResetDefaults">
        恢复默认参数
      </el-button>
      <el-button
        type="primary"
        class="btn-next"
        :class="{ 'btn-disabled': !canStartSolve }"
        :loading="solvingLoading"
        :disabled="isSolveBtnDisabled"
        @click="handleStartSolve('SKIP')"
      >
        {{ solveBtnText }}
      </el-button>
    </div>
  </div>

  <!-- 底部吸底占位盒：位于操作栏下方，吸底定位 -->
  <div class="action-bar-space"></div>

  <!-- 数据匹配校验弹窗：solve/matchCheck 接口查询到未匹配 APS 档案记录时展示 -->
  <!-- 弹窗宽度以 rem 固定（1920 设计稿基准下约 1096px）：随窗口等比缩放，浏览器 Ctrl+滚轮缩放时视觉宽度保持稳定 -->
  <el-dialog
    v-model="matchCheckVisible"
    title="数据匹配校验"
    width="62rem"
    align-center
    destroy-on-close
    class="data-match-check-dialog"
    :close-on-click-modal="false"
  >
    <div class="match-check-body">
      <div class="match-check-tips">
        <el-icon class="match-check-icon"><Warning /></el-icon>
        <span class="match-check-text">
          检测到部分【存货名称+规格】在APS排产信息表中未找到对应的【品种+包装规格】，这些记录将不会参与本次求解。
        </span>
      </div>
      <div class="match-check-count">
        缺失记录数量：<span class="count-num">{{ matchCheckData.total }}</span> 条
      </div>
      <el-table
        v-loading="matchCheckLoading"
        :data="matchPagedRows"
        class="match-check-table"
        border
        :row-class-name="matchRowClassName"
      >
        <!-- 列不设固定 min-width：由表格按弹窗实际宽度自适应分配，保证浏览器缩放时表格始终填满弹窗、不出现横向溢出 -->
        <el-table-column prop="inventoryName" label="存货名称" show-overflow-tooltip>
          <template #default="{ row }">
            <!-- 占位行：渲染隐藏占位符撑起与普通行一致的行高 -->
            <span v-if="row._isPlaceholder" class="cell-placeholder">-</span>
            <span v-else>{{ row.inventoryName }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="specification" label="规格" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row._isPlaceholder" class="cell-placeholder">-</span>
            <span v-else>{{ row.specification }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="未匹配原因" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row._isPlaceholder" class="cell-placeholder">-</span>
            <span v-else>{{ row.reason }}</span>
          </template>
        </el-table-column>
      </el-table>
      <!-- 分页区：左下角显示总条数，右侧分页 + 页面跳转（参考任务数据页表格形态） -->
      <div class="match-pagination-row">
        <span class="match-total-count"></span>
        <div class="match-pagination-right">
          <el-pagination
            v-model:current-page="matchCurrentPage"
            :total="matchTotalRows"
            :page-size="matchPageSize"
            layout="prev, pager, next"
            @current-change="handleMatchPageChange"
          />
          <!-- 页面跳转：跳转至 x 页 按钮 -->
          <div class="match-jump-box">
            <span class="jump-label">跳转至</span>
            <el-input v-model="matchJumpPage" class="jump-input" @keyup.enter="handleMatchJump" />
            <span class="jump-label">页</span>
            <el-button class="jump-btn" @click="handleMatchJump">跳转</el-button>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="match-check-footer">
        <el-button @click="closeMatchCheckDialog">取消求解</el-button>
        <el-button @click="handleContinueSolveSkip"> 继续求解（跳过缺失项） </el-button>
        <el-button type="primary" @click="handleGoToApsArchive">前往APS排产信息档案</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { Back, Warning } from '@element-plus/icons-vue'
import { useModelBuild } from './useModelBuild'
import { SHIFT_DAYS_FIXED } from './modelBuildDefaults'

const {
  schedulingStore,
  isModelBuildLocked,
  solveBtnText,
  canStartSolve,
  departmentOptions,
  departmentOptionsLoading,
  isSolveBtnDisabled,
  solvingLoading,
  // 数据匹配校验弹窗
  matchCheckVisible,
  matchCheckData,
  matchCheckLoading,
  // 未匹配记录分页
  matchPagedRows,
  matchRowClassName,
  matchPageSize,
  matchCurrentPage,
  matchTotalRows,
  matchJumpPage,
  handleMatchJump,
  handleMatchPageChange,
  closeMatchCheckDialog,
  handleContinueSolveSkip,
  handleGoToApsArchive,
  handlePrev,
  handleStartSolve,
  handleResetDefaults,
} = useModelBuild()

// 工序列表（早/晚班人员容量统一使用）
const capacityKeys = ['配料', '压片', '包衣', '包装']
</script>

<style lang="less" scoped>
@import './modelBuild.less';
</style>

<!-- 数据匹配校验弹窗经 teleport 渲染到 body，scoped 样式编译出的 [data-v] 祖先选择器无法命中其内部结构，
     因此弹窗相关样式必须放在非 scoped 块中（与项目 DataUpload.vue 弹窗写法保持一致）。
     data-match-check-dialog 类前缀保证全局唯一，不影响其他页面。 -->
<style lang="less">
.data-match-check-dialog {
  .el-dialog__header {
    padding: 16px 20px 16px 0;
    margin-right: 0;
    border-bottom: 1px solid #ebeef5;
  }

  .el-dialog__title {
    font-size: 18px;
    font-weight: 600;
    color: #303133;
  }

  // 右上角关闭按钮（叉号）：尺寸以 rem 固定（此处 px 会被 pxtorem 转为 rem），
  // 与弹窗一起随窗口等比缩放，浏览器 Ctrl+滚轮缩放时视觉尺寸保持稳定
  .el-dialog__headerbtn {
    width: 48px;
    height: 48px;
    font-size: 16px;

    .el-dialog__close {
      font-size: inherit;
    }
  }

  .el-dialog__body {
    padding: 0;
  }

  .el-dialog__footer {
    padding: 12px 0 12px 20px;
  }

  .match-check-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .match-check-tips {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    background-color: #fffaf0;
    border-radius: 6px;
    border: 1px solid #ffe4b3;
  }

  .match-check-icon {
    flex-shrink: 0;
    font-size: 20px;
    color: #e6a23c;
    margin-top: 2px;
  }

  .match-check-text {
    font-size: 1rem;
    color: #606266;
    line-height: 1.6;
  }

  .match-check-count {
    font-size: 1rem;
    color: #606266;

    .count-num {
      color: #f56c6c;
      font-weight: 600;
    }
  }

  .match-check-table {
    .el-table__header th {
      background-color: #f5f7fa;
      color: #303133;
      font-weight: 600;
    }

    // 占位符：内容（"-"）占据正常行高，文字颜色透明不可见
    .cell-placeholder {
      display: block;
      color: transparent;
    }

    // 占位行：占位符内容保留行高但整体不可见，保证占位行与普通行等高
    .row-placeholder {
      .cell-placeholder {
        visibility: hidden;
      }
      td {
        background: transparent !important;
      }
    }
  }

  // 分页区（参考任务数据页表格形态）：左下角总条数 + 右侧分页与页面跳转
  .match-pagination-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 16px;
    gap: 12px;

    .match-total-count {
      font-size: 1rem;
      color: #606266;
    }

    .match-pagination-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    // 页面跳转：跳转至 x 页 按钮
    .match-jump-box {
      display: flex;
      align-items: center;
      gap: 6px;

      .jump-label {
        font-size: 1rem;
        color: #606266;
        white-space: nowrap;
      }

      .jump-input {
        width: 48px;

        .el-input__wrapper {
          height: 32px;
          border-radius: 4px;
          padding: 0 8px;
        }

        // 输入的数字居中对齐
        .el-input__inner {
          text-align: center;
        }
      }

      .jump-btn {
        height: 32px;
        padding: 0 14px;
        font-size: 1rem;
        border-radius: 4px;
        color: #606266;
        border: 1px solid #dcdfe6;
        background: #fff;

        &:hover {
          color: #1c4b8e;
          border-color: #004aa9;
          background-color: #fff;
        }
      }
    }

    // 方形带边框分页按钮
    .el-pagination button,
    .el-pagination .el-pager li {
      border: 1px solid #dcdfe6;
      background: #fff;
      border-radius: 4px;
      min-width: 32px;
      height: 32px;
      line-height: 30px;
      font-weight: normal;
      color: #606266;
      margin: 0 4px;

      &.is-active {
        color: #fff;
        background-color: #004aa9;
        border-color: #004aa9;
      }

      &:hover {
        color: #004aa9;
        border-color: #004aa9;
      }

      &.is-active:hover {
        color: #fff;
        background-color: #1c4b8e;
        border-color: #1c4b8e;
      }
    }

    .el-pagination .el-pager {
      gap: 0;
    }

    .el-pagination {
      gap: 4px;
    }
  }

  .match-check-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;

    .el-button {
      height: 36px;
      padding: 0 20px;
    }
  }
}
</style>
