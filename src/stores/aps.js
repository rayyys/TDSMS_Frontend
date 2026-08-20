import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getApsArchiveList } from '@/api/scheduling'
import { saveApsState, loadApsState, clearApsState, clearApsDraftStates } from '@/utils/apsStorage'

/**
 * APS 方案列表全局状态（单一数据源）
 *
 * 解决的问题：
 * - 新增方案后刷新丢失：方案列表持久化到 localStorage，刷新后恢复
 * - 多页面数据不一致：data-upload 等页面通过本 store 读取方案列表
 *
 * 方案类型：
 * - 本地草稿（isSaved=false，id 以 "plan-" 开头）：仅前端保存，刷新后可恢复
 * - 已保存方案（isSaved=true，id 为后端 archiveId）：以后端 /aps/listQuery 为准
 */
export const useApsStore = defineStore('aps', () => {
  // 启动时先从 localStorage 恢复，保证刷新后方案列表立即可用
  const saved = loadApsState()

  // 方案列表：{ id, name, isSaved }
  const planList = ref(saved?.planList ?? [])
  // 当前选中的方案 id（刷新后恢复上次选择）
  const activePlanId = ref(saved?.activePlanId ?? null)
  // 是否已从后端拉取过方案列表（避免每个页面重复请求）
  const listLoaded = ref(false)
  const listLoading = ref(false)
  // 进行中的 listQuery 请求（并发去重用）
  let listPromise = null

  // 下拉框选项：包含全部方案（已保存方案 + 本地草稿），新增方案后即可在下拉框中实时看到；
  // 草稿标注「未保存」便于区分，同时携带 isSaved 标记供业务侧拦截提交
  const planOptions = computed(() =>
    planList.value.map((p) => ({
      label: p.isSaved ? p.name : `${p.name}（未保存）`,
      value: String(p.id),
      isSaved: p.isSaved,
    })),
  )

  // 持久化全部状态到 localStorage
  function persist() {
    saveApsState({
      planList: planList.value,
      activePlanId: activePlanId.value,
    })
  }

  // 拉取方案列表（GET /aps/listQuery）：已保存方案以后端为准，本地草稿保留
  // 并发去重：同一时刻只发一次请求，多个页面挂载时复用结果
  async function ensurePlanList(force = false) {
    if (listLoaded.value && !force) return planList.value
    if (listPromise) return listPromise

    listLoading.value = true
    listPromise = (async () => {
      try {
        const res = await getApsArchiveList()
        const result = res?.data
        if (result?.success === false) {
          ElMessage.error(result.message || '获取方案列表失败')
          return planList.value
        }
        // 兼容 data 为数组 / data 为 { records } 分页结构
        const raw = result?.data ?? result
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.records) ? raw.records : []
        // 后端已保存方案（权威数据源）；remark 由后端列表接口返回（可能为空字符串）
        const serverPlans = list.map((item) => ({
          id: String(item.archiveId),
          name: item.archiveName || '未命名方案',
          remark: item.remark ?? '',
          isSaved: true,
        }))
        // 本地草稿（未保存，仅存在于 localStorage）
        const localPlans = planList.value.filter((p) => !p.isSaved)
        // 合并：已保存方案以后端为准，本地草稿保留
        planList.value = [...serverPlans, ...localPlans]
        // 当前选中方案不存在（如已被删除）时默认选中第一个
        if (!planList.value.some((p) => p.id === activePlanId.value)) {
          activePlanId.value = planList.value[0]?.id ?? null
        }
        listLoaded.value = true
        persist()
        return planList.value
      } catch (err) {
        const status = err?.response?.status
        if (status !== 401) {
          // 401 已在响应拦截器中统一处理（提示 + 跳转）
          ElMessage.error(err?.response?.data?.message || err.message || '获取方案列表失败')
        }
        // 拉取失败时保留已有方案，不中断页面
        return planList.value
      } finally {
        listLoading.value = false
        listPromise = null
      }
    })()
    return listPromise
  }

  // 本地新增方案（草稿）：持久化到 localStorage，刷新后不丢失
  function addLocalPlan(name) {
    const plan = { id: `plan-${Date.now()}`, name, remark: '', isSaved: false }
    planList.value.push(plan)
    activePlanId.value = plan.id
    persist()
    return plan
  }

  // 更新方案本地元信息（名称/备注）：本地草稿直接修改；
  // 已保存方案由接口调用成功后同步，保证界面显示与后端一致
  function patchPlan(id, patch) {
    const entry = planList.value.find((p) => p.id === id)
    if (!entry) return
    if (patch.name !== undefined) entry.name = patch.name
    if (patch.remark !== undefined) entry.remark = patch.remark
    persist()
  }

  // 保存成功后：将本地草稿升级为已保存方案（id 换为后端 archiveId）
  function markPlanSaved(oldId, archiveId) {
    const newId = String(archiveId)
    const entry = planList.value.find((p) => p.id === oldId)
    if (entry) {
      entry.id = newId
      entry.isSaved = true
    }
    if (activePlanId.value === oldId) {
      activePlanId.value = newId
    }
    persist()
  }

  // 删除方案：从列表移除并持久化
  function removePlan(id) {
    planList.value = planList.value.filter((p) => p.id !== id)
    if (activePlanId.value === id) {
      activePlanId.value = planList.value[0]?.id ?? null
    }
    persist()
  }

  // 切换选中方案并持久化
  function selectPlan(id) {
    if (activePlanId.value === id) return
    activePlanId.value = id
    persist()
  }

  // 退出登录时清空状态与本地缓存，避免不同账号间的方案数据串用
  function resetState() {
    planList.value = []
    activePlanId.value = null
    listLoaded.value = false
    listLoading.value = false
    listPromise = null
    clearApsState()
    clearApsDraftStates()
  }

  return {
    planList,
    activePlanId,
    planOptions,
    listLoaded,
    listLoading,
    ensurePlanList,
    addLocalPlan,
    patchPlan,
    markPlanSaved,
    removePlan,
    selectPlan,
    resetState,
  }
})
