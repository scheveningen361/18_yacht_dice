import type {
  GameRecord,
  StorageData,
  CategoryKey,
  TrainingRecord,
  TrainingTurn,
  Phase1Entry,
  Phase2Entry,
} from './types'
import { calculateScore, ALL_CATEGORIES } from './gameLogic'

const KEY = 'yacht_dice_v1'

function load(): StorageData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as StorageData
  } catch { /* empty */ }
  return { version: '1.0', games: [] }
}

function persist(data: StorageData): void {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function getAllGames(): GameRecord[] {
  return [...load().games].sort(
    (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
  )
}

// ─── Training data builder ──────────────────────────────────────────────────

function indicesToBinary(indices: number[]): (0 | 1)[] {
  const b: (0 | 1)[] = [0, 0, 0, 0, 0]
  for (const i of indices) b[i] = 1
  return b
}

function buildTrainingRecord(game: GameRecord): TrainingRecord {
  const turns: TrainingTurn[] = []
  let scoreCardSoFar: Partial<Record<CategoryKey, number>> = {}

  for (const turn of game.turns) {
    const roll1 = turn.rolls.find(r => r.rollNumber === 1)
    const roll2 = turn.rolls.find(r => r.rollNumber === 2)
    const roll3 = turn.rolls.find(r => r.rollNumber === 3)

    // Phase 1 — one entry per hold decision (rolls 1 and 2)
    const phase1: Phase1Entry[] = []

    // recordedScores snapshot: what's filled so far (-1 = not yet recorded)
    const recordedScores = {} as Record<CategoryKey, number>
    for (const cat of ALL_CATEGORIES) {
      recordedScores[cat] = cat in scoreCardSoFar ? scoreCardSoFar[cat]! : -1
    }

    if (roll1) {
      phase1.push({
        rollNumber: 1,
        diceValues: roll1.diceValues,          // sorted ascending (enforced at roll time)
        prevHeld: [0, 0, 0, 0, 0],             // nothing held before first roll
        nextHeld: indicesToBinary(roll1.heldIndices),
        recordedScores,
      })
    }

    if (roll2) {
      phase1.push({
        rollNumber: 2,
        diceValues: roll2.diceValues,
        prevHeld: roll1 ? indicesToBinary(roll1.heldIndices) : [0, 0, 0, 0, 0],
        nextHeld: indicesToBinary(roll2.heldIndices),
        recordedScores,                        // same snapshot — score card doesn't change within a turn
      })
    }

    // Phase 2 — category selection after final roll
    const finalDice = (roll3 ?? roll2 ?? roll1)!.diceValues

    const categoryScores = {} as Record<CategoryKey, number>
    for (const cat of ALL_CATEGORIES) {
      categoryScores[cat] = cat in scoreCardSoFar
        ? -1
        : calculateScore(cat, finalDice)
    }

    const phase2: Phase2Entry = {
      diceValues: finalDice,
      categoryScores,
      chosenCategory: turn.categoryScored,
    }

    turns.push({ turnNumber: turn.turnNumber, phase1, phase2 })
    scoreCardSoFar = { ...scoreCardSoFar, [turn.categoryScored]: turn.scoreRecorded }
  }

  return {
    gameId: game.gameId,
    playedAt: game.playedAt,
    finalScore: game.finalScore,
    turns,
  }
}

// ─── Save ───────────────────────────────────────────────────────────────────

export function saveGame(game: GameRecord): void {
  // 1. localStorage (always)
  const data = load()
  data.games.push(game)
  persist(data)

  // 2. Files via Vite dev-server middleware (fire and forget)
  const trainingRecord = buildTrainingRecord(game)
  fetch('/api/save-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameRecord: game, trainingRecord }),
  }).catch(() => { /* dev server not available in production */ })
}

export function deleteGame(gameId: string): void {
  const data = load()
  data.games = data.games.filter(g => g.gameId !== gameId)
  persist(data)
}

export function exportData(): void {
  const data = load()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `yacht_dice_data_${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
