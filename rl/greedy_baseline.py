"""
greedy_baseline.py — greedy hold + greedy category 벤치마크

Usage:
  python -m rl.greedy_baseline
  python -m rl.greedy_baseline --n-games 1000
"""
import argparse
import sys
from pathlib import Path

import numpy as np

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from rl.env import YachtDiceEnv
from rl.evaluate import _greedy_hold, _greedy_category


def run(n_games: int = 500) -> np.ndarray:
    env = YachtDiceEnv()
    scores = []

    for i in range(n_games):
        env.reset()
        done = False
        while not done:
            mask = env.action_masks()
            if env.phase == 0:
                action = _greedy_hold(env)
            else:
                action = _greedy_category(env, mask)
            _, _, done, _, info = env.step(action)
        scores.append(info["final_score"])

        if (i + 1) % max(1, n_games // 10) == 0:
            print(f"  [{i+1:>5d}/{n_games}]  평균 {np.mean(scores):.1f}", flush=True)

    return np.array(scores)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--n-games", type=int, default=500)
    args = p.parse_args()

    print(f"greedy baseline — {args.n_games}게임", flush=True)
    scores = run(args.n_games)
    print(f"\n결과: 평균 {np.mean(scores):.1f}  std {np.std(scores):.1f}  "
          f"min {int(np.min(scores))}  max {int(np.max(scores))}", flush=True)
