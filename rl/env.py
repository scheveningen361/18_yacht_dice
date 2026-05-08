"""
env.py — Gymnasium environment for Yacht Dice.

Observation (float32, shape=(32,)):
  [0:5]   dice values normalised: (val - 1) / 5
  [5]     rolls_remaining / 2
  [6:18]  available categories: 12 binary flags
  [18]    upper_sum / 63
  [19:31] potential score per category / 50 (0 if already filled)
  [31]    phase: 0.0 = hold, 1.0 = category

Action (Discrete 32):
  phase=0  →  5-bit bitmask; bit i=1 means hold die i (0–31 all valid)
  phase=1  →  index into CATEGORY_KEYS (0–11); 12–31 masked invalid
"""
import sys
from pathlib import Path

import gymnasium as gym
import numpy as np
from gymnasium import spaces

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from game_logic import CATEGORIES, calculate_score

CATEGORY_KEYS: list[str] = list(CATEGORIES.keys())   # fixed order, 12 entries
NUM_CATEGORIES = 12
NUM_DICE = 5
ACTION_SIZE = 32          # 2^5; also covers 12 category indices
OBS_SIZE = 32

UPPER_CATS = frozenset(["aces", "twos", "threes", "fours", "fives", "sixes"])
UPPER_BONUS_THRESHOLD = 63
UPPER_BONUS_VALUE = 35
MAX_SCORE_NORM = 50.0     # Yacht = 50 pts (global max)


class YachtDiceEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self):
        super().__init__()
        self.action_space = spaces.Discrete(ACTION_SIZE)
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(OBS_SIZE,), dtype=np.float32
        )
        # Mutable state — initialised in reset()
        self.scores: dict[str, int | None] = {}
        self.dice = np.zeros(NUM_DICE, dtype=np.int32)
        self.rolls_remaining: int = 0
        self.phase: int = 0          # 0=hold, 1=category
        self.turn: int = 0
        self.upper_sum: int = 0

    # ------------------------------------------------------------------ #
    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.scores = {cat: None for cat in CATEGORY_KEYS}
        self.upper_sum = 0
        self.turn = 0
        self._start_turn()
        return self._obs(), {}

    def _start_turn(self):
        self.dice = self.np_random.integers(1, 7, size=NUM_DICE).astype(np.int32)
        self.rolls_remaining = 2    # two optional rerolls
        self.phase = 0

    # ------------------------------------------------------------------ #
    def step(self, action: int):
        action = int(action)
        if self.phase == 0:
            return self._hold_step(action)
        return self._category_step(action)

    def _hold_step(self, action: int):
        # Decode bitmask → which dice to hold
        held = np.array([(action >> i) & 1 for i in range(NUM_DICE)], dtype=bool)
        for i in range(NUM_DICE):
            if not held[i]:
                self.dice[i] = self.np_random.integers(1, 7)
        self.rolls_remaining -= 1
        if self.rolls_remaining == 0:
            self.phase = 1
        return self._obs(), 0.0, False, False, {}

    def _category_step(self, action: int):
        cat = CATEGORY_KEYS[action]
        score = calculate_score(cat, self.dice.tolist())
        self.scores[cat] = score

        if cat in UPPER_CATS:
            self.upper_sum += score

        reward = float(score)
        self.turn += 1

        if self.turn >= NUM_CATEGORIES:
            bonus = UPPER_BONUS_VALUE if self.upper_sum >= UPPER_BONUS_THRESHOLD else 0
            reward += bonus
            final = sum(v for v in self.scores.values() if v is not None) + bonus
            return self._obs(), reward, True, False, {"final_score": final}

        self._start_turn()
        return self._obs(), reward, False, False, {}

    # ------------------------------------------------------------------ #
    def action_masks(self) -> np.ndarray:
        mask = np.zeros(ACTION_SIZE, dtype=bool)
        if self.phase == 0:
            mask[:] = True                      # all 32 hold combos valid
        else:
            for i, cat in enumerate(CATEGORY_KEYS):
                if self.scores[cat] is None:
                    mask[i] = True              # actions 12–31 stay False
        return mask

    # ------------------------------------------------------------------ #
    def _obs(self) -> np.ndarray:
        dice_norm = (self.dice - 1) / 5.0

        rolls_norm = np.array([self.rolls_remaining / 2.0], dtype=np.float32)

        cats_avail = np.array(
            [1.0 if self.scores[cat] is None else 0.0 for cat in CATEGORY_KEYS],
            dtype=np.float32,
        )

        upper_norm = np.array([min(self.upper_sum / 63.0, 1.0)], dtype=np.float32)

        dice_list = self.dice.tolist()
        pot_scores = np.array(
            [
                calculate_score(cat, dice_list) / MAX_SCORE_NORM
                if self.scores[cat] is None
                else 0.0
                for cat in CATEGORY_KEYS
            ],
            dtype=np.float32,
        )

        phase_arr = np.array([float(self.phase)], dtype=np.float32)

        return np.concatenate(
            [dice_norm, rolls_norm, cats_avail, upper_norm, pot_scores, phase_arr]
        ).astype(np.float32)

    def render(self):
        pass
