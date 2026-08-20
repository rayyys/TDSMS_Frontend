<template>
  <div class="task-data-page">
    <div class="page-header">
      <h2 class="page-title">任务数据导入明细</h2>
      <p class="page-desc">请确认导入的数据内容，若无误可点击"下一步"</p>
    </div>

    <!-- 筛选区：部门 / 生产计划 / 存货名称 + 筛选/重置 + 搜索（独立盒子） -->
    <div class="filter-bar">
      <div class="filter-fields">
        <div class="filter-field">
          <span class="filter-label">部门：</span>
          <el-select
            v-model="filterDepartment"
            class="td-filter-select td-filter-select--dept"
            placeholder="全部"
            multiple
            collapse-tags
            clearable
            :loading="filterOptionsLoading"
            popper-class="dept-select-popper"
            @visible-change="handleFilterDropdownVisibleChange"
          >
            <el-option v-for="opt in departmentOptions" :key="opt" :label="opt" :value="opt" />
          </el-select>
        </div>

        <div class="filter-field">
          <span class="filter-label">生产计划：</span>
          <el-select
            v-model="filterProductionPlan"
            class="td-filter-select td-filter-select--plan"
            placeholder="全部"
            multiple
            collapse-tags
            clearable
            :loading="filterOptionsLoading"
            popper-class="dept-select-popper"
            @visible-change="handleFilterDropdownVisibleChange"
            @change="handleProductionPlanChange"
          >
            <el-option
              v-for="opt in productionPlanDisplayOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>

        <div class="filter-field">
          <span class="filter-label">存货名称：</span>
          <el-select
            v-model="filterInventoryName"
            class="td-filter-select td-filter-select--inventory"
            placeholder="全部"
            multiple
            collapse-tags
            clearable
            :loading="filterOptionsLoading"
            popper-class="dept-select-popper"
            @visible-change="handleFilterDropdownVisibleChange"
          >
            <el-option v-for="opt in inventoryOptions" :key="opt" :label="opt" :value="opt" />
          </el-select>
        </div>

        <el-button class="btn-filter" type="primary" @click="handleFilter">筛选</el-button>
        <el-button class="btn-reset" @click="handleReset">重置</el-button>
      </div>

      <div class="filter-search">
        <el-input
          v-model="keyword"
          class="search-input"
          placeholder="搜索关键词..."
          clearable
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        >
          <template #suffix>
            <el-icon class="search-icon" @click="handleSearch"><Search /></el-icon>
          </template>
        </el-input>
      </div>
    </div>

    <div class="main-card">
      <!-- 表格区 -->
      <div v-loading="tableLoading" class="table-wrap" element-loading-text="数据加载中...">
        <AdaptiveTableContainer :columns="tableColumns" class="adaptive-wrapper">
          <template #default="{ scale, densityClass, headerStyle, bodyStyle, getColWidth }">
            <el-table
              :data="pagedRows"
              :class="['custom-table', densityClass]"
              :row-class-name="rowClassName"
              :fit="false"
              :header-cell-style="headerStyle"
              :cell-style="bodyStyle"
              :style="{ '--table-scale': scale }"
            >
              <el-table-column
                v-for="col in tableColumns"
                :key="col.key"
                :prop="col.key"
                :label="col.label"
                :width="getColWidth(col)"
                :align="col.align || 'left'"
                :show-overflow-tooltip="true"
              >
                <template #default="{ row }">
                  <!-- 占位行：隐藏文字但保留行高，确保容器高度恒定为 10 行 -->
                  <span v-if="row._isPlaceholder" class="cell-placeholder">-</span>
                  <span v-else class="cell-text">{{ row[col.key] || '-' }}</span>
                </template>
              </el-table-column>
              <template #empty>
                <el-empty description="暂无数据，请先在「数据上传」页上传文件" />
              </template>
            </el-table>
          </template>
        </AdaptiveTableContainer>
      </div>

      <!-- 分页区：左下角显示总条数，右侧分页 + 页面跳转 -->
      <div class="pagination-row">
        <span class="total-count">共 {{ totalRows }} 条</span>
        <div class="pagination-right">
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :total="totalRows"
            :page-sizes="[10, 20, 50, 100]"
            layout="prev, pager, next"
          />
          <!-- 页面跳转：跳转至 x 页 按钮 -->
          <div class="jump-box">
            <span class="jump-label">跳转至</span>
            <el-input v-model="jumpPage" class="jump-input" @keyup.enter="handleJump" />
            <span class="jump-label">页</span>
            <el-button class="jump-btn" @click="handleJump">跳转</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="action-bar">
    <el-button class="btn-prev" :disabled="isSolving" @click="handlePrev">
      <el-icon class="el-icon--left"><Back /></el-icon> 上一步
    </el-button>
    <!-- 右侧操作按钮组：与 model-build 页面保持一致的结构 -->
    <div class="action-right">
      <el-button type="primary" class="btn-next" @click="handleNext">
        下一步 <el-icon class="el-icon--right"><Right /></el-icon>
      </el-button>
    </div>
  </div>

  <!-- 底部吸底占位盒：位于操作栏下方，吸底定位，防止内容被操作栏遮挡 -->
  <div class="action-bar-space"></div>
</template>

<script setup>
import { Back, Right } from '@element-plus/icons-vue'
import AdaptiveTableContainer from '@/components/AdaptiveTableContainer.vue'
import { useTaskData } from './useTaskData'
import { useStepNav } from '../useStepNav'

const {
  Search,
  // 筛选
  filterDepartment,
  filterProductionPlan,
  filterInventoryName,
  departmentOptions,
  inventoryOptions,
  productionPlanDisplayOptions,
  filterOptionsLoading,
  handleFilterDropdownVisibleChange,
  handleProductionPlanChange,
  // 搜索 / 翻页
  keyword,
  currentPage,
  pageSize,
  totalRows,
  tableLoading,
  jumpPage,
  // 表格
  pagedRows,
  tableColumns,
  rowClassName,
  // 方法
  handleSearch,
  handleFilter,
  handleReset,
  handleJump,
  ensureDataLoaded,
} = useTaskData()

const stepNav = useStepNav()
const { handlePrev, isSolving } = stepNav

// 任务数据页「下一步」：先等待任务数据加载完成，再放行步骤导航。
// 修复首启动时任务数据仍在加载（接口存在延迟）即点击下一步被 canNext 拦截的问题
async function handleNext() {
  await ensureDataLoaded()
  await stepNav.handleNext()
}
</script>

<style lang="less" scoped>
@import './taskData.less';
</style>

<!-- 部门多选下拉弹层 teleport 到 body，需使用非 scoped 全局样式；
     仅通过 .dept-select-popper 限定作用范围，避免影响其它下拉 -->
<style lang="less">
.dept-select-popper {
  .el-select-dropdown__item {
    display: flex;
    align-items: center;
    gap: 8px;

    // 前置方形勾选框（未选中：空心方框）
    &::before {
      content: '';
      flex: 0 0 auto;
      width: 14px;
      height: 14px;
      box-sizing: border-box;
      border: 1px solid #c0c4cc;
      border-radius: 2px;
      background-color: #fff;
      transition:
        background-color 0.15s,
        border-color 0.15s;
    }

    // 选中：填充主题色并显示白色对勾
    &.is-selected::before {
      border-color: #1769e8;
      background-color: #1769e8;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 13l4 4L19 7'/%3E%3C/svg%3E");
      background-size: 10px;
      background-position: center;
      background-repeat: no-repeat;
    }

    // 隐藏 Element Plus 默认的右侧勾选标记，避免重复
    &.is-selected::after {
      display: none !important;
    }
  }
}
</style>
