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

## 四、阶段 9 — 后端平台化配套（Go）✅ 2026-09-18 完成

- [x] 9.1 `GET /api/v1/dashboard/summary`（新增 `common/websocket/dashboard_api.go`，路由注册于 server.go `/dashboard` 组）
  - 返回：KPI（score 均值/pendingRisks/coveredAssets 去重目标/jailbreakPassRate=1-攻破率）+ 按日按类型趋势 + 严重度分布 + topTargets + recentFindings + coverage 口径说明
  - 数据源：sessions + task_messages 最后一条 resultUpdate（parseResultUpdateRisk 兼容两种存储形状：task_messages 顶层 {result} 与 SSE 嵌套 {event:{result}}）
  - 无数据支撑的指标（assetDomain/scoreDist/topComponents）coverage=false，前端显示空态说明而非 mock
- [x] 9.2 `buildTaskSummary` 扩展（task_manager.go）
  - 新增 assignedAgent/riskCount/score/progress 字段（nullable）；`enrichTaskSummary` 按任务状态取 resultUpdate（done→评分/风险）或 planUpdate（doing→plan 完成比）；三个列表入口（GetUserTasks/GetUserTasksByType/SearchUserTasksSimple）全部接线
- [x] 9.3 任务列表服务端分页 + 过滤
  - SimpleSearchParams 增 Status；SearchUserSessionsSimple 增 status WHERE；HandleGetTaskList 支持 page/pageSize/status（有 q 或 status 时走分页搜索并返回 total）；无参数时保持旧行为（全量，向后兼容助手旧链路）
  - 新增 SearchUserTasksSimplePaged 返回 total
- [x] 9.4 修复 prompt_collections DELETE 路由 bug：DELETE("")→DELETE("/:id")（live 实测 created→deleted→total 0 通过）；前端解除删除禁用，补删除确认对话框
- [x] 9.5 前端切换
  - 新增 `lib/dashboardApi.ts`；useDashboardData 重写为真实 API（isLoading/error/unsupported 状态，删 mock 依赖；mock/dashboard.ts 保留未删——TrendChartCard 等旧 mock 消费链已断开）
  - DashboardPage：真数据 KPI（score=null 显示 '—'）、TopRiskTargets 卡（真实 riskCount）、评分分布/组件识别两张空态说明卡、Model-Redteam 类型筛选、资产域"待接入"徽章
  - TaskCenter：riskCount/score/agentNode 列点亮（10s 轮询 fetchTaskSummaries 取扩展字段，progress 优先后端）；CSV 导出含新字段
- [x] 9.6 验证
  - `go build ./...` 0 错误；`go vet` 通过；`go test ./pkg/database/...` ok（common/utils TestFaviconHash、runner/fingerprints 数据路径类失败为既有问题，unmodified HEAD 复现一致）
  - 二进制重建（含新前端 embed，hash main-tLFa1Glo.js）→ 替换 fluffy worktree bin → live server 重启（PID 随机，端口 8088）
  - live 验证：dashboard summary 返回真实聚合（12 样本均分 68.7 / 6 风险 / 通过率 100% / 2 目标 / 趋势 2 天）；任务列表新字段生效（risk:0 score:100 agent:test_id）；status=done→12 条精确过滤；q+分页 total 正确；0 命中→total 0；prompt_collections DELETE 通；任务详情/knowledge 回归正常
  - 修复过程中发现的 bug：① event_data 存储形状与 SSE 不同（顶层 result vs event.result）→ parseResultUpdateRisk 双兼容；② status 过滤只在有 q 时生效 → 分支条件改 q||status

## 五、阶段 10 — 二期能力页 ✅ 2026-09-18 完成

- [x] 10.1 越狱评测独立页 `/jailbreak`（`pages/JailbreakPage.tsx` + `lib/jailbreakApi.ts`）
  - 数据层：fetchJailbreakStats —— 从 Model-Redteam-Report 任务详情 resultUpdate 解析 content[0]（score/total/jailbreak/extraBody.attackMethodResults），params 提取 target/datasets/techniques；同名攻击方法聚合
  - 页面：4 KPI（聚合通过率/累计测试/攻破次数/任务数）+ 攻击方法对抗统计表 + 历史评测对比表（点击行→/report/:sessionId）
  - SideNav「越狱评测」从任务预筛选切换为独立路由；Topbar 面包屑新增
- [x] 10.2 报告中心独立页 `/reports`（`pages/ReportsPage.tsx`）
  - 数据源：GET /app/tasks?status=done&pageSize=999（阶段 9 服务端过滤）+ 类型 FilterChips + 搜索
  - 列：任务/类型/风险/评分/状态（复用阶段 9 扩展字段）；点击行→既有 /report/:sessionId 分享报告路由（不重复实现渲染）
  - SideNav「报告中心」同步切换；面包屑新增
- [x] 10.3 通知中心（`components/platform/NotificationBell.tsx`）
  - 数据源：AppContext 已有的 window taskStatusChanged CustomEvent（detail: taskId/taskTitle/oldStatus/newStatus/timestamp）——真实事件流，不伪造历史
  - 未读红点计数 + 下拉列表（状态图标/时间/跳转：completed→报告页，其余→任务中心）+ 全部已读/清空
  - 持久化 sessionStorage（后端无通知表，不伪装跨会话历史——已注释说明）
- [x] 10.4 验证：tsc 0 / eslint 0 / vite build 8.7s → embed → 二进制重建 → live 重启；冒烟 /jailbreak /reports /tasks / 全 200；reports 数据端点 5 条 done 任务正常
- 10.4（设置独立页）按原计划视优先级顺延，不在本轮

## 五点五、阶段 8.6 — 同步 dev 最新改动 + 按「后端实际接口」校准前端（2026-09-18 启动）

> 用户要求：根据最新 dev 分支改动 + 后端真实功能/接口设计和开发前端 UI；后端未实现的功能可用 mock 但必须标记；**不能随意新增**（无后端支撑的能力不做）。流程 = 先测试 → 开发 → 再测试，全程记录。

### dev 新增改动（79505869..a1939935，2 个实质提交）

| 提交 | 内容 | 前端落点 |
|------|------|----------|
| `2117560a` | 终止任务时杀死整个进程组（Python 孙进程泄漏修复） | 纯后端，无前端 API 变化 |
| `ac3053a6` | 任务结束后执行控制台仍可达：ChatArea 头部新增 Terminal 按钮（任意状态可开控制台）；ScanProgressConsole 加 onBack；consoleOpen 状态管理 | **需要合并进平台分支**：App.tsx（冲突）、ChatArea.tsx（自动）、ScanProgressConsole.tsx（自动）、i18n（自动） |

### 后端接口实测盘点（对 127.0.0.1:8088 live server 验证，dev 与本分支后端一致）

**已实现（前端可直接对接）：**
- `GET /api/v1/app/tasks` — 列表：sessionId/title/taskType/status/createdAt/updatedAt/completedAt/source；支持 `?q=&taskType=`（服务端搜索已存在！SimpleSearchParams.page/pageSize 但 handler 写死 999）
- `GET /api/v1/app/tasks/:id` — 详情：含 messages 全量回放（planUpdate/newPlanStep/statusUpdate/toolUsed/actionLog/messageTrace/resultUpdate）
- 任务终止/删除/改名/分享/SSE/三段上传 — 已接
- `GET /api/v1/knowledge/{fingerprints:154, vulnerabilities:2169, evaluations:17, mcp:15}` — 分页 ok
- `GET /api/v1/knowledge/prompt_collections` — **存在端点**（PromptCollection: id/product/prompt/model_version/capabilities…），当前数据 0 条；前端可做真实 CRUD 列表页（非 mock）
- `GET /api/v1/knowledge/agent/names`、`/app/models` CRUD、`/system/update-data`、`/version` — 已接/可用

**未实现（前端 mock + 明确标记）：**
- `GET /dashboard/summary` — 不存在（前端 USE_MOCK=true + 「演示数据」徽章已有）
- 任务列表 riskCount/score/agentNode/progress 字段 — buildTaskSummary 无（表格 '—' + 本地 plan 推导）
- Agent 节点 REST 列表 — 仅 /agents/ws WebSocket，GetAvailableAgents 未暴露 HTTP；Agent 页继续用配置清单口径
- 服务端分页过滤 — handler 硬编码 page=1&pageSize=999；前端保持客户端分页

### 8.6 执行清单（先测试 → 开发 → 再测试）

- [x] 8.6.0 **测试基线（先测试）**：合并前 tsc/eslint/build 全绿确认；live API 探测记录（上表）
- [x] 8.6.1 **合并 dev**：git merge dev；解 App.tsx 冲突（保留 PlatformApp 结构 + 移植 consoleOpen 逻辑到 TaskDetailPane/AssistantDock 控制台）；验证 tsc/eslint/build
- [x] 8.6.2 **控制台可达性移植到平台 UI**：dev 的「任务结束仍可开控制台」能力在平台层的等价实现 = TaskDetailPane 加「执行控制台」入口（任意状态）+ ScanProgressConsole onBack 返回
- [x] 8.6.3 **提示词集 Tab 接真实 API**：上一版做空态是误判——后端有 /knowledge/prompt_collections（含 CRUD）；改为真实列表（数据为空时展示真实空态 + 新建入口指向集合字段说明），**删除 mock 性质说明**
- [x] 8.6.4 **任务列表接服务端搜索**：fetchTaskSummaries 已支持 q/taskType 透传 → TaskCenter 搜索框接入（300ms debounce），筛选仍客户端（后端无 status 过滤）
- [x] 8.6.5 **再测试**：tsc + eslint + vite build；live server 冒烟（页面路径 + 关键交互）；文档勾选 + 进度日志 + 提交


## 六、进度日志

- **2026-09-18**：接手分析完成；确认阶段 1–7 已交付（6 提交在 worktree 分支）；TSC/ESLint 基线实测；产出本规划文档。
- **2026-09-18**：用户下达 8.6 任务（按 dev + 真实接口校准，mock 须标记，不得随意新增，测试→开发→测试）。dev 新增=控制台结束后可达+进程组终止（均无新 API）；live 实测确认 prompt_collections 端点存在（0 条数据）——8.3 的「提示词集空态」需改为真实对接。规划见「五点五」章节。
- **2026-09-18**：阶段 8 完成（8.1–8.5）：删 DevKit/TaskSidebar/SensitiveDataPrompt、修 HelpDocumentPage escape、还原 pnpm-workspace；任务中心行内进度% + 导出 CSV（lib/taskCsv.ts）；规则库补「Agent 配置」只读 Tab + 「提示词集」空态 Tab（调研：后端无独立提示词端点）；趋势卡表格视图切换。验证：tsc 0 / eslint（platform）0 / vite build openSource 通过。新文件：lib/taskCsv.ts、platform/knowledge/{AgentConfigTabContent,PromptSetTabContent}.tsx。

- **2026-09-18**：阶段 8.6 完成：
  - 8.6.1 合并 dev（71f11dd8）：App.tsx 冲突按 PlatformApp 结构解决；ChatArea 的 Terminal 按钮 + ScanProgressConsole.onBack + i18n 自动并入
  - 8.6.2 平台层控制台可达：TaskDetailPanel 增 consoleOpen/onConsoleOpenChange（dev consoleVisible 语义组件化）；TaskDetailPane 头部加 Terminal 切换按钮（任意状态可开控制台，含已结束任务）；AssistantDock 的 ChatArea onOpenConsole 接通（控制台浮层模式，任务切换自动关闭）
  - 8.6.3 提示词集接真实 API：live 实测 /knowledge/prompt_collections 存在（GET 全量列表/POST/PUT 可用）；PromptSetTabContent 重写为真实 CRUD（列表+搜索+详情查看+新建表单，字段 id/product/prompt/model_version/capabilities）；发现并标注上游 DELETE 路由 bug（DELETE "" 无 :id 而 HandleDelete 读 Param → 恒 400），删除按钮禁用并显示警告徽章；统计卡新增「提示词集」（useKnowledgeTotals 增 promptCollectionCount）
  - 8.6.4 任务中心搜索接服务端：300ms debounce → fetchTaskSummaries({q}) → 命中集合并入客户端筛选；修复后端 0 命中时 tasks:null 导致搜索失效的边界（fetchTaskSummaries 归一化 ?? []）
  - 8.6.5 再测试：tsc 0 / eslint(platform+改动文件) 0 / vite build openSource 4.7s 通过；vite preview 冒烟：/ /tasks /scan /knowledge /agents /help 全 200、API 代理透传正常、live q=体检 命中 6 条验证通过
  - 测试中发现的待办（后端）：prompt_collections DELETE 路由 bug、服务端分页仍硬编码 999（阶段 9 处理）

- **2026-09-18**：阶段 9 完成（后端聚合端点 + 列表扩展 + 分页 + DELETE bug 修复 + 前端全量切换真数据）。提交 = 阶段 9 系列。live server 已运行新二进制（含新前端 embed）。Dashboard 不再有任何 mock 数据消费（mock/dashboard.ts 已无引用方，保留文件待阶段 10 决定去留）。

- **2026-09-18**：阶段 10 完成（越狱评测页 + 报告中心 + 通知中心）。SideNav 两项从预筛选升级为独立页；Topbar 铃铛接真实任务状态事件。设计稿对应屏幕全部落地（除设置页顺延）。提交 = 阶段 10 系列；二进制已 embed 重建并重启（前端 hash main-_cWFh_Kr.js）。

- **2026-09-18**：检测能力区扩容至 7 类（提交 3f52c975，用户明确"不拘泥设计稿"）：任务型 5 类（AI基础设施扫描/MCP扫描/Skill扫描/Agent扫描/大模型安全体检）保持 NewScanPage 表单流；新增平台级 2 项——大模型API投毒检测（页内 /poison-detect，LLMProxyDetectPage 既有实现；后端 relay 代理需 --api-checker-url 指向 checker 服务，当前部署传空=禁用，页可开但检测会失败，已向用户说明）+ AI 安全技能市场（外链 matrix.tencent.com/skill-market，与旧工作台按钮同目标）。SideNav/CommandSearch/新建扫描页左列三处入口同步。

- **2026-09-18**：菜单结构按用户澄清重构（提交 22469f65）：①7 类能力统一为平台级能力体系——5 类任务扫描（Agent/Skill/MCP/体检/AI基础设施）统一走「新建扫描」，与投毒检测/技能市场平级；②越狱评测=大模型安全体检的组成部分，删除独立菜单项；/jailbreak 页面保留作为体检任务的评测分析视图，入口=报告中心页头「越狱评测分析」按钮+面包屑，页标题改为「大模型安全体检 · 越狱评测」。已部署（main-BPXhliQ8.js）。

- **2026-09-18**：SideNav 检测能力区按用户需求重构（提交 12274065）：5 类扫描（Agent/Skill/MCP/大模型安全体检/AI基础设施）各自成为独立菜单项，点击进入 /scan/{agent,skill,mcp,redteam,infra} 类型任务视图页（ScanTypePage：KPI 指标行=累计任务/平均评分/风险发现/已完成+14 天 sparkline、状态筛选 chips 带计数、任务表=类型/Agent节点/状态进度/风险/评分，点行跳报告）。「新建扫描」不再占 SideNav（Topbar 右上角 CTA 已有），表单页保留由 CTA 与各类型页「新建此类扫描」进入。已部署 main-WKR6yyiu.js。

- **2026-09-18**：统一任务详情页上线（提交 2cfeab03）：新路由 /task/:sessionId，4 Tab 审计视图——控制台（执行计划+ScanProgressConsole 执行流）/ 受测对象往来通信（TraceStreamView，traceId 配对请求响应）/ 模型往来通信（ModelCommView 从 actionLog 提取 LLM JSON 按 stage 分组；体检任务含「扫描驱动模型/评估模型」子 Tab，评估模型子 Tab 为诚实空态——引擎不单独记录 eval trace，判定结果在报告 Tab）/ 报告（5 类 DetailPanel）。所有列表行点击（类型页/报告中心/通知）改跳此页；/report/:sessionId 保留为分享轻视图，详情页头部一键直达。已部署 main-Bpe2O7oJ.js。

- **2026-09-18**：修复任务详情页超出视口高度问题（提交 b492242a）：根因=平台壳主内容包装器无高度约束，详情页 h-full 失效、内容自然撑开导致双滚动条。方案=PlatformShell 新增 ShellModeContext，子路由可声明"满高壳"模式（main 切 overflow-hidden、包装器 h-full flex）；TaskDetailPage 挂载时声明、卸载还原（其他页面不受影响）；页内各 Tab 收紧为 flex-1 min-h-0 overflow-hidden，控制台 Tab 执行计划区最高 40% 自滚动。已部署 main-BrDoX7DK.js。

- **2026-09-18**：新建扫描三问题修复（提交 efe3f66a）：①Agent扫描表单补「扫描类型」技能子集选择（10 项 chip + 全部按钮，空选=全量，走既有 params.skills → --skills 链路）；②发起扫描后立即跳 /task/:sessionId 统一详情页；③详情页"未正常渲染"根因=静态服务无 Cache-Control，浏览器启发式缓存旧 index.html 引用已清理的旧 hash bundle → 修复：index.html no-cache、hash 资源 immutable 一年缓存、其余 no-cache。Playwright zh-CN 实测：技能 chips 可交互、详情页 4 Tab 全渲染 0 JS 错误、缓存头 live 生效。

- **2026-09-18**：用户复报两问题，根因定位修复（提交 1c291e18）：①"e.messages is not iterable"= Go GetTaskDetail 的 messageList 为 nil slice 序列化成 JSON null，刚创建无事件的任务必触发 → 后端 make(...,0) + 前端 3 处 for..of 兜底 ?? []；②"发起扫描没跳详情"= 跳转逻辑本就在 status===0 分支内，但首次提交的保存模板 window.prompt 模态弹窗先于 navigate 阻塞了跳转观感，且失败路径（agent 未连 SSE 超时）只有裸错误 toast → navigate 提前、模板询问移到跳转后、失败 toast 附 agent 连接指引。Playwright 复测：不存在任务→错误态不崩溃，真实任务 4 Tab 正常，iterable 错误消除。

- **2026-09-20**：提示词集 Tab 崩溃修复（提交 1f1e7e78）：根因链 = ①Go filepath.WalkDir 对软链 root 用 Lstat 语义（data/prompt_collections 是指向主仓库的软链）→ root 被当文件处理 → loadFile 返回 (nil,nil)；②HandleList 无条件 append nil 且 nil slice 序列化为 {"items":[null]}；③前端 rowKey 读 null.id 崩。修复：后端跳过 nil 项 + make 空数组（惠及全部 4 类知识库 Tab）；前端过滤无效行；补建主仓库缺失的 data/prompt_collections 目录（软链此前悬空）。Playwright 验证 /knowledge?tab=prompts 零错误渲染。

- **2026-09-20**：新建体检表单 Tooltip 崩溃修复：AttackMethodSelector 依赖调用方提供 TooltipProvider（旧 UI 在 ChatArea 内有全局 Provider，平台 ScanForm 没有）→ 组件自带 Provider 自包含化（旧路径双层 Provider 无害）。Playwright 验证体检/Agent 两类表单零 JS 错误。

- **2026-09-20**：体检表单补评测目标入口（提交 6fd03e26）：ScanForm 新增「评测目标」块——模型 API / Agent 互斥切换（默认模型 API，与旧 UI 语义一致）；选 Agent 时渲染被测 Agent 下拉（/knowledge/agent/names，加载 effect 扩至体检共用）+ 必选校验 + 管理入口提示；selectedTargetAgent 仅在 Agent 模式下发 → params.target_agent_id → 后端 prompt_tasks 走路径B（target_agent 优先于 model_id）。Playwright 验证切换/下拉/校验全渲染，0 JS 错误。

- **2026-09-20**：体检任务"蒸发"重大 bug 修复（提交 33c8db69）：根因链 = agent 未连接时 AddTask 预存 session（doing）后阻塞 100s 等 SSE → 超时 cleanupFailedTask **物理删除 DB 行** → 用户看到"运行中 0/0"→任务彻底消失→详情"任务不存在"。修复：①cleanupFailedTask 改为标记 error + content 写失败说明（agent 未连接请先启动），物理删除仅作为未落库时的兜底；②ScanForm 提交按钮显示"正在创建任务…最长约 100 秒"实时反馈。端到端复现验证：等待期列表可见（doing）→ 超时后 status=error + 详情 200 带说明 → 不再蒸发。另注：0/0 显示是 detail 的 plan 空数组所致，属失败任务的自然表现。

## 七、风险与约束备忘

1. **助手保活**：任何触碰 ChatArea/AssistantDock 的改动必须保持"抽屉 CSS 开合、不条件渲染 ChatArea"
2. **前端构建链**：改动前端需 `npx vite build --mode openSource` → `frontend/dist/*` 拷至 `common/websocket/static/` → 重编 server（embed），见记忆 aig-native-deployment
3. **上游同步**：本地 dev 在 v4.6.2 之上已有私有提交，阶段 9 动 Go 后端时注意与上游 API 风格一致（Gin，`common/websocket/` 平铺注册）
4. **已知既有问题**：`common/agent/tasks_test.go` 在未改动 HEAD 上即编译失败（undefined: Model/Token/BaseUrl），与本次重构无关，跑 `go test ./...` 时需排除或先修复
