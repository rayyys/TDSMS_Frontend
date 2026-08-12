/**
 * 排程系统配置常量
 * 包含 Sheet 列定义、优化目标、求解时长选项等
 */

// 各 Sheet 的列定义（顺序即表格列顺序）
export const SHEET_COLUMNS = {
  订单信息: ['订单编号', '产品编号', '产品名称', '订单数量', '交货日期', '优先级', '客户名称'],
  产品工艺: [
    '产品编号',
    '产品名称',
    '工序编号',
    '工序名称',
    '标准工时(分钟)',
    '设备类型',
    '设备编号',
  ],
  设备信息: ['设备编号', '设备名称', '设备类型', '所属车间', '设备状态', '日产能(件)'],
  班次安排: ['班次编号', '班次名称', '开始时间', '结束时间', '工作时长(小时)'],
  维护计划: ['设备编号', '设备名称', '维护日期', '开始时间', '结束时间', '维护类型'],
  工作日历: ['日期', '星期', '是否工作日', '备注'],
}

export const SHEET_NAMES = Object.keys(SHEET_COLUMNS)

// 4 种优化目标（模型构建页选择，传递到模型求解页展示）
export const OPTIMIZATION_GOALS = [
  {
    value: 'delivery',
    label: '交期延误最小化',
    desc: '尽可能在交货日期前完成订单，减少逾期',
    icon: 'Aim',
  },
  {
    value: 'idle',
    label: '设备空闲最小化',
    desc: '提高设备利用率，减少设备闲置等待',
    icon: 'Clock',
  },
  {
    value: 'capacity',
    label: '产能利用率最大化',
    desc: '最大化各产线产能利用率，提升整体产出',
    icon: 'Odometer',
  },
  {
    value: 'urgent',
    label: '紧急订单优先',
    desc: '优先处理高优先级订单，确保交期满足',
    icon: 'WarningFilled',
  },
]

export const SOLVE_TIME_OPTIONS = [
  { value: 600, label: '10分钟' },
  { value: 1200, label: '20分钟' },
  { value: 1800, label: '30分钟' },
  { value: 3600, label: '1小时' },
  { value: 7200, label: '2小时' },
]
