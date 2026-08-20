<template>
  <div class="aps-plan-empty">
    <div class="aps-plan-empty-illu">
      <svg viewBox="0 0 120 120" width="80" height="80" fill="none">
        <ellipse cx="60" cy="100" rx="44" ry="6" fill="#e6eef8" />
        <rect
          x="42"
          y="38"
          width="36"
          height="44"
          rx="3"
          fill="#ffffff"
          stroke="#c8d4e3"
          stroke-width="2"
        />
        <line x1="50" y1="52" x2="70" y2="52" stroke="#c8d4e3" stroke-width="2" />
        <line x1="50" y1="60" x2="70" y2="60" stroke="#c8d4e3" stroke-width="2" />
        <line x1="50" y1="68" x2="64" y2="68" stroke="#c8d4e3" stroke-width="2" />
        <line x1="34" y1="58" x2="42" y2="58" stroke="#b0c1d6" stroke-width="2" />
        <line x1="38" y1="54" x2="38" y2="62" stroke="#b0c1d6" stroke-width="2" />
        <line x1="78" y1="78" x2="86" y2="78" stroke="#b0c1d6" stroke-width="2" />
        <line x1="82" y1="74" x2="82" y2="82" stroke="#b0c1d6" stroke-width="2" />
      </svg>
    </div>
    <div class="aps-plan-empty-title">当前暂无方案</div>
    <div class="aps-plan-empty-sub">请先新增方案</div>
  </div>
</template>

<style lang="less" scoped>
.aps-plan-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 20px 0;

  .aps-plan-empty-illu {
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .aps-plan-empty-title {
    font-size: 1rem;
    font-weight: 600;
    color: #303133;
    margin-bottom: 4px;
  }
  .aps-plan-empty-sub {
    font-size: 1rem;
    color: #909399;
  }
}
</style>
