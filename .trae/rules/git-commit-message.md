---
alwaysApply: true
scene: git_message
---

- 提交信息必须使用中文撰写，下面的简介内容应当按1、2、3条数排列，要说清楚提交的内容
- 格式：`<type>(<scope>): <subject>`
  - type 和 scope 使用英文，subject 使用中文
  - type 可选值：feat, fix, refactor, style, docs, chore, test, perf
  - scope 为可选的模块名
- subject 使用简洁的祈使句，不超过 50 字
- 示例：
  - `feat(data-upload): 新增历史记录删除按钮 loading 状态`
  - `fix(model-solve): 修复轮询间隔过长的性能问题`
  - `refactor(useStepNav): 提取公共导航逻辑`
