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

package utils

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// AgentConfigRoot is the directory root holding per-user agent provider
// configs, mirroring common/websocket's knowledge2_api layout.
const agentConfigRoot = "data/agents"

var agentConfigNameRe = regexp.MustCompile(`^[a-zA-Z0-9_\-\.]+$`)

// ReadAgentProviderConfig reads an agent provider YAML by username and config
// name, falling back to the public user directory when the user directory has
// no match. Kept independent of the websocket package to avoid an import
// cycle; the lookup rules match readAgentConfigContent there.
func ReadAgentProviderConfig(username, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || !agentConfigNameRe.MatchString(name) ||
		strings.Contains(name, "..") {
		return "", os.ErrNotExist
	}
	user := strings.TrimSpace(username)
	if user == "" {
		user = "public_user"
	}
	for _, dir := range []string{filepath.Join(agentConfigRoot, user), filepath.Join(agentConfigRoot, "public_user")} {
		for _, ext := range []string{".yaml", ".yml"} {
			data, err := os.ReadFile(filepath.Join(dir, name+ext))
			if err == nil {
				return string(data), nil
			}
			if !errors.Is(err, os.ErrNotExist) {
				return "", err
			}
		}
	}
	return "", os.ErrNotExist
}
