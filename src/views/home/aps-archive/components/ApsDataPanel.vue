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
          已选择<em>{{ planState.selectedRows.length }}</em
          >行
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

    <!-- 数据表格：el-table-v2 虚拟滚动，只渲染视口内可见行，数据量再大切换方案也不会卡顿 -->
    <div
      v-loading="planState.tableLoading"
      class="aps-data-table-wrap"
      element-loading-text="正在解析Excel..."
    >
      <!-- 自适应表格容器：按容器宽度动态计算列宽与字号密度，保证任意缩放比下视觉稳定 -->
      <AdaptiveTableContainer
        :columns="tableColumns"
        class="aps-adaptive-table"
        @column-layout-ready="onColumnLayoutReady"
      >
        <template #default="{ densityClass, headerStyle, bodyStyle, getColWidth, scale }">
          <div class="aps-table-v2-box" :class="densityClass">
            <el-auto-resizer>
              <template #default="{ height, width }">
                <el-table-v2
                  ref="tableV2Ref"
                  class="aps-data-table"
                  :columns="buildV2Columns(getColWidth)"
                  :data="filteredTableData"
                  :width="width"
                  :height="height"
                  :row-key="'__rowKey'"
                  :row-height="tableRowHeight(scale)"
                  :row-class="rowClassName"
                  :header-height="[tableRowHeight(scale), tableRowHeight(scale)]"
                  fixed
                  @scroll="onV2Scroll"
                >
                  <!-- 单元格渲染：按列类型分支（选择列 / 操作列 / 可编辑输入框 / 只读溢出文本） -->
                  <template #cell="{ column, rowData }">
                    <!-- 主视口中固定列的占位副本：内容由左/右固定面板渲染，此处跳过避免双重显示 -->
                    <template v-if="column.placeholderSign"></template>
                    <!-- 区块选择列：点击勾选框自动选中该品种连续区块 -->
                    <el-checkbox
                      v-else-if="column.key === 'selection'"
                      :model-value="isRowSelected(rowData)"
                      @click="onToggleBlock(rowData)"
                    />
                    <!-- 操作列：编辑/删除按钮 -->
                    <div v-else-if="column.key === 'actions'" class="row-actions">
                      <el-button
                        link
                        class="row-action-btn row-action-edit"
                        :icon="isRowEditable(rowData) ? Check : Edit"
                        @click="isRowEditable(rowData) ? onSaveTable() : onEditRow(rowData)"
                      />
                      <el-button
                        link
                        class="row-action-btn row-action-del"
                        :icon="Delete"
                        @click="onDeleteRow(rowData)"
                      />
                    </div>
                    <!-- 数据列：外层容器应用自适应内边距与行高（bodyStyle），编辑/只读内容在容器内居中且不贴边 -->
                    <div v-else class="aps-cell-body" :style="bodyStyle">
                      <el-input
                        v-if="isRowEditable(rowData)"
                        v-model="rowData[column.key]"
                        class="aps-editable-cell"
                        placeholder=""
                      />
                      <ApsOverflowText v-else :content="rowData[column.key]" />
                    </div>
                  </template>

                  <!-- 双行表头：第一行分组合并（配料/压片/...）+ 跨行列标签；第二行列标题 -->
                  <template #header="{ columns, headerIndex }">
                    <template v-for="(col, idx) in columns" :key="col.key">
                      <!-- 第一行：分组的起始列渲染跨列合并单元格（宽度=组内列宽和），其余列不渲染 -->
                      <div
                        v-if="headerIndex === 0 && (!col.group || isGroupStartCol(columns, idx))"
                        class="el-table-v2__header-cell aps-v2-header"
                        :class="{ 'aps-v2-header-group': !!col.group }"
                        :style="{
                          width: (col.group ? groupWidth(columns, col) : col.width) + 'px',
                          flexShrink: 0,
                          ...headerStyle,
                        }"
                      >
                        <!-- 主视口中固定列的占位副本：内容由左/右固定面板渲染，此处跳过避免双重显示 -->
                        <template v-if="col.placeholderSign"></template>
                        <el-checkbox
                          v-else-if="col.key === 'selection'"
                          :model-value="isAllSelected"
                          :indeterminate="isIndeterminate"
                          @click="onToggleAll"
                        />
                        <span v-else-if="col.key === 'actions'">操作</span>
                        <span v-else-if="col.group">{{ col.group }}</span>
                        <span v-else>{{ col.title }}</span>
                      </div>
                      <!-- 第二行：分组列渲染标题（可换行），跨行列与选择/操作列留空（第一行已显示） -->
                      <div
                        v-else-if="headerIndex === 1"
                        class="el-table-v2__header-cell aps-v2-header"
                        :style="{ width: col.width + 'px', flexShrink: 0, ...headerStyle }"
                      >
                        <template v-if="col.key === 'selection'"></template>
                        <template v-else-if="col.key === 'actions'"></template>
                        <template v-else-if="col.group">
                          <template v-if="col.subtitle"
                            >{{ col.title }}<br />{{ col.subtitle }}</template
                          >
                          <template v-else>{{ col.title }}</template>
                        </template>
                      </div>
                    </template>
                  </template>
                </el-table-v2>
              </template>
            </el-auto-resizer>
          </div>
        </template>
      </AdaptiveTableContainer>
    </div>

    <!-- 同步表格横向滚动的固定滚动条（位于底部操作栏顶端） -->
    <!-- <div class="aps-table-hscroll" ref="hscrollRef">
      <div
        class="aps-table-hscroll-track"
        ref="trackRef"
        @click="onTrackClick"
        @wheel.prevent="onHScrollWheel"
      > -->
    <!-- 拖拽滑块暂时注释掉（轨道点击 / 滚轮滚动仍可用） -->
    <!-- <div class="aps-table-hscroll-thumb" ref="thumbRef" @mousedown.prevent="onThumbDown"></div> -->
    <!-- </div>
    </div> -->

    <!-- 底部操作栏 -->
    <div class="aps-data-footer">
      <el-button class="aps-btn-add-row" plain :icon="Plus" @click="onAddRow">
        新增数据行
      </el-button>
      <div class="aps-footer-right">
        <el-button class="aps-btn-export" plain @click="onExportTable">导出表格</el-button>
        <el-button
          class="aps-btn-save"
          type="primary"
          :loading="planState.saving"
          @click="onSaveTable"
          >保存</el-button
        >
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { Plus, Upload, Edit, Delete, Search, Check } from '@element-plus/icons-vue'
import AdaptiveTableContainer from '@/components/AdaptiveTableContainer.vue'
import ApsOverflowText from './ApsOverflowText.vue'

const props = defineProps({
  filteredTableData: {
    type: Array,
    required: true,
  },
})

// planState 改为 v-model 双向绑定（defineModel）：
// 父组件通过 v-model:plan-state 传入共享响应式状态，子组件直接修改其嵌套属性即合法，
// 不再触发 vue/no-mutating-props；模板中 planState 为 ref 会自动解包，用法保持不变
const planState = defineModel('plan-state', {
  type: Object,
  required: true,
})

const emit = defineEmits([
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

// 表格列配置：供 AdaptiveTableContainer 动态计算列宽（顺序与展示顺序一致）
// width 为设计稿基准列宽，组件会根据容器宽度等比缩放；type 标记选择列/操作列
const tableColumns = [
  { key: 'selection', type: 'selection', width: 55 },
  { key: 'product', prop: 'product', label: '品种', width: 180 },
  { key: 'packageSpec', prop: 'packageSpec', label: '包装规格', width: 250 },
  // 配料
  { key: 'dispensingLine', prop: 'dispensingLine', label: '配料线体', width: 150 },
  { key: 'batchQty', prop: 'batchQty', label: '批量(万片/粒)', width: 110 },
  { key: 'shiftOutput', prop: 'shiftOutput', label: '试产量(万片)', width: 110 },
  { key: 'dispensingStaff', prop: 'dispensingStaff', label: '用人', width: 100 },
  // 压片
  { key: 'pressMachine', prop: 'pressMachine', label: '压片机', width: 120 },
  { key: 'pressOutput', prop: 'pressOutput', label: '班产量', width: 120 },
  { key: 'pressStaff', prop: 'pressStaff', label: '用人', width: 100 },
  // 包衣
  { key: 'coatingMachine', prop: 'coatingMachine', label: '包衣机', width: 120 },
  { key: 'coatingOutput', prop: 'coatingOutput', label: '班产量', width: 120 },
  { key: 'coatingStaff', prop: 'coatingStaff', label: '用人', width: 100 },
  // 分装/铝塑
  { key: 'fillingEquip', prop: 'fillingEquip', label: '填料设备', width: 150 },
  { key: 'fillingOutput', prop: 'fillingOutput', label: '班产量(万片)', width: 110 },
  { key: 'fillingStaff', prop: 'fillingStaff', label: '用人', width: 100 },
  // 包装
  { key: 'packingEquip', prop: 'packingEquip', label: '操作设备', width: 120 },
  { key: 'packingOutput', prop: 'packingOutput', label: '班产量(万片)', width: 110 },
  { key: 'manualOutput', prop: 'manualOutput', label: '手工包装(1人产量)', width: 150 },
  { key: 'packingStaff', prop: 'packingStaff', label: '用人', width: 100 },
  // 其他
  { key: 'cycleDays', prop: 'cycleDays', label: '生产周期/天', width: 110 },
  { key: 'isProcurement', prop: 'isProcurement', label: '是否集采品种', width: 110 },
  { key: 'annualSales', prop: 'annualSales', label: '年销量/万', width: 100 },
  // 操作列（minWidth 100 控制操作列下限，避免默认 160 过宽）
  { key: 'actions', type: 'action', label: '操作', width: 100, minWidth: 100 },
]

// ================== 虚拟表格列配置 ==================
// 列分组（合并表头）：组名 → 组内列的 key 列表，用于虚拟表格第一行分组合并
const COLUMN_GROUPS = [
  { label: '配料', keys: ['dispensingLine', 'batchQty', 'shiftOutput', 'dispensingStaff'] },
  { label: '压片', keys: ['pressMachine', 'pressOutput', 'pressStaff'] },
  { label: '包衣', keys: ['coatingMachine', 'coatingOutput', 'coatingStaff'] },
  { label: '分装/铝塑', keys: ['fillingEquip', 'fillingOutput', 'fillingStaff'] },
  { label: '包装', keys: ['packingEquip', 'packingOutput', 'manualOutput', 'packingStaff'] },
]

// 列 key → 所属分组名（无则 null，表示跨两行的普通列，如品种/包装规格等）
const COLUMN_GROUP_MAP = {}
for (const group of COLUMN_GROUPS) {
  for (const key of group.keys) COLUMN_GROUP_MAP[key] = group.label
}

// 表头第二行需要换行显示的列：主标题 + 副标题（与原始双行表头一致）
const MULTILINE_TITLES = {
  batchQty: ['批量', '(万片/粒)'],
  shiftOutput: ['试产量', '(万片)'],
  fillingOutput: ['班产量', '(万片)'],
  packingOutput: ['班产量', '(万片)'],
  manualOutput: ['手工包装', '(1人产量)'],
}

// ================== 表格外观规格配置（集中在此处调整） ==================
// 行高 / 表头高度：由「基准行高 + 随容器缩放的比例系数」计算，
// 缩放比例 scale 由 AdaptiveTableContainer 按容器宽度实时给出（0.15 ~ 2.0）
// 单元格内边距与行高线高：由 AdaptiveTableContainer 的 bodyStyle / headerStyle 提供，
// 会随容器缩放同步变化，与表头内边距视觉保持一致
const ROW_LAYOUT = {
  // 基准行高（容器宽 1680、scale=1 时的行高）
  baseRowHeight: 40,
  // 行高随缩放增加的比例系数（scale 每增加 1，行高增加 8px）
  perScale: 8,
}

// 计算数据行高与表头行高（双行分组表头共用同一高度）
function tableRowHeight(scale) {
  return Math.round(ROW_LAYOUT.baseRowHeight + ROW_LAYOUT.perScale * scale)
}

// 将 tableColumns 映射为 el-table-v2 的列配置：
// - width 由自适应组件的 getColWidth 逐列计算（随容器缩放实时更新）
// - 选择列固定左侧、操作列固定右侧；数据列标记分组归属与双行标题
function buildV2Columns(getColWidth) {
  return tableColumns.map((col) => {
    const v2Col = {
      key: col.key,
      dataKey: col.prop,
      width: getColWidth(col),
      fixed: col.type === 'selection' ? 'left' : col.type === 'action' ? 'right' : undefined,
    }
    // 仅数据列参与分组合并（选择/操作列不分组）
    v2Col.group = COLUMN_GROUP_MAP[col.key] ?? null
    // 第二行标题：带副标题的列拆成两行显示
    const lines = MULTILINE_TITLES[col.key]
    v2Col.title = lines ? lines[0] : col.label
    v2Col.subtitle = lines ? lines[1] : ''
    return v2Col
  })
}

// 判断某列是否为所在分组的起始列（仅起始列渲染合并单元格，实现表头合并）
function isGroupStartCol(columns, idx) {
  const col = columns[idx]
  if (!col.group) return true
  const startIdx = columns.findIndex((c) => c.group === col.group)
  return idx === startIdx
}

// 计算某列所在分组的列宽之和（用于第一行合并单元格宽度）
function groupWidth(columns, col) {
  return columns.filter((c) => c.group === col.group).reduce((sum, c) => sum + c.width, 0)
}

const tableV2Ref = ref(null)
const hscrollRef = ref(null)
const trackRef = ref(null)
const thumbRef = ref(null)

// 判断某行是否为当前可编辑行（同时仅一行可编辑，失焦不清空）
function isRowEditable(row) {
  return row === planState.value.editingRow
}

// 可编辑行应用特殊 class，用于深蓝色外边框高亮标识（作用于所有视口的行）
function rowClassName({ rowData }) {
  return isRowEditable(rowData) ? 'aps-editing-row' : ''
}

// ================== 区块式选择 ==================
// 勾选态由选中集合派生：判断某行是否处于选中集合中
function isRowSelected(row) {
  return planState.value.selectedRows.includes(row)
}

// 计算某行所在品种的连续区块：从该行向前后扩展，收集连续且品种相同的行
function findProductBlock(row) {
  const rows = planState.value.tableData || []
  const idx = rows.indexOf(row)
  if (idx === -1) return []
  const product = row?.product
  const block = [row]
  for (let i = idx - 1; i >= 0 && rows[i].product === product; i--) block.unshift(rows[i])
  for (let i = idx + 1; i < rows.length && rows[i].product === product; i++) block.push(rows[i])
  return block
}

// 点击行勾选框：整块已选中则从选中集合中移除该品种区块；否则将当前品种区块并入选中集合
// 支持同时选择多个品类：合并而非替换，保留其它已选品种
function onToggleBlock(row) {
  const state = planState.value
  const block = findProductBlock(row)
  if (!block.length) return
  const allSelected = block.every((r) => state.selectedRows.includes(r))
  if (allSelected) {
    state.selectedRows = state.selectedRows.filter((r) => !block.includes(r))
  } else {
    state.selectedRows = [
      ...state.selectedRows,
      ...block.filter((r) => !state.selectedRows.includes(r)),
    ]
  }
}

// 表头全选态：当前数据全部选中时为 true
const isAllSelected = computed(() => {
  const rows = props.filteredTableData || []
  return rows.length > 0 && rows.every((r) => planState.value.selectedRows.includes(r))
})

// 表头半选态：部分行选中时显示半选样式
const isIndeterminate = computed(() => {
  const rows = props.filteredTableData || []
  if (!rows.length) return false
  const selectedCount = rows.filter((r) => planState.value.selectedRows.includes(r)).length
  return selectedCount > 0 && selectedCount < rows.length
})

// 表头全选/取消全选：选中全部数据行，或清空选中
function onToggleAll() {
  const state = planState.value
  if (isAllSelected.value) {
    state.selectedRows = []
  } else {
    state.selectedRows = [...state.tableData]
  }
}

// ================== 横向滚动条同步（el-table-v2） ==================
// v2 自带横向滚动条被隐藏，改由底部固定滚动条统一控制，交互与改造前一致
const hScrollLeft = ref(0)
let dragging = false
// 鼠标按下时，光标相对滑块左边缘的偏移，保证从滑块任意位置拖拽都能跟手
let dragOffset = 0

// 获取 v2 主视口与横向滚动容器元素（用于计算滚动总宽与视口宽）
function getV2HScrollEls() {
  const el = tableV2Ref.value?.$el
  if (!el) return null
  const mainEl = el.querySelector('.el-table-v2__main')
  // v2 的实际横向滚动容器是虚拟列表的 window（.el-vl__wrapper 的首个子元素，无独立类名），
  // 其 scrollWidth 即全部列宽之和，clientWidth 即视口宽
  const windowEl = mainEl?.querySelector('.el-vl__wrapper')?.firstElementChild
  if (!mainEl || !windowEl) return null
  return { mainEl, windowEl }
}

// 根据 v2 的横向滚动状态，同步固定滚动条的尺寸与位置
function syncHScroll() {
  const els = getV2HScrollEls()
  const track = trackRef.value
  const thumb = thumbRef.value
  if (!els || !track || !thumb) return
  const { windowEl } = els
  const view = windowEl.clientWidth
  const total = windowEl.scrollWidth
  // 无横向溢出时隐藏滚动条
  if (total <= view) {
    thumb.style.display = 'none'
    return
  }
  thumb.style.display = 'block'
  const trackW = track.clientWidth
  const maxScroll = total - view
  const thumbW = Math.max(24, trackW * (view / total))
  thumb.style.width = thumbW + 'px'
  // 滑块位置按滚动比例映射到可用拖动区域（轨道宽 - 滑块宽）
  const maxThumbLeft = Math.max(0, trackW - thumbW)
  const ratio = maxScroll > 0 ? hScrollLeft.value / maxScroll : 0
  thumb.style.transform = `translateX(${ratio * maxThumbLeft}px)`
}

// v2 滚动事件：记录横向滚动位置并同步底部滚动条
function onV2Scroll({ scrollLeft }) {
  hScrollLeft.value = scrollLeft || 0
  syncHScroll()
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

// 将轨道上的像素偏移换算为 v2 的横向滚动位置
function thumbOffsetToScrollLeft(offsetX) {
  const els = getV2HScrollEls()
  const track = trackRef.value
  if (!els || !track) return 0
  const { windowEl } = els
  const view = windowEl.clientWidth
  const total = windowEl.scrollWidth
  const maxScroll = total - view
  const thumbW = Math.max(24, track.clientWidth * (view / total))
  const maxThumbLeft = Math.max(0, track.clientWidth - thumbW)
  const ratio = maxThumbLeft > 0 ? offsetX / maxThumbLeft : 0
  return Math.max(0, Math.min(maxScroll, ratio * maxScroll))
}

function onThumbMove(e) {
  if (!dragging || !trackRef.value) return
  const rect = trackRef.value.getBoundingClientRect()
  const offsetX = e.clientX - rect.left - dragOffset
  tableV2Ref.value?.scrollToLeft(thumbOffsetToScrollLeft(offsetX))
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
  const track = trackRef.value
  if (!track) return
  const rect = track.getBoundingClientRect()
  const offsetX = e.clientX - rect.left
  tableV2Ref.value?.scrollToLeft(thumbOffsetToScrollLeft(offsetX))
}

// 在固定滚动条上滚动滚轮：将纵向/横向滚轮位移换算为表格横向滚动（支持 Shift 滚轮、触摸板横向滑动）
function onHScrollWheel(e) {
  const delta = e.deltaX || e.deltaY
  if (!delta) return
  const els = getV2HScrollEls()
  if (!els) return
  const { windowEl } = els
  const maxScroll = windowEl.scrollWidth - windowEl.clientWidth
  if (maxScroll <= 0) return
  const next = Math.max(0, Math.min(maxScroll, hScrollLeft.value + delta))
  tableV2Ref.value?.scrollToLeft(next)
}

// 自适应组件完成列宽布局（容器尺寸变化后）时，重新同步底部固定滚动条
function onColumnLayoutReady() {
  syncHScroll()
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onThumbMove)
  document.removeEventListener('mouseup', onThumbUp)
})

// 搜索条件变化后，虚拟表格回到顶部查看搜索结果
watch(
  () => planState.value.searchQuery,
  () => {
    tableV2Ref.value?.scrollToTop()
  },
)

// 数据变化（切换方案/搜索过滤/新增行）后，重新同步横向滚动条状态
watch(
  () => props.filteredTableData.length,
  () => {
    nextTick(() => syncHScroll())
  },
)

// 保存排序后，滚动定位到新增行
watch(
  () => planState.value.scrollToRow,
  (target) => {
    if (!target) return
    const index = props.filteredTableData.indexOf(target)
    if (index >= 0) {
      tableV2Ref.value?.scrollToRow(index, 'auto')
    }
    // 定位完成后清除标记，避免重复触发
    planState.value.scrollToRow = null
  },
  { immediate: false },
)

// 取消选择：清空选中集合，选择框勾选态随选中集合自动刷新
function onCancelSelection() {
  emit('cancel-selection')
}

function onBatchDelete() {
  emit('batch-delete')
}

function onResetSearch() {
  emit('reset-search')
}

function onAddRow() {
  emit('add-row')
  // 新增数据行位于末尾，延迟等待虚拟表格渲染完成后滚动定位到该行并聚焦首个可编辑单元格
  nextTick(() => {
    setTimeout(() => {
      const index = props.filteredTableData.length - 1
      if (index >= 0) {
        tableV2Ref.value?.scrollToRow(index, 'auto')
      }
      focusNewRowFirstCell()
    }, 100)
  })
}

// 聚焦新增行第一个可编辑单元格，使其立即可输入
function focusNewRowFirstCell() {
  const el = tableV2Ref.value?.$el
  if (!el) return
  const rows = el.querySelectorAll('.el-table-v2__row')
  const lastRow = rows[rows.length - 1]
  const firstInput = lastRow?.querySelector('.aps-editable-cell input')
  firstInput?.focus()
}

function onExportTable() {
  emit('export-table')
}

function onSaveTable() {
  emit('save-table')
}

function onEditRow(row) {
  emit('edit-row', row)
}

function onDeleteRow(row) {
  emit('delete-row', row)
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
    padding: 0 20px;

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
    padding: 12px 12px 50px;
    box-sizing: border-box;

    // 自适应表格容器：填满外层容器，虚拟表格在其中滚动
    :deep(.aps-adaptive-table) {
      width: 100%;
      height: 100%;
    }
  }

  // 虚拟表格容器：占满自适应容器，供 el-auto-resizer 测量尺寸
  .aps-table-v2-box {
    width: 100%;
    height: 100%;
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

// APS 数据表格（虚拟滚动）样式：双行表头浅蓝底，行内单元格不合并
.aps-data-table {
  // 隐藏 v2 自带的横向滚动条，横向滚动由底部固定滚动条统一控制；
  // 仅隐藏横向滚动条，纵向滚动条保留
  :deep(.el-table-v2__main .el-virtual-scrollbar--horizontal) {
    display: none;
  }

  // 单元格：flex 居中内容，模拟原 el-table 的 border 网格线
  :deep(.el-table-v2__row-cell) {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    overflow: hidden;
    border-bottom: 1px solid #eaeef4;
    border-right: 1px solid #eaeef4;
  }

  // 数据单元格内容容器：应用 bodyStyle 注入的自适应内边距与行高，
  // 使编辑/只读内容在单元格内水平居中且不贴边（与表头内边距视觉一致）
  :deep(.aps-cell-body) {
    width: 100%;
    box-sizing: border-box;
    text-align: center;
    overflow: hidden;
  }

  // 单元格内输入框与只读文本统一居中
  :deep(.el-table-v2__row-cell .el-input__inner),
  :deep(.el-table-v2__row-cell .aps-cell-text) {
    text-align: center !important;
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

    // 聚焦态不再显示浅色底，编辑态视觉反馈由整行深蓝外边框提供
    .el-input__wrapper.is-focus {
      background: transparent;
    }
  }

  // ===== 可编辑行：整行外边框高亮为深蓝色，清晰标识编辑状态 =====
  // 上下外边框：横跨整行（含固定列），保证行上下被蓝色框线包围
  :deep(.el-table-v2__row.aps-editing-row .el-table-v2__row-cell) {
    border-top: 1px solid #0066cc !important;
    border-bottom: 1px solid #0066cc !important;
  }

  // 左侧外边框（多选列，固定左列）：以内阴影绘制蓝色竖线
  :deep(.el-table-v2__left .el-table-v2__row.aps-editing-row .el-table-v2__row-cell:first-child) {
    box-shadow: inset 1px 0 0 0 #0066cc !important;
  }

  // 右侧外边框（操作列，固定右列）：以内阴影绘制蓝色竖线
  :deep(.el-table-v2__right .el-table-v2__row.aps-editing-row .el-table-v2__row-cell:last-child) {
    box-shadow: inset -1px 0 0 0 #0066cc !important;
  }

  // 表头单元格：浅蓝底加粗居中，模拟原双行表头视觉
  :deep(.el-table-v2__header-cell) {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    box-sizing: border-box;
    border-bottom: 1px solid #dfe4ec;
    border-right: 1px solid #dfe4ec;
    background: #eef1f6;
    color: #303133;
    font-weight: 600;
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
