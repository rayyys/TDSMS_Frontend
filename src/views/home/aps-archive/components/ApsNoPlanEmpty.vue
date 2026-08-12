<template>
  <div class="aps-no-plan-empty">
    <div class="aps-no-plan-empty-illu">
      <svg viewBox="0 0 200 180" width="180" height="160" fill="none">
        <!-- 底板阴影 -->
        <ellipse cx="100" cy="155" rx="70" ry="8" fill="#e6eef8" />
        <!-- 左侧文件 -->
        <path
          d="M45 55 L75 55 L85 65 L85 120 L45 120 Z"
          fill="#ffffff"
          stroke="#c8d4e3"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <path d="M75 55 L75 65 L85 65" fill="#e6eef8" stroke="#c8d4e3" stroke-width="2" stroke-linejoin="round" />
        <line x1="52" y1="78" x2="78" y2="78" stroke="#dbe5f1" stroke-width="2" />
        <line x1="52" y1="90" x2="78" y2="90" stroke="#dbe5f1" stroke-width="2" />
        <line x1="52" y1="102" x2="68" y2="102" stroke="#dbe5f1" stroke-width="2" />
        <!-- 右侧带夹板的清单 -->
        <rect x="95" y="35" width="70" height="110" rx="6" fill="#ffffff" stroke="#c8d4e3" stroke-width="2" />
        <rect x="105" y="28" width="50" height="14" rx="3" fill="#5b8cdb" />
        <circle cx="130" cy="35" r="3" fill="#ffffff" />
        <line x1="108" y1="62" x2="152" y2="62" stroke="#dbe5f1" stroke-width="2" />
        <line x1="108" y1="78" x2="152" y2="78" stroke="#dbe5f1" stroke-width="2" />
        <line x1="108" y1="94" x2="152" y2="94" stroke="#dbe5f1" stroke-width="2" />
        <line x1="108" y1="110" x2="140" y2="110" stroke="#dbe5f1" stroke-width="2" />
        <!-- 装饰点 -->
        <circle cx="35" cy="45" r="3" fill="#dbe5f1" />
        <circle cx="170" cy="50" r="2" fill="#dbe5f1" />
        <circle cx="165" cy="140" r="3" fill="#dbe5f1" />
      </svg>
    </div>
    <div class="aps-no-plan-empty-title">当前暂无排产方案</div>
    <div class="aps-no-plan-empty-sub">请先新增方案，创建方案后才可导入表格并维护排产信息</div>
    <el-button class="aps-btn-add-plan-empty" type="primary" :icon="Plus" @click="onAddPlan">
      新增方案
    </el-button>
  </div>
</template>

<script setup>
import { Plus } from '@element-plus/icons-vue'

const emit = defineEmits(['add-plan'])

function onAddPlan() {
  emit('add-plan')
}
</script>

<style lang="less" scoped>
@import '@/styles/variables.less';

.aps-no-plan-empty {
  flex: 1;
  min-height: 0;
  background: #fff;
  border: 2px dashed #b6d1ff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;

  .aps-no-plan-empty-illu {
    margin-bottom: 16px;
  }
  .aps-no-plan-empty-title {
    font-size: 20px;
    font-weight: 700;
    color: #303133;
    margin-bottom: 8px;
  }
  .aps-no-plan-empty-sub {
    font-size: 14px;
    color: #909399;
    margin-bottom: 20px;
  }
  .aps-btn-add-plan-empty {
    display: flex;
    align-items: center;
    gap: 4px;
  }
}
</style>
