# A.I.G 平台化重构规划与进度记录

> 目标：保持「AI 红队安全评估助手」对话能力不变，将系统从"助手工作台"升级为"安全评估平台"。
> 设计基准：`/Users/aimac/ai/AI-Infra-Guard/aig-pro-platform-redesign.html`（A.I.G Pro 高保真稿）+ `frontend/DESIGN.md`。
> 本文档实时记录规划与进度，每完成一项打勾并补充实际改动说明。

---

## 一、接手时现状快照（2026-09-18）

### 已完成的一期前端工作（worktree `worktree-glistening-toasting-cat`，6 提交，未合入 dev）

| 阶段 | 提交 | 内容 |
|------|------|------|
| 1–2 | `e1a1e305` | 设计令牌（brand/series/sev/met 色板、radius-16、Hanken Grotesk）进 `index.css` + tailwind；`platform/primitives`（SectionCard/PageHeader/FilterChips/KpiCard/Sparkline/SeverityBadge/TaskStatusBadge/TaskTypeBadge/DataTable/tokens）；`lib/taskApi.ts` + `lib/taskCreate.ts` 共享任务 API 层；`useTaskDetailState` + `platform/TaskDetailPanel` 从 App.tsx 抽出 |
| 3 | `af7f45cb` | PlatformShell（236px SideNav + Topbar ⌘K CommandSearch + 新建扫描 CTA）；AssistantDock 浮球+右抽屉嵌 ChatArea（CSS 开合保活 SSE/轮询）；DashboardPage（mock 数据 `useDashboardData`，`USE_MOCK=true` 切换点）；路由 `/ /tasks /scan /knowledge /agents` |
| 4 | `3d1a0f8e` | TaskCenterPage：状态/类型 FilterChips + 客户端分页（pageSize 强制 999）+ 标题/sessionId 搜索；`?status=&type=&sessionId=` 深链；TaskDetailPane 55vw 右栏（计划+终端流，只读，不污染全局 currentTaskId） |
| 5 | `219c1e26` | NewScanPage：左侧 CapabilitySelector（5 类能力）+ 右侧 ScanForm（与 ChatArea 共用 `buildTaskParams`/`buildTaskCreateBody` 参数链）；ScanTemplates localStorage 模板 |
| 6 | `4f2f3852` | RuleLibraryPage：5 统计卡 + 4 Tab（指纹/CVE/评测/MCP，复用 management TabContent）+ 同步官方规则（`/api/v1/system/update-data`）；`?tab=` 深链 |
| 7 | `fdbb55f0` | AgentsPage 内嵌 AgentManagementDialog；删除死代码 ExecutionPanel/HeroLightningOverlay/ParticleNetwork |

### 质量基线（接手时实测）

- `tsc --noEmit`：**0 错误**
- `eslint`（platform/pages/hooks）：仅 3 个**既有**错误（`HelpDocumentPage.tsx` no-useless-escape，非平台代码）
- 未提交改动：`frontend/pnpm-workspace.yaml` 被 pnpm 自动追加了 `allowBuilds` 占位垃圾（`set this to true or false`），待清理
- 助手保活约束（不可破坏）：SSE/messageQueue/5s 轮询挂在 ChatArea 生命周期上，AssistantDock 抽屉只能 CSS 开合，禁止条件渲染 ChatArea

### 与设计稿的已知差距（一期遗留）

1. Dashboard 全部指标为 mock（`USE_MOCK=true`），等后端聚合端点
2. 任务表「风险 / 评分 / Agent 节点」列渲染 '—'（`buildTaskSummary` 无这些字段）
3. 规则库设计稿 6 Tab，现只有 4（缺「提示词集」「Agent 配置」）
4. 设计稿的「越狱评测」「报告中心」独立页一期映射为任务中心预筛选（`/tasks?type=Model-Redteam-Report`、`/tasks?status=completed`）
5. `/dev-kit` 组件预览页注释标"阶段 7 删除"但仍存在
6. 任务列表服务端分页未做（前端强制 pageSize=999 全量拉取后客户端分页）
7. 残余 0 引用组件：`TaskSidebar.tsx`、`SensitiveDataPrompt.tsx`

---

## 二、总体路线（三阶段）

```
阶段 8  一期收尾（纯前端，低风险）        ← 当前阶段
阶段 9  后端平台化配套（Go API 层）
阶段 10 二期能力页（越狱评测/报告中心/通知）
```

原则：
- 每阶段一个提交，提交前过 `tsc --noEmit` + `eslint`（platform 相关 0 错误）+ `npx vite build --mode openSource`
- 阶段 9 起动 Go 后端，须遵守 `go build ./...` + `go test ./common/...` 通过
- i18n：所有新增文案同步补 `zh.json` + `en.json` 的 `platform.*` 命名空间

---

## 三、阶段 8 — 一期收尾（对齐设计稿 + 清理）✅ 2026-09-18 完成

- [x] 8.1 清理
  - 删除 `DevKitPage.tsx` + `/dev-kit` 路由（App.tsx）
  - 删除 0 引用组件 `TaskSidebar.tsx`、`SensitiveDataPrompt.tsx`
  - 修复 `HelpDocumentPage.tsx` 3 处 no-useless-escape（`\-]` → `-]`）
  - 还原 `frontend/pnpm-workspace.yaml` 的 pnpm 占位垃圾（git checkout）
- [x] 8.2 任务中心对齐设计稿
  - 表格行内运行进度 %：TaskTableRow 增 progress 字段，页面层从 AppContext task.plan 算完成比（与 TaskDetailPane 同口径；plan 为空不显示），TaskStatusBadge 渲染
  - 导出 CSV：新增 `lib/taskCsv.ts`（tasksToCsv/downloadCsv，BOM 头 + CSV 转义），TaskCenterPage 头部加「导出 CSV」按钮，导出当前筛选结果
  - 风险/评分/Agent 节点列保留 '—'（字段等阶段 9 `buildTaskSummary` 扩展）
- [x] 8.3 规则库补 Tab（新目录 `platform/knowledge/`）
  - 「Agent 配置」Tab：AgentConfigTabContent 只读清单（名称/协议类型/Endpoint），复用 `/knowledge/agent/names` + `/:name` + js-yaml 解析（与 AgentManagementDialog 同款）；管理动作跳 `/agents`，避免双入口漂移
  - 「提示词集」Tab：调研结论 = 后端无独立提示词库端点（ChatGPT-Jailbreak-Prompts.json 等属 data/eval 评测集），落地空态说明卡 PromptSetTabContent，待后端补端点
  - RuleLibraryPage：isLibTab 守卫，prompts/agents 不走 useKnowledgeLibrary
- [x] 8.4 Dashboard 细节
  - TrendChartCard「表格视图」从死按钮改为图表/表格双视图切换（DataTable 复用，激活态高亮）
  - mock 提示徽章文案核对：zh/en 均已有 mockHint，无需改动
- [x] 8.5 构建验证：tsc 0 错误；eslint（platform 范围）0 错误；`vite build --mode openSource` 通过 4.42s（chunk 体积警告为既有）

## 四、阶段 9 — 后端平台化配套（Go）

- [ ] 9.1 `GET /api/v1/dashboard/summary`
  - 返回：KPI（综合安全评分/待处置风险/覆盖资产/越狱通过率）+ 趋势（按任务类型分系列）+ 严重度分布 + Top 风险资产 + 评分分布 + Top 组件 + 最新发现
  - 参数：`taskType` / `timeRange`（7d/30d/90d）；assetDomain 一期无资产域概念，参数保留但忽略
  - 落点：`common/websocket/`（建议独立 `dashboard_api.go`，不再往 task_manager.go 塞）
  - 数据口径：从 SQLite sessions + 任务结果 JSON 聚合；无法得出的指标（如综合评分历史）先用可得数据的降级口径并在响应中带 `coverage` 说明
- [ ] 9.2 `buildTaskSummary` 扩展（task_manager.go:1185）
  - 新增：`riskCount`（发现风险数）、`score`（安全评分）、`agentNode`（执行 agent）、`progress`（0–100）
  - 从 session 结果/plan 数据推导，取不到返回 null（前端已按 '—' 兜底）
- [ ] 9.3 任务列表服务端分页 + 过滤
  - list 接口加 `page`/`pageSize`/`status`/`type`/`search` 参数；前端 TaskCenter 去掉 pageSize=999 hack，切真分页
- [ ] 9.4 前端切换
  - `useDashboardData` 的 `USE_MOCK=false` + 实现 `fetchDashboardStats(filters)`
  - TaskCenter 分页/筛选切服务端
- [ ] 9.5 Go 侧验证：`go build ./...`、`go test ./common/...`；重编 server 二进制；文档更新 + 提交

## 五、阶段 10 — 二期能力页

- [ ] 10.1 越狱评测独立页（`/jailbreak`）
  - 聚焦 Model-Redteam-Report 任务：数据集/攻击方法概览、通过率趋势、历史对比
  - SideNav「越狱评测」从预筛选跳转改为独立路由
- [ ] 10.2 报告中心独立页（`/reports`）
  - 已完成任务列表 + 报告预览（内嵌 /report/:sessionId 或跳转）；SideNav 同步切换
- [ ] 10.3 通知中心
  - Topbar 铃铛接 SSE 任务完成/失败事件，下拉通知列表（一期可先浏览器通知/红点）
- [ ] 10.4 设置从 Dialog 升级为独立页（视使用频率决定优先级）

---

## 六、进度日志

- **2026-09-18**：接手分析完成；确认阶段 1–7 已交付（6 提交在 worktree 分支）；TSC/ESLint 基线实测；产出本规划文档。
- **2026-09-18**：阶段 8 完成（8.1–8.5）：删 DevKit/TaskSidebar/SensitiveDataPrompt、修 HelpDocumentPage escape、还原 pnpm-workspace；任务中心行内进度% + 导出 CSV（lib/taskCsv.ts）；规则库补「Agent 配置」只读 Tab + 「提示词集」空态 Tab（调研：后端无独立提示词端点）；趋势卡表格视图切换。验证：tsc 0 / eslint（platform）0 / vite build openSource 通过。新文件：lib/taskCsv.ts、platform/knowledge/{AgentConfigTabContent,PromptSetTabContent}.tsx。

## 七、风险与约束备忘

1. **助手保活**：任何触碰 ChatArea/AssistantDock 的改动必须保持"抽屉 CSS 开合、不条件渲染 ChatArea"
2. **前端构建链**：改动前端需 `npx vite build --mode openSource` → `frontend/dist/*` 拷至 `common/websocket/static/` → 重编 server（embed），见记忆 aig-native-deployment
3. **上游同步**：本地 dev 在 v4.6.2 之上已有私有提交，阶段 9 动 Go 后端时注意与上游 API 风格一致（Gin，`common/websocket/` 平铺注册）
4. **已知既有问题**：`common/agent/tasks_test.go` 在未改动 HEAD 上即编译失败（undefined: Model/Token/BaseUrl），与本次重构无关，跑 `go test ./...` 时需排除或先修复
