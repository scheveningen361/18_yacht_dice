"""
train.py — Two-phase training: Behavioural Cloning → MaskablePPO

Phase 1 (BC):
  Collect greedy-agent trajectories → train policy with cross-entropy loss.
  Repeat until |mean(model_scores) - mean(greedy_scores)| < --bc-threshold,
  or until --bc-max-iters is reached.

Phase 2 (PPO):
  Continue from BC-pretrained weights using MaskablePPO.

Usage:
  python -m rl.train
  python -m rl.train --bc-episodes 1000 --bc-threshold 5.0 --ppo-steps 5000000
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import torch as th
import torch.utils.data as data_utils
from torch.utils.tensorboard import SummaryWriter

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from sb3_contrib import MaskablePPO
from sb3_contrib.common.wrappers import ActionMasker
from stable_baselines3.common.callbacks import BaseCallback, CheckpointCallback
from stable_baselines3.common.vec_env import DummyVecEnv

from rl.env import YachtDiceEnv
from rl.evaluate import (
    _greedy_category,
    _greedy_hold,
    evaluate_agent,
    evaluate_greedy,
)

# Defaults — overridden by --checkpoint-dir / --log-dir CLI args
CHECKPOINT_DIR = _ROOT / "checkpoints"
LOG_DIR = _ROOT / "logs"


# ------------------------------------------------------------------ #
# PPO callback: periodic score evaluation → TensorBoard
# ------------------------------------------------------------------ #

class _ScoreLogCallback(BaseCallback):
    def __init__(self, eval_env, eval_freq: int, n_eval: int, verbose=0):
        super().__init__(verbose)
        self.eval_env = eval_env
        self.eval_freq = eval_freq
        self.n_eval = n_eval

    def _on_step(self) -> bool:
        if self.n_calls % self.eval_freq == 0:
            scores = evaluate_agent(self.model, self.eval_env, self.n_eval)
            mean_score = float(np.mean(scores))
            self.logger.record("eval/mean_score", mean_score)
            if self.verbose:
                print(
                    f"  [RL {self.num_timesteps:>9,d}]  "
                    f"eval 평균={mean_score:.1f}"
                )
        return True


# ------------------------------------------------------------------ #
# Behavioural Cloning internals
# ------------------------------------------------------------------ #

class _TransitionDataset(data_utils.Dataset):
    def __init__(
        self,
        obs: np.ndarray,
        actions: np.ndarray,
        masks: np.ndarray,
    ):
        self.obs = th.tensor(obs, dtype=th.float32)
        self.actions = th.tensor(actions, dtype=th.long)
        self.masks = th.tensor(masks, dtype=th.bool)

    def __len__(self):
        return len(self.actions)

    def __getitem__(self, idx):
        return self.obs[idx], self.actions[idx], self.masks[idx]


def _collect_greedy_transitions(env: YachtDiceEnv, n_episodes: int):
    """Roll out the greedy agent and record (obs, action, mask) triples."""
    all_obs, all_actions, all_masks = [], [], []
    for _ in range(n_episodes):
        obs, _ = env.reset()
        done = False
        while not done:
            mask = env.action_masks()
            action = (
                _greedy_hold(env) if env.phase == 0 else _greedy_category(env, mask)
            )
            all_obs.append(obs.copy())
            all_actions.append(action)
            all_masks.append(mask.copy())
            obs, _, done, _, _ = env.step(action)
    return (
        np.array(all_obs, dtype=np.float32),
        np.array(all_actions, dtype=np.int64),
        np.array(all_masks, dtype=bool),
    )


def _bc_epoch(policy, loader, optimizer, device) -> float:
    """One BC training epoch; returns mean cross-entropy loss."""
    total_loss = 0.0
    for obs_b, act_b, mask_b in loader:
        obs_b = obs_b.to(device)
        act_b = act_b.to(device)
        # evaluate_actions accepts numpy mask; move to CPU first
        _, log_prob, _ = policy.evaluate_actions(
            obs_b, act_b, action_masks=mask_b.cpu().numpy()
        )
        loss = -log_prob.mean()
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
    return total_loss / len(loader)


# ------------------------------------------------------------------ #
# Phase 1: Behavioural Cloning loop
# ------------------------------------------------------------------ #

def run_bc_phase(
    model: MaskablePPO,
    env: YachtDiceEnv,
    *,
    bc_episodes: int,
    bc_epochs: int,
    batch_size: int,
    lr: float,
    greedy_mean: float,
    max_iters: int,
    eval_games: int,
    checkpoint_dir: Path,
    writer: SummaryWriter,
) -> MaskablePPO:
    """
    Iteratively:
      1. Collect greedy trajectories.
      2. Train policy via BC (cross-entropy against greedy actions).
      3. Evaluate; stop when model_mean >= greedy_mean.
    Returns model with BC-pretrained weights.
    """
    device = model.policy.device
    # Separate Adam optimiser — does NOT touch model.policy.optimizer (PPO's)
    bc_optimizer = th.optim.Adam(model.policy.parameters(), lr=lr)
    global_step = 0

    for iteration in range(1, max_iters + 1):
        print(
            f"\n[BC {iteration}/{max_iters}] 데이터 수집 "
            f"({bc_episodes} 에피소드)…",
            flush=True,
        )
        obs_arr, act_arr, mask_arr = _collect_greedy_transitions(env, bc_episodes)

        dataset = _TransitionDataset(obs_arr, act_arr, mask_arr)
        loader = data_utils.DataLoader(dataset, batch_size=batch_size, shuffle=True)
        print(f"  {len(dataset):,} 전이(transition) 수집 완료. 학습 시작…", flush=True)

        log_interval = max(1, bc_epochs // 5)
        for epoch in range(1, bc_epochs + 1):
            loss = _bc_epoch(model.policy, loader, bc_optimizer, device)
            global_step += 1
            writer.add_scalar("bc/loss", loss, global_step)
            if epoch % log_interval == 0:
                print(
                    f"    epoch {epoch:>3d}/{bc_epochs}  loss={loss:.4f}",
                    flush=True,
                )

        # Evaluate: stop when model reaches or exceeds greedy baseline
        scores = evaluate_agent(model, env, eval_games)
        model_mean = float(np.mean(scores))
        diff = model_mean - greedy_mean
        writer.add_scalar("bc/model_mean_score", model_mean, iteration)
        writer.add_scalar("bc/diff_from_greedy", diff, iteration)
        print(
            f"  → model 평균={model_mean:.1f}  "
            f"greedy 평균={greedy_mean:.1f}  "
            f"차이={diff:+.1f}",
            flush=True,
        )

        if model_mean >= greedy_mean:
            print(
                f"  ✓ greedy baseline 도달 (model={model_mean:.1f} >= greedy={greedy_mean:.1f}). "
                f"RL 단계로 전환합니다.",
                flush=True,
            )
            break
    else:
        print(
            f"  BC 최대 반복({max_iters}회) 도달. "
            f"현재 모델로 RL 단계를 시작합니다.",
            flush=True,
        )

    save_path = str(checkpoint_dir / "bc_pretrained")
    model.save(save_path)
    print(f"  BC 사전학습 모델 저장: {save_path}.zip", flush=True)
    return model


# ------------------------------------------------------------------ #
# VecEnv factory (with ActionMasker wrapper for MaskablePPO)
# ------------------------------------------------------------------ #

def _make_env():
    def _init():
        env = YachtDiceEnv()
        return ActionMasker(env, lambda e: e.action_masks())
    return _init


# ------------------------------------------------------------------ #
# Main
# ------------------------------------------------------------------ #

def main(args):
    # Resolve output directories (CLI args override defaults)
    checkpoint_dir = Path(args.checkpoint_dir)
    log_dir = Path(args.log_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)

    # Single unwrapped env for data collection and evaluation
    single_env = YachtDiceEnv()

    # ── Greedy baseline ──────────────────────────────────────────────
    print(f"Greedy baseline 평가 ({args.greedy_eval_games}게임)…", flush=True)
    greedy_scores = evaluate_greedy(single_env, args.greedy_eval_games)
    greedy_mean = float(np.mean(greedy_scores))
    print(
        f"  greedy 평균={greedy_mean:.1f}  "
        f"std={np.std(greedy_scores):.1f}  "
        f"min={int(np.min(greedy_scores))}  "
        f"max={int(np.max(greedy_scores))}",
        flush=True,
    )

    # ── TensorBoard writer ───────────────────────────────────────────
    writer = SummaryWriter(log_dir=str(log_dir / "run"))
    writer.add_scalar("baseline/greedy_mean", greedy_mean, 0)

    # ── MaskablePPO model (BC will pretrain its policy weights) ──────
    vec_env = DummyVecEnv([_make_env()])
    policy_kwargs = dict(net_arch=args.net_arch)
    model = MaskablePPO(
        "MlpPolicy",
        vec_env,
        learning_rate=3e-4,
        n_steps=2048,
        batch_size=256,
        n_epochs=10,
        gamma=1.0,          # no discounting — total score is the objective
        gae_lambda=0.95,
        ent_coef=0.01,
        clip_range=0.2,
        policy_kwargs=policy_kwargs,
        verbose=0,
        tensorboard_log=str(log_dir),
    )
    print(f"\n모델 파라미터 수: {sum(p.numel() for p in model.policy.parameters()):,}", flush=True)

    # ── Phase 1: Behavioural Cloning ─────────────────────────────────
    print("\n" + "=" * 60)
    print("Phase 1: Behavioural Cloning")
    print("=" * 60, flush=True)

    model = run_bc_phase(
        model,
        single_env,
        bc_episodes=args.bc_episodes,
        bc_epochs=args.bc_epochs,
        batch_size=args.bc_batch,
        lr=args.bc_lr,
        greedy_mean=greedy_mean,
        max_iters=args.bc_max_iters,
        eval_games=args.bc_eval_games,
        checkpoint_dir=checkpoint_dir,
        writer=writer,
    )

    # ── Phase 2: MaskablePPO ─────────────────────────────────────────
    print("\n" + "=" * 60)
    print("Phase 2: MaskablePPO RL")
    print("=" * 60, flush=True)

    eval_env = YachtDiceEnv()

    callbacks = [
        CheckpointCallback(
            save_freq=args.ckpt_freq,
            save_path=str(checkpoint_dir),
            name_prefix="rl_model",
            verbose=0,
        ),
        _ScoreLogCallback(
            eval_env,
            eval_freq=args.eval_freq,
            n_eval=args.rl_eval_games,
            verbose=1,
        ),
    ]

    model.learn(
        total_timesteps=args.ppo_steps,
        callback=callbacks,
        reset_num_timesteps=True,
        tb_log_name="ppo",
        progress_bar=False,
    )

    final_path = str(checkpoint_dir / "rl_final")
    model.save(final_path)
    print(f"\n최종 모델 저장: {final_path}.zip", flush=True)

    # ── Final evaluation ─────────────────────────────────────────────
    final_scores = evaluate_agent(model, eval_env, 500)
    print("\n최종 평가 (500게임):", flush=True)
    print(
        f"  RL    평균={np.mean(final_scores):.1f}  "
        f"std={np.std(final_scores):.1f}  "
        f"min={int(np.min(final_scores))}  "
        f"max={int(np.max(final_scores))}",
        flush=True,
    )
    print(f"  Greedy 평균={greedy_mean:.1f}", flush=True)
    writer.add_scalar("eval/rl_final_mean", float(np.mean(final_scores)), args.ppo_steps)
    print(f"\n체크포인트 저장 위치: {checkpoint_dir}", flush=True)
    print(f"TensorBoard 로그 위치: {log_dir}", flush=True)
    writer.close()


# ------------------------------------------------------------------ #
# CLI
# ------------------------------------------------------------------ #

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Yacht Dice BC→PPO trainer")

    # BC hyperparameters
    bc = p.add_argument_group("Behavioural Cloning")
    bc.add_argument(
        "--bc-episodes", type=int, default=500,
        help="greedy episodes to collect per BC iteration (default: 500)",
    )
    bc.add_argument(
        "--bc-epochs", type=int, default=20,
        help="gradient epochs per BC iteration (default: 20)",
    )
    bc.add_argument("--bc-batch", type=int, default=256, help="BC mini-batch size")
    bc.add_argument("--bc-lr", type=float, default=1e-3, help="BC Adam lr")
    bc.add_argument(
        "--bc-max-iters", type=int, default=10,
        help="BC 최대 반복 횟수 (default: 10)",
    )
    bc.add_argument(
        "--bc-eval-games", type=int, default=200,
        help="BC 반복마다 유사도 측정에 사용할 게임 수 (default: 200)",
    )
    bc.add_argument(
        "--greedy-eval-games", type=int, default=200,
        help="greedy baseline 측정 게임 수 (default: 200)",
    )

    # Output paths
    out = p.add_argument_group("Output")
    out.add_argument(
        "--checkpoint-dir", type=str, default=str(CHECKPOINT_DIR),
        help="체크포인트 저장 디렉터리 (default: ./checkpoints)",
    )
    out.add_argument(
        "--log-dir", type=str, default=str(LOG_DIR),
        help="TensorBoard 로그 디렉터리 (default: ./logs)",
    )

    # Model architecture
    arch = p.add_argument_group("Model")
    arch.add_argument(
        "--net-arch", type=lambda s: [int(x) for x in s.split(",")],
        default=[256, 256],
        help="hidden layer sizes, comma-separated (default: 256,256)",
    )

    # PPO hyperparameters
    ppo = p.add_argument_group("PPO")
    ppo.add_argument(
        "--ppo-steps", type=int, default=5_000_000,
        help="총 PPO 학습 스텝 수 (default: 5,000,000)",
    )
    ppo.add_argument(
        "--ckpt-freq", type=int, default=200_000,
        help="체크포인트 저장 주기 (스텝 기준, default: 200,000)",
    )
    ppo.add_argument(
        "--eval-freq", type=int, default=50_000,
        help="평가 주기 (스텝 기준, default: 50,000)",
    )
    ppo.add_argument(
        "--rl-eval-games", type=int, default=100,
        help="PPO 평가마다 사용할 게임 수 (default: 100)",
    )

    main(p.parse_args())
