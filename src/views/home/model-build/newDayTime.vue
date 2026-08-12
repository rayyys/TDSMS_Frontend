<template>
  <div ref="pickerRef" class="custom-datetime-picker">
    <!-- 主输入框部分 -->
    <div
      class="el-input"
      :class="{ 'is-focus': visible, 'is-disabled': disabled }"
      @click="!disabled && togglePanel()"
    >
      <div class="el-input__wrapper">
        <span class="el-input__prefix">
          <el-icon><Clock /></el-icon>
        </span>
        <input class="el-input__inner" :placeholder="placeholder" :value="displayValue" readonly />
        <!-- 照搬 Element Plus 清除图标实现：visibility 保持 DOM 存在，mousedown.prevent 阻止失焦 -->
        <span
          class="el-input__suffix el-input__clear"
          :style="{ visibility: displayValue && isHovered ? 'visible' : 'hidden' }"
          @mousedown.prevent
          @click.stop="clear"
        >
          <el-icon><CircleClose /></el-icon>
        </span>
      </div>
    </div>

    <!-- 主下拉面板 -->
    <transition name="el-zoom-in-top">
      <div v-show="visible" class="el-picker-panel" @click.stop="closeTimePicker">
        <div class="el-picker-panel__body-wrapper">
          <!-- 顶部输入区 -->
          <div class="el-date-picker__time-header">
            <span class="el-date-picker__editor-wrap">
              <input v-model="tempDateStr" class="el-date-picker__editor" @blur="syncTempDate" />
            </span>

            <!-- 时间选择器 -->
            <span class="el-date-picker__editor-wrap time-editor-wrap">
              <input
                class="el-date-picker__editor"
                :value="tempTimeStr"
                placeholder="请选择时间"
                readonly
                @click.stop="openTimePicker"
              />
              <!-- 时间三栏下拉列表 -->
              <transition name="el-zoom-in-top">
                <div v-show="showTimePicker" class="time-picker-panel" @click.stop>
                  <div class="time-picker-panel__content">
                    <!-- 修复2：使用 el-scrollbar 替换原生滚动 -->
                    <el-scrollbar ref="hourScrollRef" class="time-list-scrollbar">
                      <ul class="time-list">
                        <li
                          v-for="h in 24"
                          :key="'h' + h"
                          :class="{ active: tempHour === h - 1 }"
                          @click="setHour(h - 1)"
                        >
                          {{ pad(h - 1) }}
                        </li>
                      </ul>
                    </el-scrollbar>

                    <el-scrollbar ref="minuteScrollRef" class="time-list-scrollbar">
                      <ul class="time-list">
                        <li
                          v-for="m in 60"
                          :key="'m' + m"
                          :class="{ active: tempMinute === m - 1 }"
                          @click="setMinute(m - 1)"
                        >
                          {{ pad(m - 1) }}
                        </li>
                      </ul>
                    </el-scrollbar>

                    <el-scrollbar ref="secondScrollRef" class="time-list-scrollbar">
                      <ul class="time-list">
                        <li
                          v-for="s in 60"
                          :key="'s' + s"
                          :class="{ active: tempSecond === s - 1 }"
                          @click="setSecond(s - 1)"
                        >
                          {{ pad(s - 1) }}
                        </li>
                      </ul>
                    </el-scrollbar>
                  </div>
                  <div class="time-picker-panel__footer">
                    <button class="el-button el-button--text" @click="setInternalTimeNow">
                      此刻
                    </button>
                    <button class="el-button el-button--default btn-small" @click="confirmTime">
                      确定
                    </button>
                  </div>
                </div>
              </transition>
            </span>
          </div>

          <div class="el-picker-panel__body">
            <!-- 日历控制头部 -->
            <div class="el-date-picker__header">
              <button class="el-picker-panel__icon-btn" @click="changeYear(-1)">«</button>
              <button class="el-picker-panel__icon-btn" @click="changeMonth(-1)">‹</button>
              <span class="el-date-picker__header-label">{{ currentYear }}</span>
              <span class="el-date-picker__header-label">{{ currentMonthName }}</span>
              <button class="el-picker-panel__icon-btn" @click="changeMonth(1)">›</button>
              <button class="el-picker-panel__icon-btn" @click="changeYear(1)">»</button>
            </div>

            <!-- 日历主体 -->
            <div class="el-picker-panel__content">
              <table class="el-date-table">
                <tbody>
                  <tr>
                    <th v-for="day in weekDays" :key="day">{{ day }}</th>
                  </tr>
                  <tr v-for="(row, rowIndex) in calendarRows" :key="rowIndex">
                    <td
                      v-for="(cell, colIndex) in row"
                      :key="colIndex"
                      :class="{
                        'prev-month': cell.type === 'prev',
                        'next-month': cell.type === 'next',
                        available: cell.type === 'current',
                        current: isSelectedDate(cell.date),
                        today: isToday(cell.date),
                      }"
                      @click="selectDate(cell.date)"
                    >
                      <div>
                        <span>{{ cell.text }}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 底部大按钮 -->
        <div class="el-picker-panel__footer">
          <button class="el-button el-button--text" @click="setNow">现在</button>
          <button class="el-button el-button--primary" @click="confirm">确定</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { Clock, CircleClose } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: {
    type: [Date, String],
    default: null,
  },
  placeholder: {
    type: String,
    default: '选择日期和时间',
  },
  valueFormat: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'change'])

// 基础状态
const visible = ref(false)
const pickerRef = ref(null)
const isHovered = ref(false)

const viewDate = ref(new Date())
const tempDate = ref(new Date())
const tempDateStr = ref('')

// --- 新增：内部时间选择器状态 ---
const showTimePicker = ref(false)

// 修复2：更新引用的名称，指向 el-scrollbar 实例
const hourScrollRef = ref(null)
const minuteScrollRef = ref(null)
const secondScrollRef = ref(null)

const tempHour = computed(() => tempDate.value.getHours())
const tempMinute = computed(() => tempDate.value.getMinutes())
const tempSecond = computed(() => tempDate.value.getSeconds())

const tempTimeStr = computed(() => {
  return `${pad(tempHour.value)}:${pad(tempMinute.value)}:${pad(tempSecond.value)}`
})

const weekDays = ['日', '一', '二', '三', '四', '五', '六']
const months = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
]

const pad = (n) => (n < 10 ? '0' + n : n)

const formatDate = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 根据 valueFormat 格式化日期值 */
const formatDateByValueFormat = (date) => {
  if (!props.valueFormat) return date // 无 valueFormat 时返回 Date 对象
  const d = new Date(date)
  // 仅支持常见格式组合，如 YYYY-MM-DD HH:mm:ss、YYYY-MM-DD
  let result = props.valueFormat
  result = result.replace('YYYY', d.getFullYear())
  result = result.replace('MM', pad(d.getMonth() + 1))
  result = result.replace('DD', pad(d.getDate()))
  result = result.replace('HH', pad(d.getHours()))
  result = result.replace('mm', pad(d.getMinutes()))
  result = result.replace('ss', pad(d.getSeconds()))
  return result
}

const displayValue = computed(() => formatDate(props.modelValue))
const currentYear = computed(() => viewDate.value.getFullYear())
const currentMonthName = computed(() => months[viewDate.value.getMonth()])

const calendarRows = computed(() => {
  const rows = []
  const year = viewDate.value.getFullYear()
  const month = viewDate.value.getMonth()
  const firstDayOfMonth = new Date(year, month, 1)
  const startOffset = firstDayOfMonth.getDay()
  const startDate = new Date(year, month, 1 - startOffset)

  const currentDate = new Date(startDate)
  for (let i = 0; i < 6; i++) {
    const row = []
    for (let j = 0; j < 7; j++) {
      let type = 'current'
      if (
        (currentDate.getMonth() < month && currentDate.getFullYear() <= year) ||
        currentDate.getFullYear() < year
      ) {
        type = 'prev'
      } else if (currentDate.getMonth() > month || currentDate.getFullYear() > year) {
        type = 'next'
      }
      row.push({ text: currentDate.getDate(), date: new Date(currentDate), type })
      currentDate.setDate(currentDate.getDate() + 1)
    }
    rows.push(row)
  }
  return rows
})

// 面板控制
const togglePanel = () => {
  if (!visible.value) {
    const initDate = props.modelValue ? new Date(props.modelValue) : new Date()
    viewDate.value = new Date(initDate)
    tempDate.value = new Date(initDate)
    updateTempStrs()
  }
  visible.value = !visible.value
  if (!visible.value) showTimePicker.value = false
}

const closeGlobal = (e) => {
  if (pickerRef.value && !pickerRef.value.contains(e.target)) {
    visible.value = false
    showTimePicker.value = false
  }
}

// --- 时间选择器相关逻辑 ---
const openTimePicker = () => {
  showTimePicker.value = true
  // 修复2：使用 el-scrollbar 的 setScrollTop 方法定位
  nextTick(() => {
    if (hourScrollRef.value) hourScrollRef.value.setScrollTop(tempHour.value * 32)
    if (minuteScrollRef.value) minuteScrollRef.value.setScrollTop(tempMinute.value * 32)
    if (secondScrollRef.value) secondScrollRef.value.setScrollTop(tempSecond.value * 32)
  })
}

const closeTimePicker = () => {
  showTimePicker.value = false
}

const updateTempDatePart = (h, m, s) => {
  tempDate.value = new Date(
    tempDate.value.getFullYear(),
    tempDate.value.getMonth(),
    tempDate.value.getDate(),
    h,
    m,
    s,
  )
}

const setHour = (h) => updateTempDatePart(h, tempMinute.value, tempSecond.value)
const setMinute = (m) => updateTempDatePart(tempHour.value, m, tempSecond.value)
const setSecond = (s) => updateTempDatePart(tempHour.value, tempMinute.value, s)

const setInternalTimeNow = () => {
  const now = new Date()
  updateTempDatePart(now.getHours(), now.getMinutes(), now.getSeconds())
  nextTick(() => openTimePicker())
}

const confirmTime = () => {
  closeTimePicker()
}

// 日历控制
const changeMonth = (offset) =>
  (viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() + offset, 1))
const changeYear = (offset) =>
  (viewDate.value = new Date(viewDate.value.getFullYear() + offset, viewDate.value.getMonth(), 1))

const selectDate = (date) => {
  tempDate.value = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    tempHour.value,
    tempMinute.value,
    tempSecond.value,
  )
  updateTempStrs()
  // 日历选日期时即时更新 v-model，触发右侧交期联动
  emit('update:modelValue', formatDateByValueFormat(tempDate.value))
  emit('change', formatDateByValueFormat(tempDate.value))
}

const updateTempStrs = () => {
  tempDateStr.value = `${tempDate.value.getFullYear()}-${pad(tempDate.value.getMonth() + 1)}-${pad(tempDate.value.getDate())}`
}

const syncTempDate = () => {
  const parsed = new Date(`${tempDateStr.value} ${tempTimeStr.value}`)
  if (!isNaN(parsed)) {
    tempDate.value = parsed
    viewDate.value = new Date(parsed)
  } else {
    updateTempStrs()
  }
}

const isSelectedDate = (date) =>
  tempDate.value.getFullYear() === date.getFullYear() &&
  tempDate.value.getMonth() === date.getMonth() &&
  tempDate.value.getDate() === date.getDate()
const isToday = (date) => {
  const today = new Date()
  return (
    today.getFullYear() === date.getFullYear() &&
    today.getMonth() === date.getMonth() &&
    today.getDate() === date.getDate()
  )
}

// 底部主按钮操作
const setNow = () => {
  const now = new Date()
  tempDate.value = now
  viewDate.value = new Date(now)
  updateTempStrs()
  confirm()
}

const confirm = () => {
  emit('update:modelValue', formatDateByValueFormat(tempDate.value))
  emit('change', formatDateByValueFormat(tempDate.value))
  visible.value = false
  showTimePicker.value = false
}

const clear = () => {
  emit('update:modelValue', null)
  emit('change', null)
  visible.value = false
  showTimePicker.value = false
}

onMounted(() => {
  document.addEventListener('click', closeGlobal)
  pickerRef.value.addEventListener('mouseenter', () => (isHovered.value = true))
  pickerRef.value.addEventListener('mouseleave', () => (isHovered.value = false))
})

onUnmounted(() => {
  document.removeEventListener('click', closeGlobal)
})
</script>

<style scoped>
.custom-datetime-picker {
  position: relative;
  display: inline-block;
  font-family: 'Helvetica Neue', Helvetica, sans-serif;
}

.el-input {
  position: relative;
  font-size: 14px;
  display: inline-flex;
  width: 100%;
  cursor: pointer;
}

.el-input__wrapper {
  display: inline-flex;
  align-items: center;
  padding: 1px 11px;
  background-color: #fff;
  border-radius: 4px;
  /* border: 1px solid #e4e7ed; */
  width: 100%;
  transition: 0.2s;
}

.el-input.is-focus .el-input__wrapper,
.el-input:hover .el-input__wrapper {
  border-color: #409eff;
}

.el-input.is-disabled {
  cursor: not-allowed;
}

.el-input.is-disabled .el-input__wrapper {
  background-color: #f5f7fa;
  border-color: #e4e7ed;
  cursor: not-allowed;
}

.el-input.is-disabled .el-input__inner {
  cursor: not-allowed;
  color: #c0c4cc;
  -webkit-text-fill-color: #c0c4cc;
}

.el-input__inner {
  height: 30px;
  line-height: 30px;
  border: none;
  outline: none;
  padding: 0;
  flex: 1;
  min-width: 0;
  background: transparent;
  color: #606266;
  font-size: inherit;
  cursor: pointer;
}

.el-input__prefix,
.el-input__suffix {
  display: inline-flex;
  align-items: center;
  color: #a8abb2;
  flex-shrink: 0;
}

.el-input__prefix {
  margin-right: 8px;
}

.el-input__suffix {
  margin-left: 8px;
  position: relative;
  z-index: 10;
  display: inline-flex;
  align-items: center;
}

/* 清空按钮 — 参照 Element Plus .el-input__clear 实现 */
.el-input__clear {
  color: #a8abb2;
  cursor: pointer;
  font-size: 14px;
  pointer-events: auto; /* ✨ 新增：强制恢复鼠标事件响应 */
}

.el-input__clear:hover {
  color: #909399;
}

/* 主下拉面板 */
.el-picker-panel {
  color: #606266;
  border: 1px solid #e4e7ed;
  box-shadow:
    0px 12px 32px 4px rgba(0, 0, 0, 0.04),
    0px 8px 20px rgba(0, 0, 0, 0.08);
  background: #fff;
  border-radius: 4px;
  line-height: 30px;
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 12px;
  z-index: 2000;
  width: 322px;
}

/* 头部输入区 */
.el-date-picker__time-header {
  position: relative;
  border-bottom: 1px solid #e4e7ed;
  font-size: 12px;
  padding: 8px 5px 5px 5px;
  display: flex;
  justify-content: center;
}

.el-date-picker__editor-wrap {
  position: relative;
  display: inline-block;
  padding: 0 5px;
}

.el-date-picker__editor {
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  box-sizing: border-box;
  color: #606266;
  font-size: 12px;
  height: 28px;
  line-height: 28px;
  outline: none;
  padding: 0 10px;
  width: 130px;
  text-align: center;
  transition: 0.2s;
  cursor: pointer;
}

.el-date-picker__editor:focus {
  border-color: #409eff;
}

/* ========= 三列时间选择器下拉面板样式 ========= */
.time-editor-wrap {
  position: relative;
}

.time-picker-panel {
  position: absolute;
  top: 35px;
  left: -10px;
  width: 160px;
  background: #fff;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  border: 1px solid #e4e7ed;
  z-index: 2005;
  user-select: none;
}

.time-picker-panel__content {
  display: flex;
  height: 190px;
  overflow: hidden;
  position: relative;
}

.time-picker-panel__content::before,
.time-picker-panel__content::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background-color: #e4e7ed;
  z-index: 1;
}

.time-picker-panel__content::before {
  left: 33.33%;
}

.time-picker-panel__content::after {
  left: 66.66%;
}

/* el-scrollbar 的样式补充 */
.time-list-scrollbar {
  flex: 1;
  height: 100%;
}

.time-list {
  margin: 0;
  padding: 0;
  list-style: none;
  text-align: center;
  position: relative;
  z-index: 2;
}

.time-list li {
  height: 32px;
  line-height: 32px;
  font-size: 12px;
  color: #606266;
  cursor: pointer;
}

.time-list li:hover {
  background-color: #f5f7fa;
}

.time-list li.active {
  color: #409eff;
  font-weight: 700;
}

.time-picker-panel__footer {
  border-top: 1px solid #e4e7ed;
  padding: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-small {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 3px;
}

/* 日历控制 */
.el-date-picker__header {
  margin: 12px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.el-picker-panel__icon-btn {
  font-size: 16px;
  color: #303133;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.el-picker-panel__icon-btn:hover {
  color: #409eff;
}

.el-date-picker__header-label {
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

/* 日历主体 */
.el-picker-panel__content {
  margin: 15px;
}

.el-date-table {
  font-size: 12px;
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}

.el-date-table th {
  padding: 5px;
  color: #606266;
  font-weight: 400;
  border-bottom: 1px solid #ebeef5;
}

.el-date-table td {
  width: 32px;
  height: 30px;
  text-align: center;
  cursor: pointer;
  position: relative;
}

.el-date-table td span {
  width: 24px;
  height: 24px;
  display: block;
  margin: 0 auto;
  line-height: 24px;
  border-radius: 50%;
}

.el-date-table td:hover span {
  color: #409eff;
}

.el-date-table td.next-month,
.el-date-table td.prev-month {
  color: #a8abb2;
}

.el-date-table td.today span {
  color: #409eff;
  font-weight: bold;
}

.el-date-table td.current span {
  color: #fff;
  background-color: #409eff;
}

.el-date-table td.current:hover span {
  color: #fff;
}

/* 底部大按钮 */
.el-picker-panel__footer {
  border-top: 1px solid #e4e7ed;
  padding: 8px 12px;
  text-align: right;
  background-color: #fff;
  display: flex;
  justify-content: space-between;
}

.el-button {
  display: inline-block;
  cursor: pointer;
  border: 1px solid #dcdfe6;
  background: #fff;
  color: #606266;
  text-align: center;
  outline: none;
  margin: 0;
  transition: 0.1s;
  font-weight: 500;
  padding: 7px 15px;
  font-size: 12px;
  border-radius: 3px;
}

.el-button--default:hover {
  border-color: #c6e2ff;
  background-color: #ecf5ff;
  color: #409eff;
}

.el-button--text {
  border-color: transparent;
  color: #409eff;
  background: transparent;
  padding: 0 5px;
}

.el-button--primary {
  color: #fff;
  background-color: #409eff;
  border-color: #409eff;
}

.el-button--primary:hover {
  background: #66b1ff;
  border-color: #66b1ff;
}
</style>
