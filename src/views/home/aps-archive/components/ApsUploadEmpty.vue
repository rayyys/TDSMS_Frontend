<template>
  <div class="aps-upload-empty">
    <div class="aps-upload-empty-illu">
      <svg viewBox="0 0 200 180" width="180" height="160" fill="none">
        <ellipse cx="100" cy="155" rx="70" ry="5" fill="#e6eef8" />
        <path
          d="M70 35 L120 35 L140 55 L140 140 L70 140 Z"
          fill="#ffffff"
          stroke="#cfdcec"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <path
          d="M120 35 L120 55 L140 55"
          fill="#e6eef8"
          stroke="#cfdcec"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <line x1="78" y1="70" x2="132" y2="70" stroke="#dbe5f1" stroke-width="1.5" />
        <line x1="78" y1="86" x2="132" y2="86" stroke="#dbe5f1" stroke-width="1.5" />
        <line x1="78" y1="102" x2="132" y2="102" stroke="#dbe5f1" stroke-width="1.5" />
        <line x1="78" y1="118" x2="132" y2="118" stroke="#dbe5f1" stroke-width="1.5" />
        <line x1="90" y1="62" x2="90" y2="130" stroke="#dbe5f1" stroke-width="1.5" />
        <line x1="108" y1="62" x2="108" y2="130" stroke="#dbe5f1" stroke-width="1.5" />
        <line x1="122" y1="62" x2="122" y2="130" stroke="#dbe5f1" stroke-width="1.5" />
        <circle cx="148" cy="128" r="14" fill="#5b8cdb" />
        <line
          x1="142"
          y1="128"
          x2="154"
          y2="128"
          stroke="#ffffff"
          stroke-width="2"
          stroke-linecap="round"
        />
        <line
          x1="148"
          y1="122"
          x2="148"
          y2="134"
          stroke="#ffffff"
          stroke-width="2"
          stroke-linecap="round"
        />
        <circle cx="40" cy="60" r="3" fill="#dbe5f1" />
        <circle cx="32" cy="100" r="2" fill="#dbe5f1" />
        <circle cx="160" cy="50" r="2" fill="#dbe5f1" />
      </svg>
    </div>
    <div class="aps-upload-empty-title">当前暂无排产信息档案数据</div>
    <div class="aps-upload-empty-sub">请先上传Excel文件，系统将自动解析</div>
  </div>
</template>

<style lang="less" scoped>
.aps-upload-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;

  .aps-upload-empty-illu {
    margin-bottom: 16px;
  }
  .aps-upload-empty-title {
    font-size: 18px;
    font-weight: 700;
    color: #303133;
    margin-bottom: 6px;
  }
  .aps-upload-empty-sub {
    font-size: 1rem;
    color: #909399;
  }
}
</style>
