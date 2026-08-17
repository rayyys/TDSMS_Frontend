<template>
  <div class="model-build-page">
    <div class="page-header">
      <h2 class="page-title">模型构建</h2>
      <p class="page-desc">
        配置求解所需的业务参数，系统将根据配置进行排程计算。
      </p>
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
          style="width: 15.25rem !important"
        >
          <el-option
            v-for="dept in departmentOptions"
            :key="dept"
            :label="dept"
            :value="dept"
          />
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
                <el-input-number
                  v-model="schedulingStore.shiftDays"
                  :min="0.1"
                  :step="0.5"
                  :precision="2"
                  :controls="true"
                  controls-position="right"
                  :disabled="isModelBuildLocked"
                  class="stable-input-number"
                />
                <span class="rule-unit">天 =</span>
                <el-input-number
                  v-model="schedulingStore.shiftHours"
                  :min="0.1"
                  :step="0.5"
                  :precision="2"
                  :controls="true"
                  controls-position="right"
                  :disabled="isModelBuildLocked"
                  class="stable-input-number"
                />
                <span class="rule-unit">班时</span>
              </div>
            </div>
            <div class="rule-hint">
              设置自然时间与生产班次的换算规则，用于排产过程中时间计算。
            </div>
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
            <div class="capacity-group-title">早班人员容量</div>
            <div class="capacity-row">
              <div
                v-for="key in capacityKeys"
                :key="`morning-${key}`"
                class="capacity-item"
              >
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
                    style="padding-left: 12px;"
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
        <div class="rule-hint">
          设置算法最大求解时间，时间越长通常有更多机会得到更优方案。
        </div>
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
        @click="handleStartSolve"
      >
        {{ solveBtnText }}
      </el-button>
    </div>
  </div>

  <!-- 底部吸底占位盒：位于操作栏下方，吸底定位 -->
  <div class="action-bar-space"></div>
</template>

<script setup>
import { Back } from '@element-plus/icons-vue'
import { useModelBuild } from './useModelBuild'

const {
  schedulingStore,
  isModelBuildLocked,
  solveBtnText,
  canStartSolve,
  departmentOptions,
  isSolveBtnDisabled,
  solvingLoading,
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
