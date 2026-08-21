<template>
  <div class="aps-import-card">
    <div class="aps-import-card-left">
      <div class="aps-import-card-title">导入表格</div>
      <div class="aps-import-card-sub">支持 .xlsx / .xls 格式文件</div>

      <div
        class="aps-import-upload-area"
        :class="{ 'is-dragover': uploadDragOver, 'has-file': planState.uploadedFileName }"
        @click="triggerFileInput"
        @dragover.prevent="uploadDragOver = true"
        @dragleave.prevent="uploadDragOver = false"
        @drop.prevent="onFileDrop"
      >
        <img class="aps-import-upload-icon" :src="uploadCloudImg" alt="上传" />
        <span class="aps-import-upload-text">
          {{
            planState.uploadedFileName
              ? `已上传：${planState.uploadedFileName}（点击重新上传）`
              : '点击或拖拽文件到此处上传'
          }}
        </span>
      </div>

      <el-button
        class="aps-btn-download-template"
        plain
        :icon="Download"
        @click="onDownloadTemplate"
      >
        下载Excel模板
      </el-button>
    </div>

    <div class="aps-import-card-right">
      <div class="aps-import-tip-title">导入说明：</div>
      <ol class="aps-import-tip-list">
        <li>请使用系统提供的模板进行填写。</li>
        <li>请勿修改模板中的表头字段。</li>
        <li>必填字段需完整填写。</li>
      </ol>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Download } from '@element-plus/icons-vue'
// 上传云端示意图
import uploadCloudImg from '@/img/zw_上传云端.png'

defineProps({
  planState: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['trigger-file-input', 'file-drop', 'download-template'])

// 拖拽高亮仅为本组件内部 UI 状态，使用局部 ref 避免直接修改 prop
const uploadDragOver = ref(false)

function triggerFileInput() {
  emit('trigger-file-input')
}

function onFileDrop(e) {
  // 拖放结束后复位拖拽高亮状态
  uploadDragOver.value = false
  emit('file-drop', e)
}

function onDownloadTemplate() {
  emit('download-template')
}
</script>

<style lang="less" scoped>
@import '@/styles/variables.less';

.aps-import-card {
  flex-shrink: 0;
  display: flex;
  gap: 24px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  padding: 20px 24px;
  box-sizing: border-box;
  min-height: 220px;
  border: 2px solid #b6d1ff;

  .aps-import-card-left {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .aps-import-card-title {
    font-size: 16px;
    font-weight: 600;
    color: #303133;
  }
  .aps-import-card-sub {
    font-size: 1rem;
    color: #909399;
    margin-top: -8px;
  }

  .aps-import-upload-area {
    position: relative;
    height: 70px;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    color: @brand-primary;
    font-size: 1rem;
    background: #fff;
    transition:
      border-color 0.2s,
      background 0.2s;

    &:hover,
    &.is-dragover {
      border-color: @brand-primary;
      background: @brand-primary-light;
    }

    &.has-file {
      color: #67c23a;
      border-color: #c2e7b0;
      background: #f0f9eb;
    }

    .aps-import-upload-icon {
      width: 32px;
      height: 32px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .aps-import-upload-text {
      font-weight: 500;
    }
  }

  .aps-btn-download-template {
    width: 100%;
    height: 40px;
    font-size: 1rem;
    color: #ca4949;
    border-color: #ff9800;
    background: #fffdf8;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      background-color: #fff3e0;
    }
  }

  .aps-import-card-right {
    flex-shrink: 0;
    width: 220px;
    padding: 16px;
    background: #f7f9fc;
    border-radius: 4px;
    box-sizing: border-box;
    align-self: stretch;

    .aps-import-tip-title {
      font-size: 1rem;
      font-weight: 600;
      color: #303133;
      margin-bottom: 10px;
    }
    .aps-import-tip-list {
      margin: 0;
      padding-left: 20px;
      color: #606266;
      font-size: 1rem;
      line-height: 1.9;
    }
  }
}
</style>
