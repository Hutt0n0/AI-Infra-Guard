package websocket

// Dashboard 聚合端点 — /api/v1/dashboard/summary
//
// 数据口径（全部来自真实数据，无法得出的指标返回 null 并在 coverage 中说明）：
//   kpis.score          综合安全评分 = 已完成任务的 score 字段均值（Agent-Scan results.score /
//                       Model-Redteam-Report content[0].score）；无评分任务时为 null
//   kpis.pendingRisks   待处置风险 = 已完成任务 result 的漏洞计数之和（Agent-Scan vulnerable_tests；
//                       Redteam 以 jailbreak 数计），当前无"处置状态"概念，全部计为待处置
//   kpis.coveredAssets  覆盖资产 = 出现过的不同目标数（Agent-Scan agent_id / Redteam target_agent_id/
//                       model_id 去重）；无历史趋势对比，delta 固定 null
//   kpis.jailbreakPassRate 越狱通过率 = 1 - 攻破率：Σ(score)/Σ(baseTotal*100)（content[0] 口径）；
//                       无体检任务时为 null
//   trend               按日按任务类型的漏洞数趋势（仅既有数据窗口）
//   severity            严重度分布（Agent-Scan risk_type → high/medium；Redteam jailbreak>0 → critical）
//   recentFindings      最新完成任务的风险发现列表（results[].description / jailbreak 记录）
//   topTargets          按风险数排序的目标列表
//   coverage            各指标的数据覆盖说明（前端可展示数据口径）

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

// resultUpdate 事件中 result 字段的两种形状（按任务类型）：
//   Agent-Scan:      {score, total_tests, vulnerable_tests, risk_type, results: [{description,...}]}
//   Redteam-Report:  {content: [{score, total, baseTotal, jailbreak, modelName, extraBody}]}

type taskRiskStats struct {
	Score      float64 // 最近一次评分（0 = 无）
	HasScore   bool
	RiskCount  int
	TargetRefs []string // 目标引用（agent_id / target_agent_id / model_id）
	RiskType   string   // Agent-Scan risk_type
	Jailbreak  int
	Total      int
}

// parseResultUpdateRisk 从 resultUpdate 事件 JSON 提取风险统计。
// 兼容两种存储形状：task_messages.event_data 顶层即事件体（{type,result,...}），
// SSE 推送形状为 {event:{result}}。两者都取 event.result / 顶层 result。
func parseResultUpdateRisk(eventData []byte, taskType string) *taskRiskStats {
	// 优先顶层 result（task_messages 存储形状），回退 event.result（SSE 形状）
	var topLevel struct {
		Result json.RawMessage `json:"result"`
		Event  struct {
			Result json.RawMessage `json:"result"`
		} `json:"event"`
	}
	if err := json.Unmarshal(eventData, &topLevel); err != nil {
		return nil
	}
	rawResult := topLevel.Result
	if len(rawResult) == 0 {
		rawResult = topLevel.Event.Result
	}
	if len(rawResult) == 0 {
		return nil
	}
	stats := &taskRiskStats{}

	// Agent-Scan / 其他：扁平结果对象
	var flat struct {
		Score           *float64        `json:"score"`
		VulnerableTests *int            `json:"vulnerable_tests"`
		RiskType        string          `json:"risk_type"`
		Results         json.RawMessage `json:"results"`
	}
	if err := json.Unmarshal(rawResult, &flat); err == nil {
		if flat.Score != nil {
			stats.Score = *flat.Score
			stats.HasScore = true
		}
		if flat.VulnerableTests != nil {
			stats.RiskCount = *flat.VulnerableTests
		}
		stats.RiskType = flat.RiskType
	}

	// Redteam-Report：content 数组形状（优先判定）
	var wrapped struct {
		Content []struct {
			Score      *float64 `json:"score"`
			Total      int      `json:"total"`
			BaseTotal  int      `json:"baseTotal"`
			Jailbreak  int      `json:"jailbreak"`
			ModelName  string   `json:"modelName"`
			ExtraBody  struct {
				VulnerabilityResults []struct {
					Vulnerability string `json:"vulnerability"`
					Jailbreak     int    `json:"jailbreak"`
					Total         int    `json:"total"`
				} `json:"vulnerabilityResults"`
			} `json:"extraBody"`
		} `json:"content"`
	}
	if err := json.Unmarshal(rawResult, &wrapped); err == nil && len(wrapped.Content) > 0 {
		item := wrapped.Content[0]
		if item.Score != nil {
			stats.Score = *item.Score
			stats.HasScore = true
		}
		stats.Total = item.Total
		stats.Jailbreak = item.Jailbreak
		// 漏洞计数：jailbreak 成功数（每个被攻破项算一条风险）
		if item.Jailbreak > 0 {
			stats.RiskCount = item.Jailbreak
		}
	}

	// results 数组 → 风险发现明细计数兜底（Agent-Scan vulnerable_tests 缺失时）
	var resultsArr []json.RawMessage
	if err := json.Unmarshal(flat.Results, &resultsArr); err == nil && len(resultsArr) > 0 && stats.RiskCount == 0 {
		stats.RiskCount = len(resultsArr)
	}
	return stats
}

// parseSessionTarget 从 params JSON 提取目标引用
func parseSessionTarget(params []byte) []string {
	if len(params) == 0 {
		return nil
	}
	var p map[string]interface{}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil
	}
	var refs []string
	for _, key := range []string{"agent_id", "target_agent_id", "model_id"} {
		if v, ok := p[key]; ok {
			switch val := v.(type) {
			case string:
				if val != "" {
					refs = append(refs, val)
				}
			case []interface{}:
				for _, item := range val {
					if s, ok := item.(string); ok && s != "" {
						refs = append(refs, s)
					}
				}
			}
		}
	}
	return refs
}

// HandleDashboardSummary GET /api/v1/dashboard/summary?taskType=&timeRange=7d|30d|90d
func HandleDashboardSummary(c *gin.Context, tm *TaskManager) {
	traceID := getTraceID(c)
	username := c.GetString("username")
	taskType := c.Query("taskType")
	timeRange := c.DefaultQuery("timeRange", "30d")

	days := 30
	switch timeRange {
	case "7d":
		days = 7
	case "90d":
		days = 90
	}
	since := time.Now().AddDate(0, 0, -days).UnixMilli()

	sessions, total, err := tm.taskStore.SearchUserSessionsFiltered(username, taskType, since)
	if err != nil {
		log.Errorf("dashboard summary 查询失败: trace_id=%s, error=%v", traceID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"status": 1, "message": "查询失败: " + err.Error(), "data": nil})
		return
	}

	type sessionAgg struct {
		id        string
		title     string
		taskType  string
		status    string
		createdAt int64
		updatedAt int64
		target    string
		score     *float64
		riskCount int
		riskType  string
		jailbreak int
		totalCnt  int
	}

	aggs := make([]sessionAgg, 0, len(sessions))
	for _, s := range sessions {
		agg := sessionAgg{
			id:        s.ID,
			title:     s.Title,
			taskType:  s.TaskType,
			status:    s.Status,
			createdAt: s.CreatedAt,
			updatedAt: s.UpdatedAt,
		}
		// 目标：params 里的引用 id
		if refs := parseSessionTarget(s.Params); len(refs) > 0 {
			agg.target = refs[0]
		}
		// 仅完成任务有结果
		if s.Status == TaskStatusDone {
			lastResult, err := tm.taskStore.GetLastMessageByType(s.ID, "resultUpdate")
			if err == nil && lastResult != nil {
				if stats := parseResultUpdateRisk(lastResult.EventData, s.TaskType); stats != nil {
					if stats.HasScore {
						sc := stats.Score
						agg.score = &sc
					}
					agg.riskCount = stats.RiskCount
					agg.riskType = stats.RiskType
					agg.jailbreak = stats.Jailbreak
					agg.totalCnt = stats.Total
				}
			}
		}
		aggs = append(aggs, agg)
	}

	// ---- 聚合 ----
	var scoreSum float64
	var scoreCnt int
	var pendingRisks int
	targetRisk := map[string]int{}   // 目标 → 风险数
	targetSeen := map[string]bool{}  // 覆盖资产去重
	severity := map[string]int{"critical": 0, "high": 0, "medium": 0, "low": 0}
	type dayKey struct {
		day      string
		taskType string
	}
	trendMap := map[dayKey]int{}
	var jailbreakSum, baseTotalSum int

	findings := make([]gin.H, 0)
	for _, a := range aggs {
		if a.score != nil {
			scoreSum += *a.score
			scoreCnt++
		}
		pendingRisks += a.riskCount
		if a.target != "" {
			targetSeen[a.target] = true
			targetRisk[a.target] += a.riskCount
		}
		// 严重度：体检攻破 → critical；Agent-Scan risk_type=high → high；riskCount>0 其他 → medium
		if a.taskType == "Model-Redteam-Report" && a.riskCount > 0 {
			severity["critical"] += a.riskCount
		} else if strings.EqualFold(a.riskType, "high") && a.riskCount > 0 {
			severity["high"] += a.riskCount
		} else if a.riskCount > 0 {
			severity["medium"] += a.riskCount
		}
		// 趋势：按完成日
		if a.status == TaskStatusDone && a.updatedAt >= since {
			day := time.UnixMilli(a.updatedAt).Format("01-02")
			trendMap[dayKey{day, a.taskType}] += a.riskCount
		}
		// 越狱通过率分母/分子
		if a.taskType == "Model-Redteam-Report" && a.totalCnt > 0 {
			jailbreakSum += a.jailbreak
			baseTotalSum += a.totalCnt
		}
		// 最新发现（仅完成且有风险）
		if a.status == TaskStatusDone && a.riskCount > 0 {
			findings = append(findings, gin.H{
				"sessionId": a.id,
				"title":     a.title,
				"taskType":  a.taskType,
				"riskCount": a.riskCount,
				"severity":  findingSeverity(a.taskType, a.riskType),
				"updatedAt": a.updatedAt,
			})
		}
	}

	// KPI
	var scoreKpi interface{}
	if scoreCnt > 0 {
		v := scoreSum / float64(scoreCnt)
		scoreKpi = gin.H{"value": round1(v), "sampleSize": scoreCnt}
	}
	var jailbreakRate interface{}
	if baseTotalSum > 0 {
		v := (1 - float64(jailbreakSum)/float64(baseTotalSum)) * 100
		jailbreakRate = gin.H{"value": round1(v), "baseTotal": baseTotalSum, "jailbreak": jailbreakSum}
	}

	// 趋势序列化（按日排序）
	daySet := map[string]bool{}
	for k := range trendMap {
		daySet[k.day] = true
	}
	days2 := make([]string, 0, len(daySet))
	for d := range daySet {
		days2 = append(days2, d)
	}
	sort.Strings(days2)
	seriesTypes := []string{"AI-Infra-Scan", "Mcp-Scan", "Agent-Scan", "Model-Redteam-Report"}
	trend := make([]gin.H, 0, len(days2))
	for _, d := range days2 {
		row := gin.H{"date": d}
		for _, tt := range seriesTypes {
			row[tt] = trendMap[dayKey{d, tt}]
		}
		trend = append(trend, row)
	}

	// Top 目标（按风险数降序，最多 8）
	type targetRow struct {
		name  string
		count int
	}
	targets := make([]targetRow, 0, len(targetRisk))
	for name, cnt := range targetRisk {
		targets = append(targets, targetRow{name, cnt})
	}
	sort.Slice(targets, func(i, j int) bool { return targets[i].count > targets[j].count })
	topTargets := make([]gin.H, 0, 8)
	for i, t := range targets {
		if i >= 8 {
			break
		}
		topTargets = append(topTargets, gin.H{"name": t.name, "riskCount": t.count})
	}

	// 最新发现按时间降序，最多 8
	sort.Slice(findings, func(i, j int) bool {
		return findings[i]["updatedAt"].(int64) > findings[j]["updatedAt"].(int64)
	})
	if len(findings) > 8 {
		findings = findings[:8]
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  0,
		"message": "success",
		"data": gin.H{
			"kpis": gin.H{
				"score":             scoreKpi,
				"pendingRisks":      pendingRisks,
				"coveredAssets":     len(targetSeen),
				"jailbreakPassRate": jailbreakRate,
				"taskCount":         total,
			},
			"trend":          trend,
			"severity":       severity,
			"topTargets":     topTargets,
			"recentFindings": findings,
			"coverage": gin.H{
				"score":             "已完成任务评分均值（Agent-Scan / Model-Redteam-Report）",
				"pendingRisks":      "全部风险发现计数（暂无处置状态流转）",
				"coveredAssets":     "参数中出现的去重目标数（agent_id / target_agent_id / model_id）",
				"jailbreakPassRate": "1 - 攻破率（体检任务 content[0] 口径）",
				"assetDomain":       false,
				"scoreDist":         false,
				"topComponents":     false,
			},
		},
	})
}

// findingSeverity 单条发现的严重度映射（与分布聚合同口径）
func findingSeverity(taskType, riskType string) string {
	if taskType == "Model-Redteam-Report" {
		return "critical"
	}
	if strings.EqualFold(riskType, "high") {
		return "high"
	}
	return "medium"
}

func round1(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}
