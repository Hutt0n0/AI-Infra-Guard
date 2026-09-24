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
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Tencent/AI-Infra-Guard/internal/gologger"
	"github.com/Tencent/AI-Infra-Guard/pkg/database"
	"github.com/gin-gonic/gin"
)

// 认证 API：登录/登出/会话查询/改密 + admin 用户管理。
// 路由挂在开放的 /api/v1/auth 组（server.go 注册），handler 自检认证状态；
// AIG_AUTH_DISABLE=1 时端点全部返回 disabled 响应（前端据此切换旧行为）。

// loginFailCounter 登录失败计数（进程内，简单退避）
var loginFailCounter sync.Map // username -> *loginFailState

type loginFailState struct {
	count     int
	lastFail  time.Time
	lastDelay time.Duration
}

const (
	maxLoginFailDelay = 5 * time.Second
)

// loginDelayFor 失败次数 → 额外延迟（线性退避，封顶 5s；登录成功即清零）
func loginDelayFor(username string) time.Duration {
	v, ok := loginFailCounter.Load(username)
	if !ok {
		return 0
	}
	st := v.(*loginFailState)
	d := time.Duration(st.count) * 250 * time.Millisecond
	if d > maxLoginFailDelay {
		d = maxLoginFailDelay
	}
	return d
}

func recordLoginFail(username string) {
	v, _ := loginFailCounter.LoadOrStore(username, &loginFailState{})
	st := v.(*loginFailState)
	st.count++
	st.lastFail = time.Now()
}

func clearLoginFail(username string) {
	loginFailCounter.Delete(username)
}

// setSessionCookie 下发会话 cookie（HttpOnly；https 反代时加 Secure）
func setSessionCookie(c *gin.Context, token string) {
	maxAge := int(database.SessionTTLSeconds)
	cookie := &http.Cookie{
		Name:     database.CookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	}
	if strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
		cookie.Secure = true
	}
	http.SetCookie(c.Writer, cookie)
}

// clearSessionCookie 过期会话 cookie
func clearSessionCookie(c *gin.Context) {
	cookie := &http.Cookie{
		Name:     database.CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(c.Writer, cookie)
}

// HandleAuthLogin POST /api/v1/auth/login  {username, password}
func HandleAuthLogin(c *gin.Context) {
	if !AuthEnabled() {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "认证未启用（AIG_AUTH_DISABLE=1）", "data": nil})
		return
	}
	if authStore == nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "认证存储未就绪", "data": nil})
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Username == "" || body.Password == "" {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "请提供用户名和密码", "data": nil})
		return
	}
	// 失败退避延迟（防爆破；在密码校验前施行使总耗时恒定偏高）
	if d := loginDelayFor(body.Username); d > 0 {
		time.Sleep(d)
	}
	u, err := authStore.VerifyPassword(body.Username, body.Password)
	if err != nil {
		recordLoginFail(body.Username)
		gologger.Warnf("登录失败: username=%s ip=%s err=%v", body.Username, c.ClientIP(), err)
		c.JSON(http.StatusUnauthorized, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	clearLoginFail(body.Username)
	authStore.DeleteExpiredSessions()
	token, err := authStore.CreateSession(u.Username)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "创建会话失败", "data": nil})
		return
	}
	setSessionCookie(c, token)
	gologger.Infof("登录成功: username=%s ip=%s", u.Username, c.ClientIP())
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "登录成功", "data": gin.H{
		"username": u.Username, "role": u.Role, "first_login": u.FirstLogin,
	}})
}

// HandleAuthLogout POST /api/v1/auth/logout
func HandleAuthLogout(c *gin.Context) {
	if token, err := c.Cookie(database.CookieName); err == nil && token != "" && authStore != nil {
		authStore.DeleteSession(token)
	}
	clearSessionCookie(c)
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "已登出", "data": nil})
}

// HandleAuthMe GET /api/v1/auth/me
// 永远 200：登录页据此判断"需要登录"而不产生 401 噪音。
func HandleAuthMe(c *gin.Context) {
	if !AuthEnabled() {
		c.JSON(http.StatusOK, gin.H{"status": 0, "data": gin.H{
			"enabled": false, "authenticated": true, "username": "public_user", "role": "admin", "first_login": false,
		}})
		return
	}
	if token, err := c.Cookie(database.CookieName); err == nil && token != "" && authStore != nil {
		if u, err := authStore.GetSessionUser(token); err == nil {
			c.JSON(http.StatusOK, gin.H{"status": 0, "data": gin.H{
				"enabled": true, "authenticated": true,
				"username": u.Username, "role": u.Role, "first_login": u.FirstLogin,
			}})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "data": gin.H{
		"enabled": true, "authenticated": false,
	}})
}

// HandleAuthChangePassword POST /api/v1/auth/change-password  {old, new}
func HandleAuthChangePassword(c *gin.Context) {
	username, _, ok := currentAuthUser(c)
	if !ok {
		abort401(c, "未登录")
		return
	}
	var body struct {
		Old string `json:"old"`
		New string `json:"new"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "无效的请求体", "data": nil})
		return
	}
	if authStore == nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "认证存储未就绪", "data": nil})
		return
	}
	if err := authStore.ChangePassword(username, body.Old, body.New); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	// 保留当前会话，吊销其余（被改密踢出的旧设备）
	if token, err := c.Cookie(database.CookieName); err == nil {
		authStore.DeleteSessionsForUserExcept(username, token)
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "密码已修改", "data": nil})
}

// requireAdminHandler admin 中间件（auth 组内联版）
func requireAdminHandler(c *gin.Context) {
	if !AuthEnabled() {
		c.Next()
		return
	}
	_, role, ok := currentAuthUser(c)
	if !ok {
		abort401(c, "未登录")
		return
	}
	if role != database.RoleAdmin {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"status": 1, "message": "需要管理员权限", "data": nil})
		return
	}
	c.Next()
}

// HandleAuthListUsers GET /api/v1/auth/users（admin）
func HandleAuthListUsers(c *gin.Context) {
	users, err := authStore.ListUsers()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "查询用户失败", "data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "data": gin.H{"users": users}})
}

// HandleAuthCreateUser POST /api/v1/auth/users  {username, email, password?}
func HandleAuthCreateUser(c *gin.Context) {
	var body struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Username == "" {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "请提供用户名", "data": nil})
		return
	}
	password := body.Password
	generated := false
	if password == "" {
		password = database.GenerateRandomString(16)
		generated = true
	}
	u, err := authStore.CreateUserWithPassword(body.Username, body.Email, password, database.RoleUser)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	resp := gin.H{"username": u.Username, "role": u.Role}
	if generated {
		// 一次性返回，永不再展示
		resp["initial_password"] = password
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "用户已创建", "data": resp})
}

// HandleAuthSetUserStatus POST /api/v1/auth/users/:username/status  {active}
func HandleAuthSetUserStatus(c *gin.Context) {
	target := c.Param("username")
	var body struct {
		Active *bool `json:"active"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Active == nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "请提供 active 布尔值", "data": nil})
		return
	}
	operator, _, _ := currentAuthUser(c)
	active := *body.Active
	if !active {
		if target == operator {
			c.JSON(http.StatusOK, gin.H{"status": 1, "message": "不能禁用自己的账号", "data": nil})
			return
		}
		var targetUser *database.User
		if u, err := authStore.GetUserByUsernameRaw(target); err == nil {
			targetUser = u
		}
		if targetUser != nil && targetUser.Role == database.RoleAdmin {
			if n := authStore.CountActiveAdmins(); n <= 1 {
				c.JSON(http.StatusOK, gin.H{"status": 1, "message": "不能禁用最后一个管理员", "data": nil})
				return
			}
		}
		// 禁用即吊销全部会话
		authStore.DeleteSessionsForUser(target)
	}
	if err := authStore.SetUserActive(target, active); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": "更新失败", "data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "已更新", "data": nil})
}

// HandleAuthResetPassword POST /api/v1/auth/users/:username/reset-password
func HandleAuthResetPassword(c *gin.Context) {
	target := c.Param("username")
	newPassword := database.GenerateRandomString(16)
	if err := authStore.ResetPassword(target, newPassword); err != nil {
		c.JSON(http.StatusOK, gin.H{"status": 1, "message": err.Error(), "data": nil})
		return
	}
	authStore.DeleteSessionsForUser(target)
	// 一次性返回，永不再展示
	c.JSON(http.StatusOK, gin.H{"status": 0, "message": "密码已重置", "data": gin.H{
		"new_password": newPassword,
	}})
}

// RegisterAuthRoutes 注册认证路由（开放组；admin 端点内联门控）
func RegisterAuthRoutes(v1 *gin.RouterGroup) {
	g := v1.Group("/auth")
	g.POST("/login", HandleAuthLogin)
	g.POST("/logout", HandleAuthLogout)
	g.GET("/me", HandleAuthMe)
	// 以下需登录
	authed := g.Group("", sessionAuth())
	authed.POST("/change-password", HandleAuthChangePassword)
	// admin 用户管理
	admin := authed.Group("", requireAdminHandler)
	admin.GET("/users", HandleAuthListUsers)
	admin.POST("/users", HandleAuthCreateUser)
	admin.POST("/users/:username/status", HandleAuthSetUserStatus)
	admin.POST("/users/:username/reset-password", HandleAuthResetPassword)
}
