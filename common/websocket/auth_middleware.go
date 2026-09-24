// Copyright (c) 2024-2026 Tencent Zhuque Lab. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Requirement: Any integration or derivative work must explicitly attribute
// Tencent Zhuque Lab (https://github.com/Tencent/AI-Infra-Guard) in its
// documentation or user interface, as detailed in the NOTICE file.

package websocket

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"
	"sync/atomic"

	"github.com/Tencent/AI-Infra-Guard/internal/gologger"
	"github.com/Tencent/AI-Infra-Guard/pkg/database"
	"github.com/gin-gonic/gin"
)

// 认证中间件层。
//
// AIG_AUTH_DISABLE=1 时全部中间件退化为既有 setupIdentityMiddleware 头信任
// 行为（存量部署/开发调试的逃生舱）；默认启用认证：浏览器走 session cookie
// （HttpOnly aig_session），agent/三方 API 走 X-APIKey（服务端配置或启动生成）。

var (
	authStore     *database.AuthStore
	agentAPIKey   atomic.Value // string，启动时解析一次
	agentKeyKnown atomic.Bool
)

// AuthEnabled 认证总开关（AIG_AUTH_DISABLE=1 关闭）
func AuthEnabled() bool {
	return strings.TrimSpace(os.Getenv("AIG_AUTH_DISABLE")) != "1"
}

// SetAuthStore 由 RunWebServer 注入
func SetAuthStore(s *database.AuthStore) {
	authStore = s
}

// resolveAgentAPIKey 解析 agent/三方 API 密钥：env 优先，未设则生成+日志横幅（仅一次）
func resolveAgentAPIKey() string {
	if agentKeyKnown.Load() {
		return agentAPIKey.Load().(string)
	}
	key := strings.TrimSpace(os.Getenv("AIG_AGENT_API_KEY"))
	if key == "" {
		key = database.GenerateRandomString(32)
		gologger.Warnf(
			"\n==================================================================\n"+
				"  A.I.G 未配置 AIG_AGENT_API_KEY，已自动生成 agent/三方 API 密钥:\n"+
				"      %s\n"+
				"  请将该值设置为 agent 进程的环境变量 AIG_AGENT_API_KEY，\n"+
				"  三方 API 调用请在请求头携带 X-API-Key。\n"+
				"==================================================================", key)
	}
	agentAPIKey.Store(key)
	agentKeyKnown.Store(true)
	return key
}

// checkAgentKey 常量时间比对 X-APIKey / X-API-Key 头
func checkAgentKey(c *gin.Context) bool {
	key := c.GetHeader("X-APIKey")
	if key == "" {
		key = c.GetHeader("X-API-Key")
	}
	if key == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(key), []byte(resolveAgentAPIKey())) == 1
}

// abort401 统一 401 响应
func abort401(c *gin.Context, message string) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"status": 1, "message": message, "data": nil})
}

// ---------------------------------------------------------------- sessions

// sessionFromCookie 从请求 cookie 解析会话 → (username, role, ok)
func sessionFromCookie(c *gin.Context) (string, string, bool) {
	if authStore == nil {
		return "", "", false
	}
	token, err := c.Cookie(database.CookieName)
	if err != nil || token == "" {
		return "", "", false
	}
	u, err := authStore.GetSessionUser(token)
	if err != nil {
		return "", "", false
	}
	authStore.TouchSession(token) // 滑动续期
	return u.Username, u.Role, true
}

// sessionAuth 浏览器 session 认证（identity 注入自 session，header 不可信）
func sessionAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !AuthEnabled() {
			setupIdentityMiddleware()(c)
			return
		}
		username, role, ok := sessionFromCookie(c)
		if !ok {
			abort401(c, "未登录或会话已过期")
			return
		}
		c.Set("username", username)
		c.Set("auth_role", role)
		c.Next()
	}
}

// sessionAuthIfEnabled 单路由挂载用：禁用时纯放行（无身份注入）
func sessionAuthIfEnabled() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !AuthEnabled() {
			c.Next()
			return
		}
		sessionAuth()(c)
	}
}

// identityMiddleware 分组用统一入口：启用=sessionAuth，禁用=legacy 头信任
func identityMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !AuthEnabled() {
			setupIdentityMiddleware()(c)
			return
		}
		sessionAuth()(c)
	}
}

// browserOrAgentAuth knowledge/app 组双认证：session cookie 或 agent API key。
// agent key 请求身份固定 agent_service——所有权检查（session.Username 比对）
// 天然限制其对具体任务的越权，此放宽已在部署文档说明。
func browserOrAgentAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !AuthEnabled() {
			setupIdentityMiddleware()(c)
			return
		}
		if checkAgentKey(c) {
			c.Set("username", "agent_service")
			c.Set("auth_role", "agent")
			c.Next()
			return
		}
		sessionAuth()(c)
	}
}

// requireAgentAPIKey 仅 API key 认证（taskapi 三方组 + agent WS 组）。
// WS 场景中间件在 upgrade 之前 401，不存在半升级连接。
func requireAgentAPIKey() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !AuthEnabled() {
			setupIdentityMiddleware()(c)
			return
		}
		if !checkAgentKey(c) {
			abort401(c, "无效的 API Key（X-API-Key 头）")
			return
		}
		// taskapi 的用户身份：沿用 resolveTaskAPIUsername 的 api_user 语义
		if c.GetString("username") == "" {
			c.Set("username", "api_user")
		}
		c.Next()
	}
}

// requireAdmin admin 门控（挂在 sessionAuth 之后）
func requireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !AuthEnabled() {
			c.Next()
			return
		}
		if c.GetString("auth_role") != database.RoleAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"status": 1, "message": "需要管理员权限", "data": nil})
			return
		}
		c.Next()
	}
}

// currentAuthUser 当前会话用户（auth handler 用）
func currentAuthUser(c *gin.Context) (username, role string, ok bool) {
	return c.GetString("username"), c.GetString("auth_role"), c.GetString("username") != ""
}
