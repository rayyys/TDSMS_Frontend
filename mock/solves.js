/**
 * 模型求解模块 Mock（无后端时前端联调用）
 * 覆盖：提交求解 / 查询状态 / 查询日志 / 查询参数 / 最大生产时间 / 停止求解 / 导出结果
 *
 * 说明：通过内存 Map 维护"求解会话"状态，模拟求解从运行中到完成的动态过程，
 *      以便前端状态轮询能真实走完 running → done 的完整流程。
 *      注意：响应函数需为同步函数，延迟用 timeout 字段控制。
 */
import * as XLSX from 'xlsx'

// 求解会话：solveId -> { startTime, status, taskId, objectiveWeight, maxSolveTime }
const solveSessions = new Map()
let solveSeq = 1

// 生成唯一求解 ID
function nextSolveId() {
  return `SOLVE${Date.now()}${solveSeq++}`
}

// 生成 ISO 时间字符串（前端用 Date 解析）
function nowIso() {
  return new Date().toISOString()
}

// 生成展示用时间字符串 YYYY-MM-DD HH:mm:ss（前端取 11~19 位作为日志时间）
function nowDisplayTime() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 根据会话计算当前求解状态：运行 12s 内无可行解，20s 内有可行解，之后完成
function computeStatus(session) {
  const elapsed = (Date.now() - session.startTime) / 1000
  if (elapsed >= 20) {
    return { solveStatus: 2, hasPartialResult: true, isOptimal: true } // 已完成
  }
  if (elapsed >= 12) {
    return { solveStatus: 1, hasPartialResult: true, isOptimal: false } // 运行中，已有可行解
  }
  return { solveStatus: 1, hasPartialResult: false, isOptimal: false } // 运行中，尚无可行解
}

export default [
  // 提交模型求解（开启求解）
  {
    url: '/tdsms/solves/start',
    method: 'post',
    timeout: 800,
    response: ({ body }) => {
      const { taskId = 'TASK1' } = body || {}
      const solveId = nextSolveId()
      solveSessions.set(solveId, {
        startTime: Date.now(),
        status: 1,
        taskId,
        objectiveWeight: body?.objectiveWeight ?? 0,
        maxSolveTime: body?.maxSolveTime ?? 10,
      })
      return {
        success: true,
        code: 0,
        message: '求解已启动',
        data: {
          taskId,
          solveId,
          solveNo: `NO${String(solveSeq).padStart(4, '0')}`,
          startTime: nowIso(),
        },
      }
    },
  },
  // 查询求解状态（前端每 30s 轮询一次）
  {
    url: '/tdsms/solves/status',
    method: 'get',
    timeout: 200,
    response: ({ query }) => {
      const { solveId } = query || {}
      const session = solveSessions.get(solveId)
      // 会话不存在时返回运行中，避免前端误判完成
      if (!session) {
        return {
          success: true,
          code: 0,
          message: 'success',
          data: { solveId, taskId: '', solveStatus: 1, hasPartialResult: false, startTime: nowIso() },
        }
      }
      const { solveStatus, hasPartialResult } = computeStatus(session)
      const done = solveStatus === 2
      return {
        success: true,
        code: 0,
        message: 'success',
        data: {
          solveId,
          taskId: session.taskId,
          solveStatus,
          hasPartialResult,
          startTime: new Date(session.startTime).toISOString(),
          endTime: done ? nowIso() : undefined,
          solveProgress: done
            ? 100
            : Math.min(99, Math.floor(((Date.now() - session.startTime) / 1000 / 20) * 100)),
        },
      }
    },
  },
  // 查询求解日志
  {
    url: '/tdsms/solves/logs',
    method: 'get',
    timeout: 200,
    response: ({ query }) => {
      const { solveId } = query || {}
      const session = solveSessions.get(solveId)
      const elapsed = session ? (Date.now() - session.startTime) / 1000 : 0
      const logs = []
      const base = [
        '已读取任务数据，开始构建排程模型...',
        '模型构建完成，进入求解迭代阶段',
        '正在迭代计算最优排产方案...',
        '已生成可行排产方案，正在优化',
      ]
      base.forEach((content, i) => {
        if (elapsed >= i * 3) {
          logs.push({ id: i + 1, logContent: content, createTime: nowDisplayTime() })
        }
      })
      return { success: true, code: 0, message: 'success', data: logs }
    },
  },
  // 查询求解参数（用于恢复旧任务）
  {
    url: '/tdsms/solves/paramInfo',
    method: 'get',
    timeout: 200,
    response: ({ query }) => {
      const { solveId } = query || {}
      const session = solveSessions.get(solveId)
      if (!session) {
        return { success: false, code: 400, message: '求解任务不存在', data: {} }
      }
      const { solveStatus } = computeStatus(session)
      return {
        success: true,
        code: 0,
        message: 'success',
        data: {
          taskId: session.taskId,
          solveId,
          solveNo: `NO${solveId.slice(-4)}`,
          objectiveWeight: session.objectiveWeight,
          maxSolveTime: session.maxSolveTime, // 分钟
          solveStatus,
          startTime: new Date(session.startTime).toISOString(),
        },
      }
    },
  },
  // 获取最大生产时间（模型构建页用于校验时间间隔）
  {
    url: '/tdsms/solves/producTime',
    method: 'get',
    timeout: 300,
    response: () => {
      // 返回数组，前端取第一个值作为最大生产时间（分钟）
      return { success: true, code: 0, message: 'success', data: [30] }
    },
  },
  // 停止求解
  {
    url: '/tdsms/solves/stop',
    method: 'post',
    timeout: 300,
    response: ({ body }) => {
      const { solveId } = body || {}
      const session = solveSessions.get(solveId)
      if (session) {
        session.status = 4
      }
      return { success: true, code: 0, message: '已停止求解', data: {} }
    },
  },
  // 导出求解结果（返回 xlsx 文件流）
  {
    url: '/tdsms/solves/resultExport',
    method: 'post',
    rawResponse(req, res) {
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.aoa_to_sheet([
        ['设备编号', '设备名称', '订单编号', '产品名称', '计划数量', '开始时间', '结束时间'],
        ['V001', '压片机1号', 'PO20260811001', '阿莫西林片 0.25g', 120, '2026-08-11 08:00', '2026-08-11 18:00'],
        ['V002', '压片机2号', 'PO20260811002', '布洛芬缓释片 0.3g', 150, '2026-08-11 09:00', '2026-08-11 20:00'],
      ])
      XLSX.utils.book_append_sheet(workbook, sheet, '排程结果')
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', 'attachment; filename=solve-result.xlsx')
      res.end(buffer)
    },
  },
]
