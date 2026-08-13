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
    <div
      v-loading="planState.tableLoading"
      ref="wrapRef"
      class="aps-data-table-wrap"
      element-loading-text="正在解析Excel..."
    >
      <el-table
        ref="tableRef"
        :data="filteredTableData"
        border
        stripe
        class="aps-data-table"
        :row-class-name="rowClassName"
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
        >
          <template #default="scope">
            <el-input
              v-if="isRowEditable(scope.row)"
              v-model="scope.row.product"
              class="aps-editable-cell"
              placeholder=""
            />
            <span v-else class="aps-cell-text">{{ scope.row.product || '—' }}</span>
          </template>
        </el-table-column>

        <!-- 包装规格 -->
        <el-table-column
          prop="packageSpec"
          label="包装规格"
          min-width="180"
          :resizable="true"
          align="center"
        >
          <template #default="scope">
            <el-input
              v-if="isRowEditable(scope.row)"
              v-model="scope.row.packageSpec"
              class="aps-editable-cell"
              placeholder=""
            />
            <span v-else class="aps-cell-text">{{ scope.row.packageSpec || '—' }}</span>
          </template>
        </el-table-column>

        <!-- 配料（合并 4 列子表头） -->
        <el-table-column label="配料" align="center">
          <el-table-column
            prop="dispensingLine"
            label="配料线体"
            min-width="100"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.dispensingLine"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.dispensingLine || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="batchQty"
            label="批量(万片/粒)"
            min-width="110"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.batchQty"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.batchQty || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="shiftOutput"
            label="试产量(万片)"
            min-width="110"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.shiftOutput"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.shiftOutput || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="dispensingStaff"
            label="用人"
            min-width="70"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.dispensingStaff"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.dispensingStaff || '—' }}</span>
            </template>
          </el-table-column>
        </el-table-column>

        <!-- 压片（合并 3 列子表头） -->
        <el-table-column label="压片" align="center">
          <el-table-column
            prop="pressMachine"
            label="压片机"
            min-width="100"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.pressMachine"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.pressMachine || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="pressOutput"
            label="班产量"
            min-width="90"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.pressOutput"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.pressOutput || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="pressStaff"
            label="用人"
            min-width="70"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.pressStaff"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.pressStaff || '—' }}</span>
            </template>
          </el-table-column>
        </el-table-column>

        <!-- 包衣（合并 3 列子表头） -->
        <el-table-column label="包衣" align="center">
          <el-table-column
            prop="coatingMachine"
            label="包衣机"
            min-width="90"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.coatingMachine"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.coatingMachine || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="coatingOutput"
            label="班产量"
            min-width="90"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.coatingOutput"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.coatingOutput || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="coatingStaff"
            label="用人"
            min-width="70"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.coatingStaff"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.coatingStaff || '—' }}</span>
            </template>
          </el-table-column>
        </el-table-column>

        <!-- 分装/铝塑（合并 3 列子表头） -->
        <el-table-column label="分装/铝塑" align="center">
          <el-table-column
            prop="fillingEquip"
            label="填料设备"
            min-width="100"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.fillingEquip"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.fillingEquip || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="fillingOutput"
            label="班产量(万片)"
            min-width="110"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.fillingOutput"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.fillingOutput || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="fillingStaff"
            label="用人"
            min-width="70"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.fillingStaff"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.fillingStaff || '—' }}</span>
            </template>
          </el-table-column>
        </el-table-column>

        <!-- 包装（合并 4 列子表头） -->
        <el-table-column label="包装" align="center">
          <el-table-column
            prop="packingEquip"
            label="操作设备"
            min-width="100"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.packingEquip"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.packingEquip || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="packingOutput"
            label="班产量(万片)"
            min-width="110"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.packingOutput"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.packingOutput || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="manualOutput"
            label="手工包装(1人产量)"
            min-width="150"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.manualOutput"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.manualOutput || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="packingStaff"
            label="用人"
            min-width="70"
            :resizable="true"
            align="center"
          >
            <template #default="scope">
              <el-input
                v-if="isRowEditable(scope.row)"
                v-model="scope.row.packingStaff"
                class="aps-editable-cell"
                placeholder=""
              />
              <span v-else class="aps-cell-text">{{ scope.row.packingStaff || '—' }}</span>
            </template>
          </el-table-column>
        </el-table-column>

        <!-- 生产周期/天 -->
        <el-table-column
          prop="cycleDays"
          label="生产周期/天"
          min-width="110"
          :resizable="true"
          align="center"
        >
          <template #default="scope">
            <el-input
              v-if="isRowEditable(scope.row)"
              v-model="scope.row.cycleDays"
              class="aps-editable-cell"
              placeholder=""
            />
            <span v-else class="aps-cell-text">{{ scope.row.cycleDays || '—' }}</span>
          </template>
        </el-table-column>

        <!-- 是否集采品种 -->
        <el-table-column
          prop="isProcurement"
          label="是否集采品种"
          min-width="110"
          :resizable="true"
          align="center"
        >
          <template #default="scope">
            <el-input
              v-if="isRowEditable(scope.row)"
              v-model="scope.row.isProcurement"
              class="aps-editable-cell"
              placeholder=""
            />
            <span v-else class="aps-cell-text">{{ scope.row.isProcurement || '—' }}</span>
          </template>
        </el-table-column>

        <!-- 年销量/万 -->
        <el-table-column
          prop="annualSales"
          label="年销量/万"
          min-width="100"
          :resizable="true"
          align="center"
        >
          <template #default="scope">
            <el-input
              v-if="isRowEditable(scope.row)"
              v-model="scope.row.annualSales"
              class="aps-editable-cell"
              placeholder=""
            />
            <span v-else class="aps-cell-text">{{ scope.row.annualSales || '—' }}</span>
          </template>
        </el-table-column>

        <!-- 操作列 -->
        <el-table-column label="操作" width="100" :resizable="false" align="center" fixed="right">
          <template #default="scope">
            <div class="row-actions">
              <el-button
                link
                class="row-action-btn row-action-edit"
                :icon="Edit"
                @click="onEditRow(scope.row)"
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
        <el-button class="aps-btn-save" type="primary" :loading="planState.saving" @click="onSaveTable">保存</el-button>
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
const wrapRef = ref(null)
const hscrollRef = ref(null)
const trackRef = ref(null)
const thumbRef = ref(null)

// 判断某行是否为当前可编辑行（同时仅一行可编辑，失焦不清空）
function isRowEditable(row) {
  return row === props.planState.editingRow
}

// 可编辑行应用特殊 class，用于深蓝色外边框高亮标识
function rowClassName({ row }) {
  return isRowEditable(row) ? 'aps-editing-row' : ''
}

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

// 保存排序后，滚动定位到新增行
watch(
  () => props.planState.scrollToRow,
  (target) => {
    if (!target) return
    nextTick(() => {
      tableRef.value?.doLayout?.()
      const index = props.filteredTableData.indexOf(target)
      scrollToRowByIndex(index)
      // 定位完成后清除标记，避免重复触发
      props.planState.scrollToRow = null
    })
  },
  { immediate: false }
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
  // 新增数据行后，自动滚动到底部，使最新添加的行立即可见
  // el-table 内部渲染是异步的，需延迟等待新行渲染完成后再读取 scrollHeight
  nextTick(() => {
    tableRef.value?.doLayout?.()
  })
  setTimeout(() => {
    tableRef.value?.doLayout?.()
    scrollToLastRow()
    focusNewRowFirstCell()
  }, 100)
}

// 聚焦新增行第一个可编辑单元格，使其立即可输入
function focusNewRowFirstCell() {
  const tableEl = tableRef.value?.$el
  if (!tableEl) return
  const rows = tableEl.querySelectorAll('.el-table__body-wrapper tbody tr')
  const lastRow = rows[rows.length - 1]
  const firstInput = lastRow?.querySelector('.aps-editable-cell input')
  firstInput?.focus()
}

// 遍历祖先元素，找到所有竖向可滚动容器并平滑滚动到底部
function scrollToLastRow() {
  const tableEl = tableRef.value?.$el
  if (!tableEl) return
  let node = tableEl.parentElement
  while (node && node !== document.documentElement) {
    const overflowY = getComputedStyle(node).overflowY
    // 仅滚动真正有溢出内容的容器（scrollHeight > clientHeight）
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
    }
    node = node.parentElement
  }
}

// 将指定下标的行滚动到可视区域（避开底部固定操作栏），用于排序后定位新增行
function scrollToRowByIndex(index) {
  const tableEl = tableRef.value?.$el
  if (!tableEl || index < 0) return
  const rows = tableEl.querySelectorAll('.el-table__body-wrapper tbody tr')
  const target = rows[index]
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'end' })
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
      padding: 0 28px;
      font-size: 16px;
    }

    // 导出表格：白底描边（对齐 model-build 的“恢复默认参数”按钮样式）
    .aps-btn-export {
      color: #606266;
      border-color: #dcdfe6;
      background-color: #fff;

      &:hover:not(:disabled) {
        color: #1c4b8e;
        border-color: #004aa9;
        background-color: #f4f7fc;
      }
    }

    // 保存：实心品牌蓝（对齐 model-build 的“开始求解”按钮样式）
    .aps-btn-save {
      background-color: #004aa9;
      border-color: #004aa9;
      color: #fff;

      &:hover {
        background-color: #1c4b8e;
        border-color: #1c4b8e;
        color: #fff;
      }
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
    padding: 4px 0;
  }

  // scrollIntoView 时为底部固定操作栏预留空间，避免定位的行被遮挡
  :deep(.el-table__body-wrapper tbody tr) {
    scroll-margin-bottom: 80px;
  }

  // 可编辑单元格：无边框、居中、聚焦时高亮，视觉上与普通单元格一致
  :deep(.aps-editable-cell) {
    width: 100%;

    .el-input__wrapper {
      box-shadow: none !important;
      background: transparent;
      padding: 0 6px;
    }

    .el-input__inner {
      text-align: center;
      height: 32px;
      line-height: 32px;
      color: #2d3436;
    }

    // 聚焦时仅保留浅色底，不再显示单元格级的小边框（由整行深蓝外边框标识编辑态）
    .el-input__wrapper.is-focus {
      background: #f5f9ff;
    }
  }

  // 非可编辑行的只读文本：与输入框同等高度、居中显示
  .aps-cell-text {
    display: block;
    height: 32px;
    line-height: 32px;
    text-align: center;
    color: #2d3436;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // ===== 可编辑行：整行外边框高亮为深蓝色，清晰标识编辑状态 =====
  :deep(tbody tr.aps-editing-row) td.el-table__cell {
    // 上下外边框：横跨整行（含固定列），保证行上下被蓝色框线包围
    border-top: 1px solid #0066cc !important;
    border-bottom: 1px solid #0066cc !important;
  }

  // 左侧外边框（多选列，固定左列）：抬高层级压过表格左侧灰色外框线（border-left-patch，z-index=3），再以内阴影绘制蓝色竖线
  :deep(tbody tr.aps-editing-row) td.el-table-fixed-column--left {
    box-shadow: inset 1px 0 0 0 #0066cc !important;
    z-index: 4;
  }

  // 右侧外边框（操作列，固定右列）：抬高层级压过表格右侧灰色外框线，再以内阴影绘制蓝色竖线
  :deep(tbody tr.aps-editing-row) td.el-table-fixed-column--right {
    box-shadow: inset -1px 0 0 0 #0066cc !important;
    z-index: 4;
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
