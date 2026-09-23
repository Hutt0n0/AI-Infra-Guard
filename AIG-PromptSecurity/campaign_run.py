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

"""Campaign（对抗战役）CLI 入口 —— 长时自主攻击 harness。

与 cli_run.py 的关系：独立入口、零共享状态，体检链路不受影响。
Go 侧调用形如：
  uv run --no-project campaign_run.py --async_mode \
      --topic "..." --rounds_per_method 3 --session_id <taskId> \
      [--techniques A B C] [--target_type agent --agent_provider ...] \
      --model m --base_url u --api_key k --max_concurrent n \
      --evaluate_model e --eval_base_url eu --eval_api_key ek
"""

import argparse
import os

from cli.aig_logger import logger
from deepteam.plugin_system import PluginManager
from cli.models import create_model
from cli.campaign_runner import CampaignRunner

# logger config（体检同款文件轮转）
logger.add(f"logs/campaign_{{time:YYYY-MM-DD_HH-mm-ss}}.log", level="DEBUG", enqueue=True, retention="7 days")

plugin_manager = PluginManager()


def main():
    parser = argparse.ArgumentParser(description="Campaign Runner (adversarial campaign harness)")

    # 目标/模型参数（与 cli_run.py 同名同义，Go 侧构造逻辑可镜像）
    parser.add_argument("--base_url", type=str, action='append')
    parser.add_argument("--api_key", type=str, nargs=1, action='append')
    parser.add_argument("--model", type=str, action='append')
    parser.add_argument("--max_concurrent", type=int, action='append')
    parser.add_argument("--sim_base_url", type=str)
    parser.add_argument("--sim_api_key", type=str, nargs=1)
    parser.add_argument("--simulator_model", type=str)
    parser.add_argument("--sim_max_concurrent", type=int, default=10)
    parser.add_argument("--eval_base_url", type=str)
    parser.add_argument("--eval_api_key", type=str, nargs=1)
    parser.add_argument("--evaluate_model", type=str)
    parser.add_argument("--eval_max_concurrent", type=int, default=10)

    parser.add_argument("--target_type", type=str, default="model", choices=["model", "agent"])
    parser.add_argument("--agent_provider", type=str, default="")
    parser.add_argument("--agent_scan_dir", type=str, default="")
    parser.add_argument("--agent_max_concurrent", type=int, default=4)

    # campaign 专属
    parser.add_argument("--topic", type=str, required=True, help="Campaign research topic")
    parser.add_argument("--techniques", type=str, nargs='+', default=None,
                        help="Attack method ids (default: all from strategy_map)")
    parser.add_argument("--rounds_per_method", type=int, default=3,
                        help="Rounds per method, clamped to 1-10")
    parser.add_argument("--session_id", type=str, default="", help="Task session id (checkpoint key)")

    parser.add_argument("--async_mode", action='store_true')
    parser.add_argument("--lang", type=str, default="zh_CN")

    args = parser.parse_args()
    logger.set_language(lang=args.lang)

    # ---- 模型初始化（镜像 cli_run.py 的双形状逻辑）----
    models = []
    if args.target_type == "agent":
        if not args.agent_provider:
            raise ValueError("--agent_provider is required when --target_type=agent")
        from cli.model_utils.agent_target import AgentTargetModel

        agent_scan_dir = args.agent_scan_dir or os.environ.get("AIG_AGENT_SCAN_DIR", "")
        if not agent_scan_dir:
            candidate = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "agent-scan"
            )
            if os.path.isdir(candidate):
                agent_scan_dir = candidate
        if not agent_scan_dir:
            raise ValueError("--agent_scan_dir is required when --target_type=agent (or set AIG_AGENT_SCAN_DIR)")
        models.append(AgentTargetModel(
            agent_provider_file=args.agent_provider,
            agent_scan_dir=agent_scan_dir,
            max_concurrent=args.agent_max_concurrent,
        ))
    else:
        lengths = list(map(len, (args.base_url, args.api_key, args.model, args.max_concurrent)))
        if len(set(lengths)) != 1:
            raise ValueError("base_url, api_key, model, max_concurrent must have same number of parameters")
        for base_url, api_key, model_name, max_concurrent in zip(
                args.base_url, args.api_key, args.model, args.max_concurrent):
            models.append(create_model(model_name, base_url, api_key[0], max_concurrent))

    if any(p is None for p in (args.evaluate_model, args.eval_base_url, args.eval_api_key, args.eval_max_concurrent)):
        evaluate_model = models[0]
        evaluate_max = models[0].max_concurrent
    else:
        evaluate_model = create_model(args.evaluate_model, args.eval_base_url, args.eval_api_key[0], args.eval_max_concurrent)
        evaluate_max = args.eval_max_concurrent

    if any(p is None for p in (args.simulator_model, args.sim_base_url, args.sim_api_key, args.sim_max_concurrent)):
        simulator_model = evaluate_model
    else:
        simulator_model = create_model(args.simulator_model, args.sim_base_url, args.sim_api_key[0], args.sim_max_concurrent)

    runner = CampaignRunner(
        plugin_manager=plugin_manager,
        topic=args.topic,
        rounds_per_method=args.rounds_per_method,
        session_id=args.session_id,
    )
    # asyncio 事件循环驱动（RunCmdWithContext 的子进程 stdout 逐行回调由 Go 承担）
    runner.run(
        models=models,
        simulator_model=simulator_model,
        evaluate_model=evaluate_model,
        techniques=args.techniques,
        async_mode=args.async_mode,
        lang=args.lang,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(e)
        logger.critical_issue(content=logger.translated_msg("Something went wrong. Please try again in a few moments."))
