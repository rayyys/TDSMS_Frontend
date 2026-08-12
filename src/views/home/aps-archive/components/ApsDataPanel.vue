<template>
  <div class="aps-data-panel">
    <!-- 顶部：导入入口栏（独立一行，按钮位于左侧） -->
    <div class="aps-import-bar">
      <div class="aps-import-bar-left">
        <el-button class="aps-btn-import" type="primary" :icon="Upload" @click="onClickImport">
          导入表格
        </el-button>
      </div>
    </div>

    <!-- 顶部工具栏 -->
    <div class="aps-data-toolbar">
      <div class="aps-toolbar-left">
        <span class="aps-selection-info">
          已选择<em>{{ planState.selectedRows.length }}</em>行
        </span>
        <el-button
          class="aps-btn-batch-del"
          type="danger"
          plain
          :disabled="!planState.selectedRows.length"
          @click="onBatchDelete"
        >
          批量删除
        </el-button>
        <el-button
          class="aps-btn-cancel-selection"
          :disabled="!planState.selectedRows.length"
          @click="onCancelSelection"
        >
          取消选择
        </el-button>
      </div>

      <div class="aps-toolbar-right">
        <el-input
          v-model="planState.searchQuery"
          class="aps-search-input"
          placeholder="请输入搜索内容"
          clearable
        >
          <template #suffix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button class="aps-btn-reset" @click="onResetSearch">重置</el-button>
      </div>
    </div>

    <!-- 数据表格 -->
    <div v-loading="planState.tableLoading" class="aps-data-table-wrap" element-loading-text="正在解析Excel...">
      <el-table
        ref="tableRef"
        :data="filteredTableData"
        border
        stripe
        class="aps-data-table"
        :header-cell-style="headerCellStyle"
        :cell-style="cellStyle"
        @selection-change="onSelectionChange"
      >
        <!-- 多选列 -->
        <el-table-column type="selection" width="55" align="center" fixed="left" />

        <!-- 品种 -->
        <el-table-column
          prop="product"
          label="品种"
          min-width="120"
          :resizable="true"
          align="center"
        />

        <!-- 包装规格 -->
        <el-table-column
          prop="packageSpec"
          label="包装规格"
          min-width="180"
          :resizable="true"
          align="center"
          show-overflow-tooltip
        />

        <!-- 配料（合并 4 列子表头） -->
        <el-table-column label="配料" align="center">
          <el-table-column
            prop="dispensingLine"
            label="配料线体"
            min-width="100"
            :resizable="true"
            align="center"
          />
          <el-table-column
            prop="batchQty"
            label="批量(万片/粒)"
            min-width="110"
            :resizable="true"
            align="center"
          />
          <el-table-column
            prop="shiftOutput"
            label="试产量(万片)"
            min-width="110"
            :resizable="true"
            align="center"
          />
          <el-table-column
            prop="dispensingStaff"
            label="用人"
            min-width="70"
            :resizable="true"
            align="center"
          />
        </el-table-column>

        <!-- 压片（合并 3 列子表头） -->
        <el-table-column label="压片" align="center">
          <el-table-column
            prop="pressMachine"
            label="压片机"
            min-width="100"
            :resizable="true"
            align="center"
          />
          <el-table-column
            prop="pressOutput"
            label="班产量"
            min-width="90"
            :resizable="true"
            align="center"
          />
          <el-table-column
            prop="pressStaff"
            label="用人"
            min-width="70"
            :resizable="true"
            align="center"
          />
        </el-table-column>

        <!-- 包衣（合并 3 列子表头） -->
        <el-table-column label="包衣" align="center">
          <el-table-column
            prop="coatingMachine"
            label="包衣机"
            min-width="90"
            :resizable="true"
            align="center"
          />
          <el-table-column
            prop="coatingOutput"
            label="班产量"
            min-width="90"
            :resizable="true"
            align="center"
          />
          <el-table-column
            prop="coatingStaff"
            label="用人"
            min-width="70"
            :resizable="true"
            align="center"
          />
        </el-table-column>

        <!-- 分装/铝塑（合并 3 列子表头） -->
        <el-table-column label="分装/铝塑" align="center">
          <el-table-column
            prop="fillingEquip"
            label="填料设备"
            min-width="100"
            :resizable="true"
            align="center"
          />
          <el-table-column
            prop="fillingOutput"
            label="班产量(万片)"
            min-width="110"
            :resizable="true"
            align="center"
          />
          <el-table-column
            prop="fillingStaff"
            label="用人"
            min-width="70"
            :resizable="true"
            align="center"
          />
        </el-table-column>

        <!-- 包装（合并 4 列子表头） -->
        <el-table-column label="包装" align="center">
          <el-table-column
            prop="packingEquip"
            label="操作设备"
            min-width="100"
            :resizable="true"
            align="center"
          />
          <el-table-column
            prop="packingOutput"
            label="班产量(万片)"
            min-width="110"
            :resizable="true"
            align="center"
          />
          <el-table-column
            prop="manualOutput"
            label="手工包装(1人产量)"
            min-width="150"
            :resizable="true"
            align="center"
          />
          <el-table-column
            prop="packingStaff"
            label="用人"
            min-width="70"
            :resizable="true"
            align="center"
          />
        </el-table-column>

        <!-- 生产周期/天 -->
        <el-table-column
          prop="cycleDays"
          label="生产周期/天"
          min-width="110"
          :resizable="true"
          align="center"
        />

        <!-- 是否集采品种 -->
        <el-table-column
          prop="isProcurement"
          label="是否集采品种"
          min-width="110"
          :resizable="true"
          align="center"
        />

        <!-- 年销量/万 -->
        <el-table-column
          prop="annualSales"
          label="年销量/万"
          min-width="100"
          :resizable="true"
          align="center"
        />

        <!-- 操作列 -->
        <el-table-column label="操作" width="100" :resizable="false" align="center" fixed="right">
          <template #default="scope">
            <div class="row-actions">
              <el-button
                link
                class="row-action-btn row-action-edit"
                :icon="Edit"
                @click="onEditRow(scope.row, scope.$index)"
              />
              <el-button
                link
                class="row-action-btn row-action-del"
                :icon="Delete"
                @click="onDeleteRow(scope.$index)"
              />
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 同步表格横向滚动的固定滚动条（位于底部操作栏顶端） -->
    <div class="aps-table-hscroll" ref="hscrollRef">
      <div class="aps-table-hscroll-track" ref="trackRef" @click="onTrackClick">
        <div class="aps-table-hscroll-thumb" ref="thumbRef" @mousedown.prevent="onThumbDown"></div>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="aps-data-footer">
      <el-button class="aps-btn-add-row" plain :icon="Plus" @click="onAddRow">
        新增数据行
      </el-button>
      <div class="aps-footer-right">
        <el-button class="aps-btn-export" plain @click="onExportTable">导出表格</el-button>
        <el-button class="aps-btn-save" type="primary" @click="onSaveTable">保存</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { Plus, Upload, Edit, Delete, Search } from '@element-plus/icons-vue'

const props = defineProps({
  planState: {
    type: Object,
    required: true,
  },
  filteredTableData: {
    type: Array,
    required: true,
  },
  headerCellStyle: {
    type: Function,
    required: true,
  },
  cellStyle: {
    type: Function,
    required: true,
  },
})

const emit = defineEmits([
  'selection-change',
  'cancel-selection',
  'batch-delete',
  'reset-search',
  'add-row',
  'export-table',
  'save-table',
  'edit-row',
  'delete-row',
  'trigger-file-input',
])

const tableRef = ref(null)
const hscrollRef = ref(null)
const trackRef = ref(null)
const thumbRef = ref(null)

// 表格横向滚动容器（el-table 内部负责横向滚动的 scrollbar wrap）
let tableScrollWrap = null
let dragging = false
// 鼠标按下时，光标相对滑块左边缘的偏移，保证从滑块任意位置拖拽都能跟手
let dragOffset = 0

// 查找表格的可横向滚动容器
function getTableScrollWrap() {
  const tableEl = tableRef.value?.$el
  if (!tableEl) return null
  return (
    tableEl.querySelector('.el-table__body-wrapper .el-scrollbar__wrap') ||
    tableEl.querySelector('.el-scrollbar__wrap')
  )
}

// 根据表格横向滚动状态，同步固定滚动条的尺寸与位置
function syncHScroll() {
  const wrap = tableScrollWrap
  const track = trackRef.value
  const thumb = thumbRef.value
  if (!wrap || !track || !thumb) return
  const total = wrap.scrollWidth
  const view = wrap.clientWidth
  // 无横向溢出时隐藏滚动条
  if (total <= view) {
    thumb.style.display = 'none'
    return
  }
  thumb.style.display = 'block'
  const trackW = track.clientWidth
  const ratio = view / total
  const thumbW = Math.max(24, trackW * ratio)
  thumb.style.width = thumbW + 'px'
  thumb.style.transform = `translateX(${(wrap.scrollLeft / total) * trackW}px)`
}

// 延迟到表格完成布局后再同步：el-table 需要 doLayout 后 scrollWidth 才是真实值，
// 否则初始阶段拿到的宽度为 0，会导致滑块被误判为隐藏（点击一下才显示的问题）
function syncHScrollLater() {
  nextTick(() => {
    tableRef.value?.doLayout?.()
    requestAnimationFrame(() => syncHScroll())
  })
}

// 初始化横向滚动容器并绑定同步
function bindHScroll() {
  const wrap = getTableScrollWrap()
  if (!wrap) return
  // 移除旧监听，避免重复绑定导致重复同步
  if (tableScrollWrap && tableScrollWrap !== wrap) {
    tableScrollWrap.removeEventListener('scroll', syncHScroll)
  }
  tableScrollWrap = wrap
  wrap.addEventListener('scroll', syncHScroll)
  syncHScrollLater()
}

// 拖拽滚动条滑块：记录按下时相对滑块左边缘的偏移，保证从任意位置拖拽都跟手
function onThumbDown(e) {
  dragging = true
  const thumb = thumbRef.value
  if (thumb) {
    dragOffset = e.clientX - thumb.getBoundingClientRect().left
  }
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onThumbMove)
  document.addEventListener('mouseup', onThumbUp)
}

function onThumbMove(e) {
  if (!dragging || !tableScrollWrap || !trackRef.value) return
  const track = trackRef.value
  const rect = track.getBoundingClientRect()
  // 光标位置减去按下时的偏移，映射到表格的 scrollLeft
  const offsetX = e.clientX - rect.left - dragOffset
  const ratio = tableScrollWrap.scrollWidth / track.clientWidth
  tableScrollWrap.scrollLeft = Math.max(0, offsetX * ratio)
}

function onThumbUp() {
  dragging = false
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onThumbMove)
  document.removeEventListener('mouseup', onThumbUp)
}

// 点击轨道空白处跳转到对应位置
function onTrackClick(e) {
  if (e.target === thumbRef.value) return
  if (!tableScrollWrap || !trackRef.value) return
  const track = trackRef.value
  const rect = track.getBoundingClientRect()
  const offsetX = e.clientX - rect.left
  const ratio = tableScrollWrap.scrollWidth / track.clientWidth
  tableScrollWrap.scrollLeft = Math.max(0, offsetX * ratio)
}

// 窗口尺寸变化或表格数据变化后，重新同步滚动条
function handleResize() {
  bindHScroll()
  syncHScrollLater()
}

onMounted(() => {
  bindHScroll()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (tableScrollWrap) tableScrollWrap.removeEventListener('scroll', syncHScroll)
})

// 取消选择时同步清空表格的选中状态
function onCancelSelection() {
  tableRef.value?.clearSelection()
  emit('cancel-selection')
}

// 方案切换或搜索条件变化后，恢复当前方案已保存的选中状态
watch(
  () => props.filteredTableData,
  () => {
    nextTick(() => {
      const saved = props.planState.selectedRows || []
      if (!tableRef.value || !saved.length) return
      props.filteredTableData.forEach((row) => {
        if (saved.includes(row)) {
          tableRef.value.toggleRowSelection(row, true)
        }
      })
      // 数据变化后重新同步横向滚动条
      handleResize()
    })
  },
  { immediate: true }
)

function onSelectionChange(selection) {
  emit('selection-change', selection)
}

function onBatchDelete() {
  emit('batch-delete')
  nextTick(() => tableRef.value?.clearSelection())
}

function onResetSearch() {
  emit('reset-search')
}

function onAddRow() {
  emit('add-row')
}

function onExportTable() {
  emit('export-table')
}

function onSaveTable() {
  emit('save-table')
}

function onEditRow(row, index) {
  emit('edit-row', row, index)
}

function onDeleteRow(index) {
  emit('delete-row', index)
}

function onClickImport() {
  emit('trigger-file-input')
}
</script>

<style lang="less" scoped>
@import '@/styles/variables.less';

.aps-data-panel {
  flex: 1;
  min-height: 0;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  // 顶部导入入口栏：独立一行，导入按钮位于左侧
  .aps-import-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 16px 20px;
    // border-bottom: 1px solid #f0f2f5;

    .aps-import-bar-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .aps-btn-import {
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }

  .aps-data-toolbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
    // border-bottom: 1px solid #f0f2f5;

    .aps-toolbar-left,
    .aps-toolbar-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .aps-selection-info {
      font-size: 14px;
      color: #606266;
      em {
        font-style: normal;
        color: @brand-primary;
        font-weight: 600;
        margin: 0 4px;
      }
    }

    .aps-search-input {
      width: 220px;
    }
  }

  .aps-data-table-wrap {
    flex: 1;
    min-height: 0;
    padding: 12px 12px 76px;
    box-sizing: border-box;
    overflow: auto;
  }

  .aps-data-footer {
    // 固定定位显示在最上层，便于用户随时操作
    // 仅覆盖右侧面板区域（content 左内边距 20 + 方案栏 240 + 间距 20），不遮挡左侧方案栏
    position: fixed;
    left: 280px;
    right: 20px;
    bottom: 0;
    z-index: 1000;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 20px;
    background: #fff;
    border-top: 1px solid #e4e7ed;
    box-shadow: 0 -2px 12px 0 rgba(0, 0, 0, 0.08);

    .aps-footer-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    // 与左侧新增方案按钮保持一致的高度与文字大小
    :deep(.el-button) {
      height: 40px;
      font-size: 15px;
    }
  }

  // 固定在底部操作栏顶端的横向滚动条，宽度与表格内容区对齐
  .aps-table-hscroll {
    position: fixed;
    left: 292px;
    right: 32px;
    bottom: 68px;
    z-index: 1000;
    box-sizing: border-box;
    padding: 0 4px;
    cursor: pointer;

    .aps-table-hscroll-track {
      height: 8px;
      border-radius: 4px;
      background: #eef1f6;
      position: relative;

      .aps-table-hscroll-thumb {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        min-width: 24px;
        border-radius: 4px;
        background: #c0c4cc;
        cursor: grab;
        transition: background 0.15s;

        &:hover {
          background: #909399;
        }
        &:active {
          cursor: grabbing;
          background: #909399;
        }
      }
    }
  }
}

// APS 数据表格样式：双行表头浅蓝底，行内单元格不合并
.aps-data-table {
  width: 100%;
  font-size: 14px;

  // 隐藏表格原生的横向滚动条（改用底部自定义固定滚动条）
  // 仅隐藏横向滚动条，纵向滚动条保留；隐藏不影响 wrap 的滚动事件与 scrollLeft
  :deep(.el-table__body-wrapper .el-scrollbar__bar.is-horizontal) {
    display: none;
  }

  :deep(.el-table__cell) {
    padding: 10px 0;
  }

  // 双行表头效果：强制子表头也带上底色
  :deep(.el-table__header-wrapper) {
    .el-table__cell {
      background: #eef1f6 !important;
      color: #303133 !important;
      font-weight: 600;
    }
  }

  // 操作列按钮组
  .row-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .row-action-btn {
    font-size: 16px;
    padding: 4px;
  }
  .row-action-edit {
    color: @brand-primary;
    &:hover {
      color: @brand-primary-dark;
    }
  }
  .row-action-del {
    color: #f56c6c;
    &:hover {
      color: #c45656;
    }
  }
}
</style>
