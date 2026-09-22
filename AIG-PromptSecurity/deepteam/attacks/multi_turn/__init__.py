# Copyright (c) 2024-2026 Tencent Zhuque Lab. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Requirement: Any integration or derivative work must explicitly attribute
# Tencent Zhuque Lab (https://github.com/Tencent/AI-Infra-Guard) in its
# documentation or user interface, as detailed in the NOTICE file.

from .bad_likert_judge import BadLikertJudge
from .best_of_n import BestofN
from .crescendo_jailbreaking import CrescendoJailbreaking
from .linear_jailbreaking import LinearJailbreaking
from .sequential_break import SequentialJailbreak
from .tree_jailbreaking import TreeJailbreaking
from .many_shot_jailbreaking import ManyShotJailbreaking
from .pair_jailbreaking import PAIRJailbreaking
from .goat_jailbreaking import GoatJailbreaking
from .actor_attack import ActorAttack

# 多轮攻击在 enhance 内部维护会话/记忆状态（Crescendo 的 MemorySystem、
# GOAT 的对话历史等）。attack_simulator 依此标记做 per-case deepcopy，
# 防止共享实例把状态串进并发的其他 case（历史遗留 bug，多轮会话化后必现）。
for _cls in (BadLikertJudge, BestofN, CrescendoJailbreaking, LinearJailbreaking,
             SequentialJailbreak, TreeJailbreaking, ManyShotJailbreaking,
             PAIRJailbreaking, GoatJailbreaking, ActorAttack):
    _cls.is_multi_turn = True

__all__ = [
    "BadLikertJudge",
    "BestofN",
    "CrescendoJailbreaking", 
    "LinearJailbreaking", 
    "SequentialJailbreak",
    "TreeJailbreaking", 
    "ManyShotJailbreaking",
    "PAIRJailbreaking",
    "GoatJailbreaking",
    "ActorAttack",
]
