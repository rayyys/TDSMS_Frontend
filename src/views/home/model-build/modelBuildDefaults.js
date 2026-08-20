/**
 * 模型构建页「恢复默认参数」默认值配置
 * 集中管理默认参数值，便于后期统一调整默认值或重置逻辑。
 * 修改此处即可同步影响「恢复默认参数」按钮的填充行为。
 */
export const MODEL_BUILD_DEFAULTS = {
  // —— 生产规则配置 ——
  continuousRunLimit: 5.5, // 连续运行上限（天）
  cleaningTimeLarge: 0.5, // 大清场（天）
  cleaningTimeSmall: 0.25, // 小清场（天）
  cleaningTimeRegular: 0.5, // 定期清场（天）

  // —— 班次换算配置（天数固定，见上方 SHIFT_DAYS_FIXED）——
  shiftHours: 2, // 班时（仅允许输入整数）

  // —— 人员容量配置（早班）——
  morningShiftCapacity: { 配料: 3, 压片: 2, 包衣: 2, 包装: 4 },

  // —— 算法求解时长配置 ——
  maxSolveTime: 1200, // 最大求解时间（秒），1200 = 20 分钟
}

// 班次换算固定天数：天数固定为 1 天，不允许用户手动修改，
// 后续提交/展示等计算逻辑统一引用该固定值，修改此处即可全局生效
export const SHIFT_DAYS_FIXED = 1
