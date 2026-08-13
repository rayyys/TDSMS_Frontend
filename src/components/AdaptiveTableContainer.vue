<template>
  <div ref="containerRef" class="adaptive-table-container" style="width: 100%; height: 100%">
    <slot
      :scale="currentScale"
      :density-class="tableDensityClass"
      :header-style="headerCellStyle"
      :body-style="bodyCellStyle"
      :get-col-width="columnWidthLayoutStr"
    ></slot>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  // 表格列配置数组，用于计算动态宽度
  columns: {
    type: Array,
    default: () => [],
  },
  // 设计稿基准宽度，默认 1680
  baseWidth: {
    type: Number,
    default: 1680,
  },
  // 是否启用智能缩放
  smartDensity: {
    type: Boolean,
    default: true,
  },
  // 基础物理下限值
  absoluteFloorPx: {
    type: Number,
    default: 32, // 稍微调高以防单元格过度坍塌
  },
  // 默认设计列宽
  defaultDesignColWidth: {
    type: Number,
    default: 180,
  },
  // 自定义编辑器类型的最小物理宽度映射表
  editorFloorMap: {
    type: Object,
    default: () => ({}),
  },
  // 操作列（按钮所在列）的物理最小下限，确保完全展示按钮
  actionMinFloorPx: {
    type: Number,
    default: 160,
  },
})

// --- 基础状态与常量 ---
const containerRef = ref(null)
const containerWidth = ref(0)
const autoScale = ref(1.0)
let debounceTimer = null
let resizeObserver = null

const BASELINE = { fontPx: 16, paddingX: 10, paddingY: 10, lineHeight: 20 }
const SELECTION_BASE_PX = 50
const HEADER_RESERVED_PX = 16

// --- rAF 节流函数 ---
function rafThrottle(fn) {
  let rafId = null
  return function (...args) {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      fn.apply(this, args)
    })
  }
}

// --- 密度与缩放核心逻辑 ---
function getDensityClassByScale(scale) {
  if (scale >= 1.75) return 'very-large'
  if (scale >= 1.25) return 'large'
  if (scale >= 0.8) return 'medium'
  if (scale >= 0.475) return 'small'
  if (scale >= 0.25) return 'extra-small'
  return 'very-small'
}

const currentScale = computed(() => {
  return props.smartDensity ? autoScale.value : 1.0
})

const tableDensityClass = computed(
  () => `table-density-${getDensityClassByScale(currentScale.value)}`,
)

const densityLevel = computed(() => ({
  fontPx: Math.round(BASELINE.fontPx * currentScale.value),
  paddingX: Math.round(BASELINE.paddingX * currentScale.value),
  paddingY: Math.round(BASELINE.paddingY * currentScale.value),
  lineHeight: Math.round(BASELINE.lineHeight * currentScale.value),
}))

// --- 列宽计算逻辑 ---
// 多选列宽度：默认 50，可通过列配置的 width 自定义基准宽度（随容器缩放）
const selectionColWidth = computed(() => {
  const selCol = props.columns.find((c) => c.type === 'selection')
  const raw = Number(selCol?.width) || SELECTION_BASE_PX
  return Math.max(props.absoluteFloorPx, Math.round(raw * currentScale.value))
})

function estimateLabelTextPx(label, fontPx) {
  const text = String(label ?? '').trim()
  if (!text) return 0
  let total = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(ch)) total += fontPx
    else if (/[A-Z0-9]/.test(ch)) total += fontPx * 0.7
    else total += fontPx * 0.55
  }
  return Math.ceil(total)
}

function getHeaderMinWidth(col) {
  const lvl = densityLevel.value
  const textPx = estimateLabelTextPx(col?.label, lvl.fontPx)
  if (textPx <= 0) return props.absoluteFloorPx
  return Math.max(props.absoluteFloorPx, textPx + lvl.paddingX * 2 + HEADER_RESERVED_PX)
}

function getScaledDesignWidth(col) {
  const raw = Math.max(40, Math.round(Number(col.width) || props.defaultDesignColWidth))
  return Math.max(props.absoluteFloorPx, Math.round(raw * currentScale.value))
}

function getDataColBaseWidth(col) {
  if (col.type === 'selection') return selectionColWidth.value

  const scaledDesignW = getScaledDesignWidth(col)
  const headerMinW = getHeaderMinWidth(col)
  let baseW = Math.max(scaledDesignW, headerMinW)

  if (col.editor && props.editorFloorMap[col.editor]) {
    const floorLimit = Math.round(props.editorFloorMap[col.editor] * currentScale.value)
    baseW = Math.max(baseW, floorLimit)
  }

  // 【核心修改】：精准匹配你的项目习惯，拦截特殊列
  const isActionCol =
    col.type === 'action' ||
    col.type === 'operation' ||
    col.fixed === 'right' ||
    col.prop === 'actions' || // 匹配你 columns 中的 prop: 'actions'
    col.key === 'actions' || // 匹配你模板中传入的 key: 'actions'
    col.label === '操作' // 匹配你的 label 文本

  if (isActionCol) {
    // 操作列下限随缩放等比调整，避免高缩放比例下列宽异常增大
    const hardLimit = Math.round(
      (Number(col.minWidth) || props.actionMinFloorPx) * currentScale.value,
    )
    baseW = Math.max(baseW, hardLimit)
  } else {
    // 【新增】：普通数据列的极度挤压保护 (防止 500% 缩放时挤成省略号)
    // 保证物理宽度不会低于原设计宽度的 35%（可按需微调）
    const rawW = Number(col.width) || props.defaultDesignColWidth
    const normalSafeFloor = rawW * 0.35
    baseW = Math.max(baseW, normalSafeFloor)
  }

  if (col.minWidth) {
    baseW = Math.max(baseW, Number(col.minWidth))
  }

  return baseW
}

const dataColumns = computed(() => props.columns.filter((c) => c.type !== 'selection'))
const hasSelectionColumn = computed(() => props.columns.some((c) => c.type === 'selection'))

const dynamicDataColWidths = computed(() => {
  const widths = {}
  const cols = dataColumns.value
  if (cols.length === 0) return widths

  // 1. 计算各列基础宽度（含 widthAdjust）
  const raw = cols.map((col) => {
    const baseW = getDataColBaseWidth(col)
    const adjust = Number(col.widthAdjust) || 0
    return { col, key: col.key || col.prop, baseW: baseW + adjust }
  })

  const boxW = containerWidth.value
  const selectionReserve = hasSelectionColumn.value ? selectionColWidth.value : 0
  const available = Math.round(boxW - selectionReserve)
  const totalMin = raw.reduce((s, w) => s + w.baseW, 0)

  // 2. 均分剩余空间
  if (totalMin < available) {
    const extra = (available - totalMin) / cols.length
    for (const w of raw) {
      w.baseW += extra
    }
  }

  // 3. 取整
  let totalRounded = 0
  for (const w of raw) {
    widths[w.key] = Math.round(w.baseW)
    totalRounded += widths[w.key]
  }

  // 4. 逐像素补偿，确保总宽度精确匹配容器可用宽度
  let diff = totalRounded - available // 正数=超出，负数=不足
  if (diff !== 0) {
    // 按宽度从大到小排序，优先调整最宽的列
    const sorted = [...raw].sort((a, b) => widths[b.key] - widths[a.key])
    for (let i = 0; diff !== 0 && i < cols.length * 2; i++) {
      const { col, key } = sorted[i % cols.length]
      if (diff > 0) {
        // 超出：减1px，但不低于基础宽度
        if (widths[key] > getDataColBaseWidth(col)) {
          widths[key] -= 1
          diff -= 1
        }
      } else {
        // 不足：加1px
        widths[key] += 1
        diff += 1
      }
    }
  }

  return widths
})

// --- 对外暴露的样式与方法 ---
const columnWidthLayoutStr = (col) => {
  if (col.type === 'selection') return Math.round(selectionColWidth.value)
  // dynamicDataColWidths 已返回取整后的值，直接复用
  return dynamicDataColWidths.value[col.key || col.prop] ?? Math.round(getDataColBaseWidth(col))
}

const headerCellStyle = computed(() => {
  const lvl = densityLevel.value
  return {
    background: '#eef1f6',
    color: '#606266',
    fontWeight: 'bold',
    padding: `${lvl.paddingY}px ${lvl.paddingX}px`,
    lineHeight: `${lvl.lineHeight}px`,
  }
})

const bodyCellStyle = computed(() => {
  const lvl = densityLevel.value
  return {
    padding: `${lvl.paddingY}px ${lvl.paddingX}px`,
    lineHeight: `${lvl.lineHeight}px`,
  }
})

// --- 容器监听逻辑 ---
const updateDensity = () => {
  if (!props.smartDensity || !containerRef.value) return

  const w = containerRef.value.clientWidth
  if (w <= 0) return

  containerWidth.value = w
  if (debounceTimer) clearTimeout(debounceTimer)

  debounceTimer = setTimeout(() => {
    const exactScale = w / props.baseWidth
    autoScale.value = Math.max(0.15, Math.min(exactScale, 2.0))
    // 列宽计算完成后通知子组件重新检测溢出状态
    // 使用 nextTick 等待 Vue 完成 DOM 更新，确保列宽已应用到表格
    nextTick(() => {
      containerRef.value?.dispatchEvent(new CustomEvent('column-layout-ready'))
    })
  }, 16)
}

const startObserving = () => {
  updateDensity()
  if (containerRef.value && typeof ResizeObserver !== 'undefined') {
    const rafLayout = rafThrottle(() => {
      updateDensity()
    })
    resizeObserver = new ResizeObserver(rafLayout)
    resizeObserver.observe(containerRef.value)
  }
}

const stopObserving = () => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
}

onMounted(() => {
  nextTick(() => startObserving())
})

onUnmounted(() => {
  stopObserving()
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<style scoped>
.adaptive-table-container {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 暴力防御：打透 Element Plus 的层级，确保按钮和内部 span 文字绝不省略！ */
.adaptive-table-container :deep(.el-table__row .el-button),
.adaptive-table-container :deep(.el-table__row .el-button span) {
  white-space: nowrap !important;
  overflow: visible !important;
  text-overflow: clip !important;
  flex-shrink: 0;
}

.adaptive-table-container :deep(.el-table__row td .cell) {
  min-width: 0 !important;
}

/* 让 .cell 继承父级 <th>/<td> 的 line-height，覆盖 Element Plus 默认的 23px */
.adaptive-table-container :deep(.el-table__cell .cell) {
  line-height: inherit !important;
}

/* 让 table body 撑满 scrollbar wrap，消除缩放后底部空白 */
.adaptive-table-container :deep(.el-table__body),
.adaptive-table-container :deep(.el-table__body tbody) {
  height: 100%;
}
</style>
