<template>
  <div class="aps-archive-page">
    <!-- 页面标题与说明 -->
    <div class="page-header">
      <h2 class="page-title">APS排产信息档案</h2>
      <p class="page-desc">
        维护药品生产工艺与产能基础信息，作为排程算法的输入依据
      </p>
    </div>

    <!-- 主体内容：左侧方案列表面板 + 右侧方案详情/编辑区 -->
    <div class="archive-layout">
      <!-- 左侧：方案列表面板 -->
      <div class="archive-sidebar">
        <!-- 已有方案：展示方案列表 -->
        <div v-if="planList.length" class="plan-list">
          <div
            v-for="plan in planList"
            :key="plan.id"
            class="plan-list-item"
            :class="{ active: plan.id === activePlanId }"
            @click="onSelectPlan(plan.id)"
          >
            <span class="plan-list-name">{{ plan.name }}</span>
            <el-icon class="plan-list-del" @click.stop="onDeletePlan(plan)">
              <Delete />
            </el-icon>
          </div>
        </div>

        <!-- 首屏空态：插画 + 提示 -->
        <PlanListEmpty v-else />

        <!-- 底部固定新增方案按钮 -->
        <div class="sidebar-footer">
          <el-button class="btn-add-plan" plain @click="onAddPlan">
            <el-icon><Plus /></el-icon>
            <span>新增方案</span>
          </el-button>
        </div>
      </div>

      <!-- 右侧主体区：无方案 > 未上传 > 已上传 三级状态 -->
      <div v-loading="listLoading" class="archive-main">
        <!-- 无方案状态：提示先创建方案 -->
        <ApsNoPlanEmpty v-if="!planList.length" @add-plan="onAddPlan" />

        <!-- 未上传状态：顶部完整导入卡片 + 下方虚线待上传区域 -->
        <template v-else-if="!planState.hasImported">
          <ApsImportCard
            :plan-state="planState"
            :upload-drag-over="uploadDragOver"
            @trigger-file-input="triggerFileInput"
            @file-drop="onFileDrop"
            @download-template="onDownloadTemplate"
          />
          <div class="aps-upload-drop-zone">
            <ApsUploadEmpty />
          </div>
        </template>

        <!-- 已上传状态：显示数据面板（工具栏 + 表格 + 底部操作） -->
        <ApsDataPanel
          v-else
          :plan-state="planState"
          :filtered-table-data="displayTableData"
          :header-cell-style="headerCellStyle"
          :cell-style="cellStyle"
          @cancel-selection="onCancelSelection"
          @batch-delete="onBatchDelete"
          @reset-search="onResetSearch"
          @add-row="onAddRow"
          @export-table="onExportTable"
          @save-table="onSaveTable"
          @edit-row="onEditRow"
          @delete-row="onDeleteRow"
          @trigger-file-input="triggerFileInput"
        />
      </div>
    </div>

    <!-- 全局唯一的文件输入：所有上传入口共用，避免 ref 跨组件传递失效 -->
    <input
      ref="fileInputRef"
      type="file"
      class="aps-global-file-input"
      accept=".xlsx,.xls"
      @change="onFileChange"
    />
  </div>
</template>

<script setup>
import { Plus, Delete } from '@element-plus/icons-vue'
import { useApsArchive } from './useApsArchive'
import PlanListEmpty from './components/PlanListEmpty.vue'
import ApsNoPlanEmpty from './components/ApsNoPlanEmpty.vue'
import ApsImportCard from './components/ApsImportCard.vue'
import ApsUploadEmpty from './components/ApsUploadEmpty.vue'
import ApsDataPanel from './components/ApsDataPanel.vue'

const {
  // 方案管理
  planList,
  activePlanId,
  planState,
  displayTableData,
  listLoading,
  onAddPlan,
  onSelectPlan,
  onDeletePlan,
  // 表格样式
  headerCellStyle,
  cellStyle,
  // Excel 上传与解析
  uploadDragOver,
  fileInputRef,
  triggerFileInput,
  onFileChange,
  onFileDrop,
  onDownloadTemplate,
  // 工具栏操作
  onCancelSelection,
  onBatchDelete,
  onResetSearch,
  onAddRow,
  onExportTable,
  onSaveTable,
  // 行操作
  onEditRow,
  onDeleteRow,
} = useApsArchive()
</script>

<style lang="less" scoped>
@import './ApsArchive.less';
</style>
