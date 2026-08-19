<template>
  <div class="account-page">
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">账号管理</h2>
        <p class="page-desc">管理测试用户账号，可创建、编辑、查看测试用户信息</p>
      </div>
      <el-button type="primary" plain class="btn-back-workflow" @click="goToWorkflow"
        >回到工作流</el-button
      >
    </div>

    <div class="main-card">
      <div class="account-layout">
        <!-- 左侧：新增测试用户 -->
        <div class="create-box">
          <div class="box-title">新增测试用户</div>

          <el-form :model="createForm" label-position="top" class="create-form">
            <el-form-item label="账号">
              <el-input v-model="createForm.username" placeholder="请输入测试账号" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input v-model="createForm.password" placeholder="请输入密码" show-password />
            </el-form-item>
            <el-form-item label="有效天数">
              <el-input-number
                v-model="createForm.validDays"
                :min="1"
                :max="365"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="部门">
              <el-input v-model="createForm.departmentName" placeholder="请输入部门" />
            </el-form-item>
            <el-form-item label="姓名">
              <el-input v-model="createForm.realName" placeholder="请输入姓名" />
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                class="btn-create"
                :loading="creating"
                @click="handleCreate"
              >
                创建测试用户
              </el-button>
            </el-form-item>
          </el-form>

          <div class="create-tip">
            创建测试用户后，系统将自动生成账号信息并分配初始权限。测试用户的有效期从创建当天开始计算，到期后账号将自动失效。
          </div>
        </div>

        <!-- 右侧：测试用户列表 -->
        <div class="list-box">
          <div class="box-title">测试用户列表</div>

          <div class="table-wrap">
            <el-table
              v-loading="loading"
              :data="pagedUsers"
              stripe
              class="user-table"
              header-row-class-name="table_header_dark"
              :row-class-name="rowClassName"
              element-loading-text="加载中..."
            >
              <template #empty>
                <el-empty description="暂无测试用户数据" />
              </template>
              <el-table-column
                prop="username"
                label="账号"
                min-width="9%"
                :resizable="false"
                align="center"
              >
                <template #default="{ row }">
                  <template v-if="!row._isPlaceholder">
                    <el-tooltip
                      :content="row.username ?? '-'"
                      placement="top"
                      popper-class="custom-table-tooltip"
                    >
                      <span v-overflow-tip class="cell-text">{{ row.username ?? '-' }}</span>
                    </el-tooltip>
                  </template>
                </template>
              </el-table-column>
              <el-table-column
                prop="realName"
                label="姓名"
                min-width="9%"
                :resizable="false"
                align="center"
              >
                <template #default="{ row }">
                  <template v-if="!row._isPlaceholder">
                    <el-tooltip
                      :content="row.realName ?? '-'"
                      placement="top"
                      popper-class="custom-table-tooltip"
                    >
                      <span v-overflow-tip class="cell-text">{{ row.realName ?? '-' }}</span>
                    </el-tooltip>
                  </template>
                </template>
              </el-table-column>
              <el-table-column
                prop="departmentName"
                label="部门"
                min-width="9%"
                :resizable="false"
                align="center"
              >
                <template #default="{ row }">
                  <template v-if="!row._isPlaceholder">
                    <el-tooltip
                      :content="row.departmentName ?? '-'"
                      placement="top"
                      popper-class="custom-table-tooltip"
                    >
                      <span v-overflow-tip class="cell-text">{{ row.departmentName ?? '-' }}</span>
                    </el-tooltip>
                  </template>
                </template>
              </el-table-column>
              <el-table-column label="到期时间" min-width="13%" :resizable="false" align="center">
                <template #default="{ row }">
                  <template v-if="!row._isPlaceholder">
                    <el-tooltip
                      :content="row.expireTime || '-'"
                      placement="top"
                      popper-class="custom-table-tooltip"
                    >
                      <span v-overflow-tip class="cell-text">{{ row.expireTime || '-' }}</span>
                    </el-tooltip>
                  </template>
                </template>
              </el-table-column>
              <el-table-column label="状态" min-width="7%" :resizable="false" align="center">
                <template #default="{ row }">
                  <template v-if="!row._isPlaceholder">{{
                    row.statusName === '已过期' ? '已过期' : '正常'
                  }}</template>
                </template>
              </el-table-column>
              <el-table-column label="是否禁用" min-width="7%" :resizable="false" align="center">
                <template #default="{ row }">
                  <template v-if="!row._isPlaceholder">{{
                    row.status === 0 ? '是' : '否'
                  }}</template>
                </template>
              </el-table-column>
              <el-table-column
                label="最近一次登陆时间"
                min-width="13%"
                :resizable="false"
                align="center"
              >
                <template #default="{ row }">
                  <template v-if="!row._isPlaceholder">
                    <el-tooltip
                      :content="row.lastLoginTime || '-'"
                      placement="top"
                      popper-class="custom-table-tooltip"
                    >
                      <span v-overflow-tip class="cell-text">{{ row.lastLoginTime || '-' }}</span>
                    </el-tooltip>
                  </template>
                </template>
              </el-table-column>
              <el-table-column label="剩余天数" min-width="16%" :resizable="false" align="center">
                <template #default="{ row }">
                  <template v-if="!row._isPlaceholder">
                    <el-input-number
                      v-model="row.remainingDays"
                      :min="0"
                      :max="999"
                      size="small"
                      controls-position="right"
                      class="fixed-input-number"
                    />
                  </template>
                </template>
              </el-table-column>
              <el-table-column label="操作" min-width="16%" :resizable="false" align="center">
                <template #default="{ row }">
                  <template v-if="!row._isPlaceholder">
                    <div class="action-btns">
                      <button class="btn-save" @click="handleSave(row)">保存</button>
                      <button
                        v-if="row.status === 0"
                        class="btn-enable"
                        @click="handleToggleStatus(row, 1)"
                      >
                        启用
                      </button>
                      <button
                        v-if="row.status === 1"
                        class="btn-disable"
                        @click="handleToggleStatus(row, 0)"
                      >
                        停用
                      </button>
                    </div>
                  </template>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="pagination-row">
            <span class="total-count">共 {{ totalUsers }} 条</span>
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :total="totalUsers"
              layout="prev, pager, next"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useAccountManagement } from './useAccountManagement'
import { useRouter } from 'vue-router'

// 自定义指令：检测文本是否溢出，未溢出时禁用 tooltip 避免误触发
const vOverflowTip = {
  mounted(el) {
    const check = () => {
      const isOverflow = el.scrollWidth > el.clientWidth
      const trigger = el.closest('.el-tooltip__trigger')
      if (trigger) {
        trigger.style.pointerEvents = isOverflow ? '' : 'none'
      }
    }
    requestAnimationFrame(check)
    const observer = new ResizeObserver(check)
    observer.observe(el)
    el._overflowObserver = observer
  },
  unmounted(el) {
    if (el._overflowObserver) {
      el._overflowObserver.disconnect()
    }
  },
}

const router = useRouter()

const {
  createForm,
  creating,
  loading,
  pagedUsers,
  totalUsers,
  currentPage,
  pageSize,
  handleCreate,
  handleSave,
  handleToggleStatus,
} = useAccountManagement()

function goToWorkflow() {
  router.back()
}

// 状态为"已过期"或"停用"的数据行添加 class，配合 CSS 设置红色底色
function rowClassName({ row }) {
  if (row._isPlaceholder) return 'row-placeholder'
  if (row.statusName === '已过期' || row.status === 0) {
    return 'row-expired'
  }
  return ''
}
</script>

<style lang="less" scoped>
@import './accountManagement.less';

/* 已过期行红色底色，同时覆盖 tr 和 td，防止 stripe 斑马纹背景遮挡 */
:deep(.el-table .row-expired) {
  background-color: #fde2e2 !important;
  > td {
    background-color: #fde2e2 !important;
  }
}

/* 占位空行完全空白，白色背景覆盖 stripe 斑马纹，设置固定高度匹配数据行 */
:deep(.row-placeholder),
:deep(.el-table .row-placeholder > td) {
  background-color: #fff !important;
}
:deep(.el-table .row-placeholder > td) {
  height: 54.2px;
}
</style>
