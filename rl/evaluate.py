"""
evaluate.py — greedy strategy functions + agent evaluation utilities.

_greedy_hold(env)         → int  hold bitmask (0–31) via EV maximisation
_greedy_category(env, mask) → int  category index (0–11) by highest score
evaluate_greedy(env, n)   → np.ndarray of final scores
evaluate_agent(model, env, n) → np.ndarray of final scores
"""
import sys
from pathlib import Path

import numpy as np

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from game_logic import (
    calculate_expected_value,
    calculate_score,
    get_heuristic_hold_candidates,
)
from rl.env import CATEGORY_KEYS, NUM_DICE


# ------------------------------------------------------------------ #
# Bitmask helper
# ------------------------------------------------------------------ #

def _values_to_bitmask(dice: np.ndarray, values_to_hold: tuple) -> int:
    """
    Map a tuple of die *values* to a die-index bitmask.

    E.g. dice=[3,3,5,2,6], values=(3,3) → bitmask=0b00011=3
    Handles repeated values by consuming each die index at most once.
    """
    remaining = list(values_to_hold)
    bitmask = 0
    used = [False] * NUM_DICE
    for val in remaining:
        for i, d in enumerate(dice.tolist()):
            if not used[i] and d == val:
                bitmask |= 1 << i
                used[i] = True
                break
    return bitmask


# ------------------------------------------------------------------ #
# Greedy strategies
# ------------------------------------------------------------------ #

def _greedy_hold(env) -> int:
    """
    Pick the hold bitmask (0–31) that maximises expected value.
    Uses game_logic heuristic candidates + EV calculation.
    """
    available = [cat for cat in CATEGORY_KEYS if env.scores[cat] is None]
    candidates = get_heuristic_hold_candidates(env.dice.tolist(), available)

    best_ev = -1.0
    best_action = 0     # fallback: reroll all

    for hold_values in candidates:
        ev = calculate_expected_value(hold_values, available)
        if ev > best_ev:
            best_ev = ev
            best_action = _values_to_bitmask(env.dice, hold_values)

    return best_action


def _greedy_category(env, mask: np.ndarray) -> int:
    """
    Pick the available category (0–11) with the highest current score.
    Ties broken by lower index (earlier in CATEGORY_KEYS).
    """
    dice = env.dice.tolist()
    best_score = -1
    best_idx = next(i for i in range(12) if mask[i])   # guaranteed at least one

    for i in range(12):
        if not mask[i]:
            continue
        s = calculate_score(CATEGORY_KEYS[i], dice)
        if s > best_score:
            best_score = s
            best_idx = i

    return best_idx


# ------------------------------------------------------------------ #
# Evaluation helpers
# ------------------------------------------------------------------ #

def evaluate_greedy(env, n_games: int = 200) -> np.ndarray:
    """Run the pure greedy agent for n_games, return array of final scores."""
    scores = []
    for _ in range(n_games):
        env.reset()
        done = False
        while not done:
            mask = env.action_masks()
            action = _greedy_hold(env) if env.phase == 0 else _greedy_category(env, mask)
            _, _, done, _, info = env.step(action)
        scores.append(info["final_score"])
    return np.array(scores, dtype=np.float32)


def evaluate_agent(model, env, n_games: int = 200) -> np.ndarray:
    """Run a trained SB3 model deterministically for n_games, return scores."""
    scores = []
    for _ in range(n_games):
        obs, _ = env.reset()
        done = False
        while not done:
            mask = env.action_masks()
            action, _ = model.predict(obs, action_masks=mask, deterministic=True)
            obs, _, done, _, info = env.step(action)
        scores.append(info["final_score"])
    return np.array(scores, dtype=np.float32)
