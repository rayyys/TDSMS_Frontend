<template>
  <div class="aps-import-toolbar">
    <el-button class="aps-btn-import" type="primary" :icon="Upload" @click="onClickImport">
      导入表格
    </el-button>
  </div>
</template>

<script setup>
import { Upload } from '@element-plus/icons-vue'

const emit = defineEmits(['trigger-file-input'])

function onClickImport() {
  emit('trigger-file-input')
}
</script>

<style lang="less" scoped>
.aps-import-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 16px 20px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);

  .aps-btn-import {
    display: flex;
    align-items: center;
    gap: 4px;
  }
}
</style>
