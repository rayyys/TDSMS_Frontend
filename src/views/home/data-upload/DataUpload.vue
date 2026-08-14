<template>
  <div class="data-upload-page">
    <div class="page-header">
      <h2 class="page-title">数据上传</h2>
      <p class="page-desc">上传生产数据文件，系统将自动解析并用于排程计算</p>
    </div>

    <div class="mode-switch-row">
      <el-radio-group v-model="importMode" @change="onImportModeChange">
        <el-radio value="manual">新建任务</el-radio>
        <el-radio value="history">历史记录导入</el-radio>
      </el-radio-group>
    </div>

    <!-- APS 排产信息档案选择 -->
        <div class="aps-archive-row">
          <span class="aps-archive-label">APS排产信息档案<span class="required">*</span></span>
          <el-select
            v-model="apsArchiveId"
            class="aps-archive-select"
            placeholder="请选择"
            clearable
            @change="onApsArchiveChange"
          >
            <el-option
              v-for="opt in apsArchiveOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
            <!-- 新增方案入口：选中后跳转到 APS 排产信息档案管理页面 -->
            <el-option :value="APS_ARCHIVE_ADD">
              <span class="aps-archive-add-option">新增方案 + </span>
            </el-option>
          </el-select>
        </div>

                <!-- 上传区域标题 -->
        <div class="upload-section-title">
          药业车间分解编排计划上传<span class="required">*</span>
        </div>
    <div
      v-loading="navigating || uploading"
      element-loading-text="文件上传中，请稍等"
      class="upload-main-card"
    >
      <div v-show="importMode === 'manual'" class="manual-upload-view">       
        <div
          class="upload-area"
          :class="{ 'upload-area-dragover': uploadDragOver }"
          @click="triggerFileSelect"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
        >
          <div class="upload-icon-wrapper">
            <img class="excel-icon" src="./excel.png" alt="Excel" />
          </div>
          <p class="upload-text">点击或拖拽文件到此处上传</p>
          <p class="upload-hint">支持 .xlsx、.xls 格式</p>
        </div>

        <div v-if="schedulingStore.uploadedFileName" class="uploaded-block">
          <div class="uploaded-header">已上传文件</div>
          <div class="uploaded-body">
            <div class="file-item">
              <div class="file-info">
                <el-icon class="file-icon-small"><Document /></el-icon>
                <span class="file-name">{{ schedulingStore.uploadedFileName }}</span>
              </div>
              <div class="file-actions">
                <el-button link type="primary" class="btn-delete-text" @click.stop="handleRemove"
                  >删除</el-button
                >
              </div>
            </div>
          </div>
        </div>

        <div v-if="schedulingStore.uploadedFileName" class="remark-row">
          <span class="remark-label">任务备注：</span>
          <el-input
            v-model="schedulingStore.taskRemark"
            class="remark-input"
            placeholder="请输入任务备注"
          />
        </div>

        <div class="download-row">
          <el-button class="btn-download-template" plain :icon="Download" @click="downloadTemplate">
            下载Excel模板
          </el-button>
        </div>
      </div>

      <div class="footer-actions">
        <el-button type="primary" class="btn-next" @click="handleNext">下一步</el-button>
      </div>
    </div>

    <el-dialog
      v-model="historyDialogVisible"
      title="历史导入记录"
      class="history-import-dialog"
      @close="importMode = 'manual'"
    >
      <AdaptiveTableContainer
        :columns="historyTableColumns"
        class="adaptive-wrapper"
        :base-width="1200"
      >
        <template #default="{ densityClass, headerStyle, bodyStyle, getColWidth }">
          <el-table
            v-loading="historyDialogLoading"
            :data="historyDialogData"
            :class="['history-dialog-table', densityClass]"
            :header-cell-style="headerStyle"
            :cell-style="bodyStyle"
            style="width: 100%"
          >
            <el-table-column
              prop="taskNo"
              label="任务编号"
              :width="getColWidth(historyTableColumns[0])"
              show-overflow-tooltip
            />
            <el-table-column
              prop="taskName"
              label="任务名称"
              :width="getColWidth(historyTableColumns[1])"
              show-overflow-tooltip
            />
            <el-table-column
              prop="fileName"
              label="文件名"
              :width="getColWidth(historyTableColumns[2])"
              show-overflow-tooltip
            />
            <el-table-column
              prop="taskRemark"
              label="备注"
              :width="getColWidth(historyTableColumns[3])"
              show-overflow-tooltip
            />
            <el-table-column
              prop="uploadUserName"
              label="上传人"
              :width="getColWidth(historyTableColumns[4])"
              align="center"
            />
            <el-table-column
              prop="createTime"
              label="上传时间"
              :width="getColWidth(historyTableColumns[5])"
              align="center"
            />
            <el-table-column
              label="操作"
              :width="getColWidth(historyTableColumns[6])"
              align="center"
            >
              <template #default="scope">
                <el-button link class="btn-import" @click="reimportHistory(scope.row)"
                  >导入</el-button
                >
                <el-button
                  link
                  class="btn-delete"
                  :loading="deletingTaskMap[scope.row.taskId]"
                  :icon="deletingTaskMap[scope.row.taskId] ? Loading : undefined"
                  :disabled="!!deletingTaskMap[scope.row.taskId]"
                  @click="deleteHistory(scope.row)"
                  >删除</el-button
                >
              </template>
            </el-table-column>
          </el-table>
        </template>
      </AdaptiveTableContainer>
      <div class="history-dialog-pagination">
        <el-pagination
          v-model:current-page="historyPageNum"
          v-model:page-size="historyPageSize"
          :total="historyTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="onHistoryPageChange"
          @size-change="onHistoryPageSizeChange"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Document, Download, Loading } from '@element-plus/icons-vue'
import AdaptiveTableContainer from '@/components/AdaptiveTableContainer.vue'
import { useDataUpload } from './useDataUpload'

// 历史记录弹窗表格列配置，供 AdaptiveTableContainer 自适应计算列宽
const historyTableColumns = computed(() => [
  { key: 'taskNo', label: '任务编号', width: 140 },
  { key: 'taskName', label: '任务名称', width: 200 },
  { key: 'fileName', label: '文件名', width: 200 },
  { key: 'taskRemark', label: '备注', width: 120 },
  { key: 'uploadUserName', label: '上传人', width: 100 },
  { key: 'createTime', label: '上传时间', width: 160 },
  { key: 'actions', label: '操作', width: 160, type: 'action' },
])

const {
  schedulingStore,
  importMode,
  apsArchiveId,
  apsArchiveOptions,
  APS_ARCHIVE_ADD,
  onApsArchiveChange,
  uploadDragOver,
  uploading,
  historyDialogVisible,
  historyDialogLoading,
  historyDialogData,
  historyTotal,
  historyPageNum,
  historyPageSize,
  deletingTaskMap,
  onImportModeChange,
  triggerFileSelect,
  onDragOver,
  onDragLeave,
  onDrop,
  handleRemove,
  downloadTemplate,
  deleteHistory,
  reimportHistory,
  onHistoryPageChange,
  onHistoryPageSizeChange,
  handleNext,
  navigating,
} = useDataUpload()
</script>

<style lang="less" scoped>
@import './dataUpload.less';
</style>

<style lang="less">
.aps-archive-add-option {
  color: #004aa9;
  font-weight: 600;
  cursor: pointer;
}

.history-import-dialog {
  width: 75vw; /* 约1440px（基于1920设计稿），让表格列有更多展示空间 */
  max-width: calc(100vw - 64px);
  border-radius: 8px;

  .el-dialog__header {
    padding: 24px 24px 16px;
    margin-right: 0;
    border-bottom: none;

    .el-dialog__title {
      font-weight: bold;
      font-size: 18px;
      color: #303133;
    }

    // 关闭按钮固定尺寸，不随缩放变化
    .el-dialog__headerbtn {
      /* 将容器尺寸放大至与内部图标一致，避免溢出 */
      width: 28px;
      height: 28px;
      top: 24px;
      right: 24px;
      /* 增加 flex 布局确保缩放时内容强制居中 */
      display: flex;
      align-items: center;
      justify-content: center;

      .el-dialog__close {
        font-size: 28px;
        width: 28px;
        height: 28px;
        line-height: 28px;
      }
    }
  }

  .el-dialog__body {
    padding: 0 24px 32px;
  }

  .adaptive-wrapper {
    width: 100%;
  }

  .history-dialog-table {
    border: none;

    &::before {
      display: none;
    }

    // 表头不允许换行和省略号
    thead th .cell {
      white-space: nowrap;
      overflow: visible;
      text-overflow: clip;
    }

    // 允许单元格内容省略，覆盖 AdaptiveTableContainer 的 min-width: min-content
    td .cell {
      min-width: 0 !important;
    }

    // 操作按钮自定义颜色
    .btn-import {
      color: #004AA9; // 深蓝色
      font-weight: bold;
      margin-right: 12px;
      &:hover {
        color: #1c4b8e;
      }
    }

    .btn-delete {
      color: #d93026; // 红色
      font-weight: bold;
      &:hover {
        color: #e74c3c;
      }
    }
  }

  .history-dialog-pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
}
</style>
