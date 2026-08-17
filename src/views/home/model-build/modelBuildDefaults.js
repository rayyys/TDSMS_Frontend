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

  // —— 班次换算配置 ——
  shiftDays: 1, // 天数
  shiftHours: 2, // 班时

  // —— 人员容量配置（早班）——
  morningShiftCapacity: { 配料: 3, 压片: 2, 包衣: 2, 包装: 4 },

  // —— 算法求解时长配置 ——
  maxSolveTime: 1200, // 最大求解时间（秒），1200 = 20 分钟
}
