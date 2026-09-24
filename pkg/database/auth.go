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

package database

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"math/big"
	"os"
	"strings"
	"time"

	"github.com/Tencent/AI-Infra-Guard/internal/gologger"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// 认证常量
const (
	// SessionTTLSeconds 会话有效期：7 天（滑动续期）
	SessionTTLSeconds int64 = 7 * 24 * 3600
	// CookieName 会话 cookie 名（HttpOnly，JS 不可读）
	CookieName = "aig_session"
	// MinPasswordLength 密码最短长度
	MinPasswordLength = 8
	// RoleAdmin / RoleUser 角色
	RoleAdmin = "admin"
	RoleUser  = "user"
	// kvKeyPublicUserMigrated public_user 数据一次性迁移标记
	kvKeyPublicUserMigrated = "public_user_migrated"
)

// AuthSession 浏览器会话表：不透明随机 token 的 SHA-256 哈希（库泄露无可用会话）
type AuthSession struct {
	TokenHash  string `gorm:"primaryKey;column:token_hash"`
	Username   string `gorm:"column:username;not null;index"`
	CreatedAt  int64  `gorm:"column:created_at;not null"`
	LastSeenAt int64  `gorm:"column:last_seen_at;not null"`
	ExpiresAt  int64  `gorm:"column:expires_at;not null;index"`
}

// AuthKV 认证相关 KV（迁移标记等）
type AuthKV struct {
	Key   string `gorm:"primaryKey;column:k"`
	Value string `gorm:"column:v;not null"`
}

// AuthStore 认证存储
type AuthStore struct {
	db *gorm.DB
}

// NewAuthStore 构造（复用 taskStore 的数据库连接）
func NewAuthStore(db *gorm.DB) *AuthStore {
	return &AuthStore{db: db}
}

// Init 迁移认证表（User 表的 PasswordHash/Role 字段已加入模型，
// 由 taskStore.Init 的 AutoMigrate 统一建列，这里兜底校验）
func (s *AuthStore) Init() error {
	if err := s.db.AutoMigrate(&AuthSession{}, &AuthKV{}); err != nil {
		return fmt.Errorf("migrate auth tables: %v", err)
	}
	for _, col := range []string{"password_hash", "role"} {
		if !s.db.Migrator().HasColumn(&User{}, col) {
			if err := s.db.Migrator().AddColumn(&User{}, col); err != nil {
				return fmt.Errorf("add users.%s: %v", col, err)
			}
		}
	}
	// 既有行补默认角色
	s.db.Model(&User{}).Where("role = '' OR role IS NULL").Update("role", RoleUser)
	return nil
}

// UserWithAuth 用户视图（PasswordHash 永不出查询层）
type UserWithAuth struct {
	UserID     string `json:"user_id"`
	Username   string `json:"username"`
	Email      string `json:"email"`
	IsActive   bool   `json:"is_active"`
	FirstLogin bool   `json:"first_login"`
	CreatedAt  int64  `json:"created_at"`
	Role       string `json:"role"`
}

// hashPassword bcrypt 封装（cost 10）
func hashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// hashToken 会话 token 只存哈希
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// GenerateRandomString 生成密码/密钥用的随机串（去掉易混淆字符）
func GenerateRandomString(n int) string {
	const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
	out := make([]byte, n)
	for i := range out {
		idx, _ := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		out[i] = alphabet[idx.Int64()]
	}
	return string(out)
}

// ValidateUsername 用户名规则：4-32 位字母数字下划线连字符
func ValidateUsername(name string) bool {
	if len(name) < 4 || len(name) > 32 {
		return false
	}
	for _, r := range name {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '_' || r == '-') {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------- users

// CreateUserWithPassword 建号（bcrypt 落库）
func (s *AuthStore) CreateUserWithPassword(username, email, password, role string) (*UserWithAuth, error) {
	if !ValidateUsername(username) {
		return nil, fmt.Errorf("用户名需为 4-32 位字母数字下划线连字符")
	}
	if len(password) < MinPasswordLength {
		return nil, fmt.Errorf("密码至少 %d 位", MinPasswordLength)
	}
	if strings.TrimSpace(email) == "" {
		return nil, fmt.Errorf("邮箱不能为空")
	}
	hash, err := hashPassword(password)
	if err != nil {
		return nil, err
	}
	u := &User{
		UserID:       "u_" + GenerateRandomString(12),
		Username:     username,
		Email:        email,
		IsActive:     true,
		FirstLogin:   true,
		CreatedAt:    time.Now().Unix(),
		PasswordHash: hash,
		Role:         role,
	}
	if err := s.db.Create(u).Error; err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return nil, fmt.Errorf("用户名或邮箱已存在")
		}
		return nil, err
	}
	return toUserWithAuth(u), nil
}

// toUserWithAuth User → 视图
func toUserWithAuth(u *User) *UserWithAuth {
	role := u.Role
	if role == "" {
		role = RoleUser
	}
	return &UserWithAuth{
		UserID: u.UserID, Username: u.Username, Email: u.Email,
		IsActive: u.IsActive, FirstLogin: u.FirstLogin,
		CreatedAt: u.CreatedAt, Role: role,
	}
}

// ListUsers 用户列表
func (s *AuthStore) ListUsers() ([]UserWithAuth, error) {
	var rows []User
	if err := s.db.Order("created_at ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]UserWithAuth, 0, len(rows))
	for i := range rows {
		out = append(out, *toUserWithAuth(&rows[i]))
	}
	return out, nil
}

// SetUserActive 启/禁用户
func (s *AuthStore) SetUserActive(username string, active bool) error {
	return s.db.Model(&User{}).Where("username = ?", username).Update("is_active", active).Error
}

// ResetPassword 重置密码（不验旧密，admin 通道）
func (s *AuthStore) ResetPassword(username, newPassword string) error {
	if len(newPassword) < MinPasswordLength {
		return fmt.Errorf("密码至少 %d 位", MinPasswordLength)
	}
	hash, err := hashPassword(newPassword)
	if err != nil {
		return err
	}
	return s.db.Model(&User{}).Where("username = ?", username).
		Updates(map[string]interface{}{"password_hash": hash, "first_login": true}).Error
}

// ChangePassword 验旧密改新密（成功后清 first_login）
func (s *AuthStore) ChangePassword(username, oldPassword, newPassword string) error {
	if len(newPassword) < MinPasswordLength {
		return fmt.Errorf("新密码至少 %d 位", MinPasswordLength)
	}
	var row User
	if err := s.db.Where("username = ?", username).First(&row).Error; err != nil {
		return fmt.Errorf("用户不存在")
	}
	if row.PasswordHash == "" {
		return fmt.Errorf("账号未初始化，请联系管理员重置密码")
	}
	if bcrypt.CompareHashAndPassword([]byte(row.PasswordHash), []byte(oldPassword)) != nil {
		return fmt.Errorf("原密码错误")
	}
	hash, err := hashPassword(newPassword)
	if err != nil {
		return err
	}
	return s.db.Model(&User{}).Where("username = ?", username).
		Updates(map[string]interface{}{"password_hash": hash, "first_login": false}).Error
}

// CountActiveAdmins 活跃 admin 数（防止禁掉最后一个）
func (s *AuthStore) CountActiveAdmins() int64 {
	var n int64
	s.db.Model(&User{}).Where("role = ? AND is_active = ?", RoleAdmin, true).Count(&n)
	return n
}

// VerifyPassword 登录比对（用户存在/激活/哈希非空；失败文案统一防用户名枚举）
func (s *AuthStore) VerifyPassword(username, password string) (*UserWithAuth, error) {
	var row User
	if err := s.db.Where("username = ?", username).First(&row).Error; err != nil {
		// 与"密码错误"同延迟，避免时序侧信道做用户名枚举
		bcrypt.CompareHashAndPassword(
			[]byte("$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5B0X0wJk9yGKQGmY0mY8Z3jRyO0eS"), []byte(password))
		return nil, fmt.Errorf("用户名或密码错误")
	}
	if !row.IsActive {
		return nil, fmt.Errorf("账号已被禁用，请联系管理员")
	}
	if row.PasswordHash == "" {
		return nil, fmt.Errorf("账号未初始化，请联系管理员重置密码")
	}
	if bcrypt.CompareHashAndPassword([]byte(row.PasswordHash), []byte(password)) != nil {
		return nil, fmt.Errorf("用户名或密码错误")
	}
	return toUserWithAuth(&row), nil
}

// ------------------------------------------------------------- sessions

// CreateSession 新会话：返回明文 token（仅此一次），库存哈希
func (s *AuthStore) CreateSession(username string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	now := time.Now().Unix()
	row := &AuthSession{
		TokenHash:  hashToken(token),
		Username:   username,
		CreatedAt:  now,
		LastSeenAt: now,
		ExpiresAt:  now + SessionTTLSeconds,
	}
	if err := s.db.Create(row).Error; err != nil {
		return "", err
	}
	return token, nil
}

// GetSessionUser 校验 token → 返回用户（过期即无效；用户被禁即无效）
func (s *AuthStore) GetSessionUser(token string) (*UserWithAuth, error) {
	if token == "" {
		return nil, fmt.Errorf("empty token")
	}
	var sess AuthSession
	if err := s.db.Where("token_hash = ? AND expires_at > ?", hashToken(token), time.Now().Unix()).First(&sess).Error; err != nil {
		return nil, fmt.Errorf("session expired")
	}
	var u User
	if err := s.db.Where("username = ? AND is_active = ?", sess.Username, true).First(&u).Error; err != nil {
		return nil, fmt.Errorf("user disabled")
	}
	return toUserWithAuth(&u), nil
}

// TouchSession 滑动续期：剩余不足半程（3.5 天）时续到满 7 天
func (s *AuthStore) TouchSession(token string) {
	now := time.Now().Unix()
	s.db.Model(&AuthSession{}).
		Where("token_hash = ? AND expires_at - ? < ?", hashToken(token), now, SessionTTLSeconds/2).
		Update("expires_at", now+SessionTTLSeconds)
}

// DeleteSession 登出
func (s *AuthStore) DeleteSession(token string) {
	s.db.Where("token_hash = ?", hashToken(token)).Delete(&AuthSession{})
}

// DeleteSessionsForUser 吊销某用户全部会话（禁用/重置密码）
func (s *AuthStore) DeleteSessionsForUser(username string) {
	s.db.Where("username = ?", username).Delete(&AuthSession{})
}

// DeleteSessionsForUserExcept 改密保留当前会话
func (s *AuthStore) DeleteSessionsForUserExcept(username, keepToken string) {
	s.db.Where("username = ? AND token_hash != ?", username, hashToken(keepToken)).Delete(&AuthSession{})
}

// DeleteExpiredSessions 过期清理（登录时顺手跑）
func (s *AuthStore) DeleteExpiredSessions() {
	s.db.Where("expires_at < ?", time.Now().Unix()).Delete(&AuthSession{})
}

// ------------------------------------------------------------ bootstrap

// BootstrapAuth 启动引导：无 admin 则建 admin（随机密码打日志横幅），
// 并做 public_user 数据一次性迁移（首次建号时执行）。
func (s *AuthStore) BootstrapAuth() error {
	if err := s.Init(); err != nil {
		return err
	}
	if s.CountActiveAdmins() > 0 {
		return nil
	}
	password := GenerateRandomString(16)
	if _, err := s.CreateUserWithPassword("admin", "admin@localhost", password, RoleAdmin); err != nil {
		// admin 行已存在（legacy）——兜底重置密码并提权
		if err2 := s.ResetPassword("admin", password); err2 != nil {
			return fmt.Errorf("bootstrap admin: %v", err)
		}
		s.db.Model(&User{}).Where("username = ?", "admin").
			Updates(map[string]interface{}{"role": RoleAdmin, "is_active": true})
	}
	// public_user 数据迁移：升级前所有交互任务都属于 public_user（无凭证可登录），
	// 一次性过户给 admin。AIG_SKIP_PUBLIC_USER_MIGRATION=1 跳过。
	if os.Getenv("AIG_SKIP_PUBLIC_USER_MIGRATION") != "1" && !s.IsPublicUserMigrated() {
		if err := s.db.Model(&Session{}).Where("username = ?", publicUserUsername).
			Update("username", "admin").Error; err != nil {
			gologger.Errorf("public_user 数据迁移失败: %v", err)
		} else {
			s.MarkPublicUserMigrated()
			gologger.Infof("已将 public_user 名下的历史任务过户给 admin 账号")
		}
	}
	banner := "" +
		"\n" +
		"==================================================================\n" +
		"  A.I.G 首次启动已创建管理员账号（此横幅仅显示一次）:\n" +
		"      用户名: admin\n" +
		"      密  码: " + password + "\n" +
		"  请立即登录并修改密码（设置 → 账号安全）。\n" +
		"=================================================================="
	gologger.Warnf("%s", banner)
	return nil
}

// IsPublicUserMigrated 迁移标记
func (s *AuthStore) IsPublicUserMigrated() bool {
	var kv AuthKV
	if err := s.db.Where("k = ?", kvKeyPublicUserMigrated).First(&kv).Error; err != nil {
		return false
	}
	return kv.Value == "1"
}

// MarkPublicUserMigrated 写迁移标记
func (s *AuthStore) MarkPublicUserMigrated() {
	s.db.Where("k = ?", kvKeyPublicUserMigrated).
		Assign(AuthKV{Key: kvKeyPublicUserMigrated, Value: "1"}).
		FirstOrCreate(&AuthKV{Key: kvKeyPublicUserMigrated, Value: "1"})
}

// GetUserByUsernameRaw 取原始用户行（status 判断等 admin 场景）
func (s *AuthStore) GetUserByUsernameRaw(username string) (*User, error) {
	var u User
	if err := s.db.Where("username = ?", username).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}
