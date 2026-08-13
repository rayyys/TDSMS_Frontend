<template>
  <!-- 单元格只读文本：
       1. 空值显示短横线
       2. 文本最多显示两行，超出部分在第二行末尾以省略号(...)截断
       3. 内容超过两行时，悬浮以黑色弹框展示完整文本（保证可读性/可访问性） -->
  <el-tooltip
    placement="top"
    :show-after="300"
    :disabled="!overflow"
    popper-class="aps-cell-tooltip"
  >
    <template #content>
      <!-- tooltip 内容与可见文本一致，对屏幕阅读器隐藏，避免完整文本被重复播报 -->
      <span class="aps-cell-tooltip-content" aria-hidden="true">{{ displayText }}</span>
    </template>
    <span
      ref="textRef"
      class="aps-cell-text"
      role="text"
      :tabindex="overflow ? 0 : undefined"
      @mouseenter="onEnter"
      @mouseleave="onLeave"
      @focus="onEnter"
      @blur="onLeave"
    >{{ displayText }}</span>
  </el-tooltip>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'

const props = defineProps({
  // 单元格文本内容（可为字符串或数字）
  content: {
    type: [String, Number],
    default: '',
  },
})

// 是否溢出两行（内容超过两行出现省略号，需要 tooltip 展示完整内容）
const overflow = ref(false)

// 空值（null/undefined/空串）统一显示短横线；0 视为有效值正常显示
const displayText = computed(() => {
  const v = props.content
  return v === null || v === undefined || v === '' ? '—' : v
})

// 检测文本是否超过两行：
// - line-clamp 容器中 clientHeight = 两行可见高度，scrollHeight = 完整文本高度
// - 完整高度大于可见高度，说明存在第三行被截断，此时应展示 tooltip
function checkOverflow() {
  const el = textRef.value
  if (!el) return
  overflow.value = el.scrollHeight > el.clientHeight + 1
}

// 悬浮进入：实时测量，保证列宽/窗口变化后仍能正确判定是否展示 tooltip
function onEnter() {
  checkOverflow()
}

// 离开时关闭 tooltip
function onLeave() {
  overflow.value = false
}

onMounted(() => {
  // 初次渲染后先测一次，保证已溢出的内容悬浮即可展示
  nextTick(checkOverflow)
})
</script>

<style scoped>
.aps-cell-text {
  /* 两行文本截断：最多显示两行，超出部分在第二行末尾以省略号结束 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 长串（英文/数字）允许换行，保证不同屏幕与浏览器下行为一致 */
  overflow-wrap: anywhere;
  /* 行高跟随自适应单元格，保证两行高度被正确计算 */
  line-height: inherit;
  text-align: center;
  color: #2d3436;
}

/* tooltip 触发器占满单元格宽度，保证溢出检测基于实际单元格宽度 */
:deep(.el-tooltip__trigger) {
  display: block;
  width: 100%;
}
</style>

<style>
/* 黑色 tooltip 弹框：popper 渲染在 body 下，需全局样式（aps- 前缀避免污染其他组件） */
.aps-cell-tooltip.el-popper {
  background-color: #333 !important;
  color: #fff;
  border: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.aps-cell-tooltip.el-popper .el-popper__arrow::before {
  background-color: #333 !important;
  border-color: #333 !important;
}
.aps-cell-tooltip-content {
  display: block;
  max-width: 320px;
  word-break: break-all;
}
</style>
