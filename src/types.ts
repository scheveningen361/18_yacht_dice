export type DieValue = 1 | 2 | 3 | 4 | 5 | 6

export type CategoryKey =
  | 'aces' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'four_of_a_kind' | 'full_house' | 'little_straight' | 'big_straight'
  | 'yacht' | 'choice'

export interface DieState {
  value: DieValue | null
  held: boolean
}

export type ScoreCard = Partial<Record<CategoryKey, number>>

export interface RollRecord {
  rollNumber: number
  diceValues: number[]
  heldIndices: number[]
  heldValues: number[]
}

export interface TurnRecord {
  turnNumber: number
  rolls: RollRecord[]
  categoryScored: CategoryKey
  scoreRecorded: number
}

export interface GameRecord {
  gameId: string
  playedAt: string
  finalScore: number
  upperBonus: boolean
  turns: TurnRecord[]
}

export interface StorageData {
  version: string
  games: GameRecord[]
}

// ─── Training data types ────────────────────────────────────────────────────

export interface Phase1Entry {
  rollNumber: number        // 1 or 2  (never 3 — no hold decision after last roll)
  diceValues: number[]      // dice shown to user; sorted ascending on roll 1 only
  prevHeld: (0 | 1)[]      // held state BEFORE this roll (all 0s for roll 1)
  nextHeld: (0 | 1)[]      // hold decision user made AFTER seeing this roll
  recordedScores: Record<CategoryKey, number> // current score card: recorded score, or -1 if not yet filled
}

export interface Phase2Entry {
  diceValues: number[]                        // final dice after roll 3
  categoryScores: Record<CategoryKey, number> // potential score per category; -1 = already recorded
  chosenCategory: CategoryKey
}

export interface TrainingTurn {
  turnNumber: number
  phase1: Phase1Entry[]   // exactly 2 entries (rules require 3 rolls)
  phase2: Phase2Entry
}

export interface TrainingRecord {
  gameId: string
  playedAt: string
  finalScore: number
  turns: TrainingTurn[]
}
