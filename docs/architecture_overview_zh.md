# AI-Infra-Guard（A.I.G）架构与底层技术实现

> 适用版本：v4.6.2（2026-09）
> 本文面向开发者，描述项目的整体架构、各模块职责、关键技术实现与数据流转。历史演进见 `docs/architecture_evolution.md`。

---

## 1. 项目定位

AI-Infra-Guard 是腾讯朱雀实验室开源的 **AI 红队评估平台**，覆盖五类检测能力：

| 能力 | 任务类型 | 实现语言 |
|------|---------|---------|
| AI 基础设施指纹识别 + CVE 漏洞检测 | `AI-Infra-Scan` | Go（纯规则引擎，无 LLM） |
| MCP Server 安全审计 | `Mcp-Scan` | Python（LLM 驱动）+ Go（`internal/mcp`） |
| LLM 越狱 / 提示注入红队评测 | `Model-Redteam-Report` / `Model-Jailbreak` | Python（DeepTeam 改造版） |
| AI Agent 工作流安全测试 | `Agent-Scan` | Python（多 Agent 测试管线） |
| Agent Skill 安全扫描 | `Skill-Scan` | Python |
| LLM API 中转/代理检测 | api-checker 服务 | Python FastAPI（agent 内）+ Go 反向代理 |

核心设计原则（继承自 `docs/architecture_evolution.md`）：
- **规则优先，LLM 增强**：确定性检测（YAML 规则）保速度与一致性，LLM 只用于复杂推理场景；
- **语言按关注点拆分**：Go 承担高并发网络探测与 Web 平台，Python 承担 LLM Agent 循环与评测框架；
- **数据即事实源**：所有检测规则以 YAML 形式存于 `data/`，不编译进二进制，支持带外更新与 CI 校验；
- **可插拔扫描引擎**：各扫描模块独立演进，通过统一的任务 API 接入。

---

## 2. 总体架构

```
┌──────────────────────────────────────────────────────────────────┐
│  浏览器 SPA (React, 嵌入 Go 二进制)                                │
│  REST API (任务/知识库/模型管理) + SSE (实时进度流)                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTP :8088
┌──────────────────────────────▼───────────────────────────────────┐
│  WebServer 容器 (Go 二进制 ai-infra-guard webserver)               │
│  ┌────────────┐  ┌──────────────┐  ┌───────────┐  ┌───────────┐  │
│  │ Gin 路由    │  │ TaskManager  │  │ SSEManager│  │ AgentMgr  │  │
│  │ /api/v1/*  │→ │ 任务生命周期   │→ │ 实时推送    │  │ WS 连接池  │  │
│  └────────────┘  └──────────────┘  └───────────┘  └─────┬─────┘  │
│  ┌──────────────────────────┐   ┌────────────────────┐  │        │
│  │ SQLite (GORM, glebarez)  │   │ api-checker 反代    │  │        │
│  │ users/sessions/messages/ │   │ → agent:8000       │  │        │
│  │ models/agents            │   └─────────┬──────────┘  │        │
│  └──────────────────────────┘             │             │WS      │
└───────────────────────────────────────────┼─────────────┼────────┘
                          Docker network    │             │ /api/v1/agents/ws
┌───────────────────────────────────────────▼─────────────▼────────┐
│  Agent 容器 (Go agent + Python 运行时)                              │
│  ┌─────────────────────────┐   ┌──────────────────────────────┐  │
│  │ Go agent (WebSocket 客户端)│  │ FastAPI api-checker :8000     │  │
│  │ 注册/心跳/任务分发         │  │ (LLM API 中转检测服务)         │  │
│  └───────────┬─────────────┘   └──────────────────────────────┘  │
│              │ subprocess (uv run / python)                       │
│  ┌───────────▼──────────────────────────────────────────────┐    │
│  │ AIG-PromptSecurity (uv)  mcp-scan (pip)  agent-scan (pip) │    │
│  │ skill-scan (uv)          chromium / nmap 运行时            │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

**两个进程角色：**
- **WebServer**（`cmd/cli/main.go` → `cmd/cli/cmd/webserver.go`）：Gin HTTP 服务，任务编排、持久化、SSE 推送、Agent 管理。前端构建产物嵌入 `common/websocket/static/`。
- **Agent**（`cmd/agent/main.go`，76 行薄壳）：通过 `AIG_SERVER` 环境变量连接服务端 WebSocket（`/api/v1/agents/ws`），注册后等待任务，本地执行 Go 扫描或拉起 Python 子进程，事件流式回传。

同一二进制（`ai-infra-guard`）通过 cobra 子命令复用：`webserver` / `scan`（纯 CLI 扫描，无需服务端）/ `api-checker`（`cmd/cli/cmd/api_checker.go`，serve|calibrate|test|detect|audit 等模式）。

---

## 3. WebServer 侧实现（Go）

### 3.1 包结构

| 包 | 职责 |
|----|------|
| `common/websocket/server.go` | Gin 路由注册、静态资源、Swagger、生命周期（~350 行路由表） |
| `common/websocket/task_manager.go` | 任务生命周期核心（1562 行），创建→分发→事件聚合→终态 |
| `common/websocket/agent.go` | `AgentManager`/`AgentConnection`：WS 握手、注册、心跳（pingPeriod 96s）、事件转发 |
| `common/websocket/sse_manager.go` | 按 sessionId 管理浏览器 SSE 连接，`SendEvent` 统一推送 |
| `common/websocket/api.go` 等 | 知识库（fingerprints/vulnerabilities/evaluations/mcp/prompt_collections/agent 配置的 CRUD + YAML 上传）、模型管理、系统更新、版本检查 |
| `pkg/database/` | GORM 模型与存储层（SQLite，驱动为纯 Go 的 `glebarez/sqlite`，免 CGO） |

### 3.2 REST API 结构（`server.go:123` 起）

```
/api/v1
├── /knowledge            # 知识库：规则 YAML 的增删改查、上传、下载
│   ├── /fingerprints | /vulnerabilities | /evaluations
│   ├── /mcp | /prompt_collections | /agent
├── /app
│   ├── /tasks            # 任务 CRUD：POST 创建、GET 列表/详情、terminate、
│   │                     # share、uploadFile/uploadChunk/mergeChunks（分片上传）
│   ├── /tasks/sse/:sessionId   # SSE 实时事件流
│   ├── /models           # LLM 模型配置 CRUD
│   └── /taskapi          # 面向程序化调用的任务 API（创建/状态/结果/上传）
├── /agents
│   └── /ws               # Agent WebSocket 接入点（agent.go:279）
├── /system               # 数据更新、版本检查
└── /version              # 版本信息
```

### 3.3 任务生命周期（`task_manager.go`）

```
POST /api/v1/app/tasks
  └→ AddTask (task_manager.go:87)
       ├─ 生成 sessionId，写 SQLite sessions 表（status=todo）
       └─ dispatchTask (task_manager.go:257)
            ├─ GetAvailableAgents() 取活跃 Agent
            ├─ round-robin 选择（atomic 计数器取模，:277）
            ├─ UpdateSessionAssignedAgent 落库
            ├─ params 增强：model_id/eval_model_id → 查 models 表
            │   组装 {model, token, base_url, limit}；agent_id → 读 YAML 配置文本
            └─ conn.WriteJSON({type:"task_assign", ...}) 下发 (:409)

Agent 执行期间（每条事件）：
  agent.go:508  AgentConnection.handleAgentEvent → taskManager.HandleAgentEvent
  task_manager.go:420 HandleAgentEvent
       ├─ shouldIgnoreAgentEvent：终态任务过滤（防迟到事件）
       ├─ handleEvent：写 task_messages 表 + SSEManager.SendEvent → 浏览器
       └─ 事件类型分派：liveStatus/planUpdate/newPlanStep/statusUpdate/
          toolUsed/actionLog/error/resultUpdate
            └─ resultUpdate → UpdateSessionStatus(done) + go cleanupTask

用户操作：
  TerminateTask (:589) → notifyAgentToTerminate + sendTerminationEvent
  DeleteTask (:748)   → 删会话 + 级联删附件文件
```

**并发模型**：WebServer 侧以 goroutine + mutex 为主——每个 WS 连接一个读写 goroutine，SSE 连接独立 goroutine 写心跳，任务事件处理是同步调用后异步落库/清理。

### 3.4 持久化模型（`pkg/database/`）

| 表 | 模型 | 说明 |
|----|------|------|
| users | `User` (task.go:36) | 用户（public_user 公共账号） |
| sessions | `Session` (task.go:46) | 一次任务 = 一条会话：task_type/params(JSON)/status(todo|doing|done|error)/assigned_agent/时间戳 |
| task_messages | `TaskMessage` (task.go:69) | 全量事件流水（type + event_data JSON），支撑前端回放与报告渲染 |
| models | `Model` (model.go:36) | 用户配置的 LLM（model_name/token/base_url/limit），OpenAI 兼容 |
| agents | `Agent` (agent.go:29) | Agent 注册信息与能力列表 |

### 3.5 实时通道

- **浏览器侧 SSE**：前端 `new EventSource('/api/v1/app/tasks/sse/${sessionId}')`（`frontend/src/components/ChatArea.tsx:936`），服务端 `SSEManager` 维护 sessionId→连接映射，写 `text/event-stream` 并周期心跳。
- **服务端↔Agent WS**：gorilla/websocket，JSON 消息 `{type, content}`。下行：`register_ack`、`task_assign`、`terminate`；上行：事件消息（见 §4.2）+ 心跳。

---

## 4. Agent 侧实现（Go）

### 4.1 连接与注册（`cmd/agent/main.go` + `common/agent/agent.go`）

1. 读 `AIG_SERVER` → 连 `ws://<server>/api/v1/agents/ws`；
2. 发送 `AgentInfo`（agent_id/hostname/ip/version/capabilities，types.go:84）注册；
3. 主循环 `processMessage`（agent.go:232）按 `baseMsg.Type` 分派：`register_resp` / `task_assign` / `terminate`；
4. 收到任务后创建 `TaskContext`（含独立 cancel 的 context），按 `task.TaskType` 匹配已注册的 taskFunc 执行；
5. 断线由容器入口脚本兜底重启（`scripts/start_agent_container.sh` 检测退出码并 retry）。

### 4.2 任务执行与回调流（`common/agent/agent.go:261-290`）

每类任务实现统一回调接口 `TaskCallbacks`，事件封装为 JSON 消息发回服务端：

| 回调 | WS 消息 type | 用途 |
|------|-------------|------|
| `ResultCallback` | `resultUpdate` | 最终结果（触发服务端置 done） |
| `NewPlanStepCallback` | `newPlanStep` | 计划步骤创建（前端时间线节点） |
| `StepStatusUpdateCallback` | `statusUpdate` | 步骤状态流转 |
| `ToolUsedCallback` | `toolUsed` | 工具/插件展示 |
| `ToolUseLogCallback` | `actionLog` | 工具输出日志 |

### 4.3 四类任务的执行方式（`common/agent/`）

| 任务 | 文件 | 执行 |
|------|------|------|
| `AI-Infra-Scan` | `tasks.go` | 纯 Go：构造 runner.Options → 调 `common/runner` 引擎，结果回调返回（tasks.go:98 起） |
| `Mcp-Scan` | `mcp_task.go` | 子进程 `uv run --no-project main.py`（mcp-scan/ 目录），逐行解析 stdout 中的 JSON 事件转为回调 |
| `Model-Redteam-Report` | `prompt_tasks.go` | 子进程 `uv run AIG-PromptSecurity/cli_run.py`，同样以 stdout JSON 流回传 |
| `Agent-Scan` | `agent_task.go` | 子进程 `python agent-scan/main.py` |
| `Skill-Scan` | `skill_task.go` | 子进程 `uv` 运行 skill-scan |

**Go↔Python 接口约定**：Python 端把阶段性事件（计划步骤、工具调用、结果）以 JSON Lines 打到 stdout，Go 侧解析后映射为 TaskCallbacks；进程退出码与最后一条 result 消息决定任务终态。模型凭据通过命令行参数/环境变量注入（来自服务端 models 表，`maskParamsToken` 在 API 返回时脱敏，task_manager.go:1539）。

### 4.4 api-checker 反向代理（`common/apichecker/proxy.go`）

前端"LLM 代理检测"页面的请求经 WebServer 以 `AIG_API_CHECKER_ROOT_PATH=/api-checker` 前缀反代到 agent 容器的 FastAPI（`AIG_API_CHECKER_URL=http://agent:8000`）。安全开关由环境变量控制：`AIG_API_CHECKER_ALLOW_HTTP`、`AIG_API_CHECKER_ALLOW_PRIVATE_TARGETS`、`AIG_API_CHECKER_MAX_JOBS`、`AIG_API_CHECKER_CORS_ORIGINS`。

---

## 5. 扫描引擎与规则 DSL（Go，核心检测能力）

### 5.1 扫描管线（`common/runner/runner.go`，737 行）

```
targets (URL/IP/CIDR/文件)
  → Runner.New (runner.go:70)
      ├─ initFingerprints (:102)：加载 data/fingerprints/*.yaml 编译为规则 AST
      ├─ initVulnerabilityDB (:674)：pkg/vulstruct.AdvisoryEngine 加载 data/vuln(_en)/
      └─ processTargetList (:175)：hybrid.HybridMap 磁盘支撑的目标去重存储
  → RunEnumeration (:419)
      ├─ wg := sizedwaitgroup.New(Options.RateLimit)   # 全局并发闸门
      ├─ 每 target 一个 goroutine：
      │    extractContent (:278)：发 HTTP 探测，收集 body/header/title/server
      │    favicon hash 计算、重定向跟随（pkg/httpx：代理/重试/编码检测）
      │    RunFpReqs：对每目标并发 10 路指纹规则探测
      └─ 指纹命中 → 提取版本 → AdvisoryEngine.GetAdvisories(product, version)
           → CalcSecScore (:702) 汇总安全评分 → 结果回调/输出文件
```

**CVE 匹配是"指纹+版本比对"，不发主动攻击流量**——从响应中用正则 extractor 提取版本号，再与漏洞规则的范围表达式求值，误报率低且无侵入。

### 5.2 指纹规则 DSL（`common/fingerprints/parser/`）

规则文件格式（`data/fingerprints/ollama.yaml`）：

```yaml
info: {name, author, severity, desc, metadata: {product, vendor}}
http:                                  # 探测请求组
  - method: GET
    path: '/'
    matchers:
      - body="Ollama is running"       # 表达式语言
version:                               # 版本提取
  - method: GET
    path: '/api/version'
    extractor: {part: body, regex: '{"version":"(\d+\.\d+\.?\d+?)"}', group: 1}
```

**表达式语言实现**：手写词法/语法分析器——
- `token.go`：词法单元（dslExp / 逻辑符 / 括号）；
- `synax.go`：递归下降解析 `parseExpr`/`parsePrimaryExpr`（synax.go:92）生成 AST（`Rule`），支持 `&&`、`||`、括号组合；
- 操作数形式 `key op value`：`body=`、`header=`、`title=` 等响应字段匹配，支持正则与 hash 匹配（`hashUsage`，synax.go:396）；
- `parser.go:171 Eval(config, dsl)`：对响应对象求值；`AdvisoryEval`（synax.go:316）供漏洞规则复用同一求值器。

### 5.3 漏洞规则引擎（`pkg/vulstruct/`）

规则文件（`data/vuln/<product>/CVE-*.yaml`）：

```yaml
info: {name, cve, summary, details, cvss, severity, security_advise, references}
rule: version < "0.1.169"        # 版本范围表达式
```

- `advisory.go:39 AdvisoryEngine`：`LoadFromDirectory` 按产品目录加载全部规则；`GetAdvisories(packageName, version, isInternal)` 用 `hashicorp/go-version` 对 rule 表达式求值，返回命中的 `VersionVul` 列表；
- 中英文两套规则目录（`data/vuln/`、`data/vuln_en/`），按任务语言参数选择；
- 规则变更用 `go run cmd/yamlcheck/main.go` 做 CI 校验（语法 + 字段完整性）。

### 5.4 规模统计

| 目录 | 文件数 | 内容 |
|------|--------|------|
| `data/fingerprints/` | 154 | AI 组件指纹（Ollama、vLLM、Dify、Gradio、ComfyUI 等） |
| `data/vuln/` | 2169 | 中文 CVE/GHSA 规则（按产品分目录） |
| `data/vuln_en/` | 2169 | 英文版 |
| `data/eval/` | 17 | 越狱评测数据集（AdvBench、SafeBench、JailBench、JADE、CN-Safe 等） |
| `data/mcp/` | 15 | MCP 静态审计插件规则（命令注入、硬编码密钥、路径穿越、提示注入、CORS 等） |

---

## 6. Python 子项目

均以独立 venv（uv 或 pip）运行，由 Go agent 以子进程调用。

### 6.1 AIG-PromptSecurity —— LLM 越狱红队评测

- 基于 **DeepTeam** 二次开发（`AIG-PromptSecurity/deepteam/`），入口 `cli_run.py`（159 行）；
- **攻击库**：`deepteam/attacks/single_turn/`（28 种：encoding、roleplay、deep_inception、past_tense、multilingual、prompt_injection、stego 等）+ `multi_turn/`（9 种：Crescendo、PAIR、GOTE/GOAT、Bad Likert Judge、many-shot、actor_attack 等）；
- **流程**：加载 `data/eval/*.json` 风险数据集 → 按 attack simulator 变异出攻击提示 → 发给目标模型 → `metrics/` 评判（LLM-as-judge）→ 输出风险评分与用例报告；
- 依赖：deepeval、openai（OpenAI 兼容 API）、pandas 等（`pyproject.toml`）；
- Go 侧 `strategy_map.json`（Dockerfile 中预置到 `/app/AIG-PromptSecurity/utils/`）维护策略映射。

### 6.2 agent-scan —— Agent 工作流安全测试

- 包 `agent_scan/`：`core/`（agent 抽象 + `agent_adapter/` 适配 Dify/Coze 等平台）、`tools/`（工具注册表 `registry.py` + `dispatcher.py`，含 batch/dialogue/task/thinking/skill 工具族）、`prompt/`；
- 多 Agent 测试管线：解析目标 Agent 配置（YAML，来自知识库 agent_configs）→ 构造测试 Agent 与被测 Agent 对话 → 执行间接提示注入、SSRF、系统提示泄露等用例 → `core/report/` 生成报告；
- 目标平台接入方式与用例见 `agent-scan/feature.md`、`providers.yaml`。

### 6.3 mcp-scan —— MCP Server 安全扫描

- 包 `mcp_scan/`：`agent/`（审计 Agent）、`tools/`、`prompt/`、`redteam/`；
- **三阶段扫描**：连接目标 MCP Server（stdio 命令 / URL / SSE / streamable）枚举 tools与resources → 静态规则初筛（复用 `data/mcp/*.yaml` 的检测逻辑）→ LLM 逐项审计判定真实风险；
- 依赖 `mcp==2.0.0`（官方 MCP SDK）+ openai。

### 6.4 skill-scan

与 mcp-scan 结构同源（`skill_scan/` 包，uv 管理），面向 Agent Skill（如 Claude Skills 格式）的静态 + LLM 审计。

### 6.5 services/api_checker —— LLM API 中转检测服务

- FastAPI 单体（`server.py`，~2000 行），部署在 **agent 容器** 内监听 8000；
- 端点：`/healthz`、`/api/v1/relay/models`、`/api/v1/relay/check/stream`（SSE）等；
- 用途：判定一个 OpenAI 兼容 API 端点是否为"中转/代理"（检测响应特征、延迟指纹、模型真伪），算法在 `algorithms/`、`pamela/`、`ventor_qtest/` 子模块，基线数据 `baselines.json`；
- WebServer 通过 Go 反代暴露给前端"LLM 代理检测"页面。

### 6.6 Go 侧 MCP 审计（`internal/mcp/`）

独立的 Go 实现：基于 `mark3labs/mcp-go` 客户端连接 MCP Server（`scanner.go:187` InputCommand / `:199` InputUrl / `:223` InputSSELink / `:250` InputCodePath），加载 `data/mcp/*.yaml` 插件做规则检测，并用 OpenAI 兼容 LLM（`common/utils/models/openai.go`）复核。CLI 的 `mcp` 子命令与部分服务端流程使用。

---

## 7. 前端（React SPA）

| 维度 | 选型 |
|------|------|
| 框架 | React 18 + TypeScript + Vite（`frontend/vite.config.ts`） |
| UI | Tailwind CSS + Radix UI（shadcn 风格组件，`src/components/ui/`）、lucide 图标、framer-motion 动效 |
| 路由 | react-router-dom v6（`src/components/App.tsx:322`）：`/` 主界面、`/report/:sessionId` 报告页、`/poison-detect` LLM 代理检测、`/help` 文档页 |
| 状态 | React Context（`src/context/AppContext.tsx`）+ hooks，无全局状态库 |
| 实时 | EventSource（SSE）驱动对话式任务时间线 |
| 国际化 | i18next + 语言检测（中/英） |
| 图表/报告 | recharts、d3（雷达图 `detailPanel/RadarChart.tsx`）、jspdf + html2canvas + react-to-print（前端生成 PDF 报告） |

**界面形态**：聊天式交互——左侧任务列表（`TaskSidebar`），中部对话区（`ChatArea`：任务创建、确认、执行时间线 `TaskExecutionTimeline`/`StepCard`），右侧/下钻结果面板（`detailPanel/` 按 4 类任务各有专属 DetailPanel）。知识库管理（`management/`）提供指纹/漏洞/评测/MCP/Agent 配置的表格 + YAML 编辑/上传（`YamlEditDialog`/`YamlUploadDialog`）。

**构建模式**：`pnpm build --mode openSource`（开源版）与 `build:internal`（内部版，`config/privateModules.tsx` 注入私有路由/功能），产物为静态文件由 Go embed。

---

## 8. 部署拓扑

### 8.1 Compose 服务

`docker-compose.yml`（源码构建）/ `docker-compose.images.yml`（预构建镜像 `zhuquelab/aig-server` + `zhuquelab/aig-agent`）：

| 服务 | 镜像基础 | 端口 | 要点 |
|------|---------|------|------|
| webserver | 三阶段 Dockerfile：node:22-alpine（pnpm 构建前端）→ golang:1.23-alpine（CGO_ENABLED=0 编译）→ python:3.12-alpine（运行时 + uv + agent-scan venv） | 8088 | `start.sh` 初始化目录后 `exec ai-infra-guard webserver`；healthcheck curl :8088 |
| agent | golang:1.23-alpine 编译 → python:3.12-slim（chromium、nmap、中文字体、gosu；uv 装 AIG-PromptSecurity/skill-scan，pip 装 mcp-scan/agent-scan，独立 venv 装 api-checker） | 8000（内网） | `cap_add: SYS_ADMIN` + `seccomp:unconfined`（chromium 沙箱需要）、`shm_size: 2g`；非 root 用户 agent(uid 1000) 运行 |

- **网络**：自定义 bridge `ai-infra-guard-network`；agent 通过 `AIG_SERVER=webserver:8088` 回连。
- **卷挂载**：`./data→/app/data`（规则热更新共享）、`./db`、`./logs`、`./uploads`、命名卷 `api-checker-data`。
- **启动顺序**：webserver 依赖 agent healthy（healthcheck 探测 FastAPI /healthz）。
- **配置**：日志由 `trpc_go.yaml` 控制（tRPC-Go 日志插件，滚动写 `logs/trpc.log`）；时区/路径经 `TZ`/`DB_PATH`/`UPLOAD_DIR`/`APP_ENV` 注入。

### 8.2 非 Docker 运行

```bash
CGO_ENABLED=0 go build -o ai-infra-guard ./cmd/cli/main.go
./ai-infra-guard webserver --server 127.0.0.1:8088      # 平台模式
./ai-infra-guard scan -t http://target:port --fps data/fingerprints --vul data/vuln  # 纯 CLI
AIG_SERVER=localhost:8088 ./agent                        # 独立 agent
```

---

## 9. 关键技术依赖

| 层 | 依赖 | 用途 |
|----|------|------|
| Web | gin、gorilla/websocket | HTTP/WS 服务 |
| 存储 | glebarez/sqlite（纯 Go SQLite）、gorm | 免 CGO 单二进制持久化 |
| 网络 | projectdiscovery/fastdialer、rawhttp、retryablehttp-go、hmap；pkg/httpx（自研封装） | 高并发探测、原始请求、重试、编码检测 |
| 指纹 | PuerkitoBio/goquery（HTML 解析）、hashicorp/go-version | 内容匹配与版本比较 |
| MCP | mark3labs/mcp-go | MCP 客户端/服务端协议 |
| LLM | openai/openai-go（Go）、openai（Python） | 全部 OpenAI 兼容接口，模型凭据用户自配 |
| Python | deepeval（评测底座）、mcp 2.0、fastapi/uvicorn、chromium（headless 浏览器）、nmap | 评测/扫描/动态验证 |
| 构建 | cobra（CLI）、embed（前端静态资源）、uv | — |

---

## 10. 扩展点速查

| 想做的事 | 位置 | 步骤 |
|---------|------|------|
| 加指纹规则 | `data/fingerprints/*.yaml` | 按 §5.2 格式编写 → `go run cmd/yamlcheck/main.go` 校验 |
| 加 CVE 规则 | `data/vuln/<product>/CVE-xxx.yaml` | info + `rule: version <op> "<ver>"` |
| 加 MCP 审计插件 | `data/mcp/*.yaml` | 参照现有插件字段；Go/Python 两侧共用 |
| 加越狱攻击策略 | `AIG-PromptSecurity/deepteam/attacks/single_turn/` | 实现 BaseAttack 子类并注册 |
| 加新任务类型 | `common/agent/types.go` 常量 + 新 taskFunc + `task_manager.go` 前端类型 | 实现 GetName/Execute + TaskCallbacks |
| 接入新 LLM | 平台"模型管理"页 | 只需 OpenAI 兼容 base_url + token，无需改码 |
