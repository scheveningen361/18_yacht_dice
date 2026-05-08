import type { CategoryKey, ScoreCard, DieValue } from './types'

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  aces: 'Aces',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  four_of_a_kind: 'Four of a Kind',
  full_house: 'Full House',
  little_straight: 'Little Straight',
  big_straight: 'Big Straight',
  yacht: 'Yacht',
  choice: 'Choice',
}

export const CATEGORY_HINTS: Record<CategoryKey, string> = {
  aces: '1의 합',
  twos: '2의 합',
  threes: '3의 합',
  fours: '4의 합',
  fives: '5의 합',
  sixes: '6의 합',
  four_of_a_kind: '같은 숫자 4개 이상 → 전체 합',
  full_house: '3+2 조합 → 전체 합',
  little_straight: '연속 4개 이상 → 15점',
  big_straight: '연속 5개 → 30점',
  yacht: '같은 숫자 5개 → 50점',
  choice: '전체 합 (제약 없음)',
}

export const UPPER_CATEGORIES: CategoryKey[] = ['aces', 'twos', 'threes', 'fours', 'fives', 'sixes']
export const LOWER_CATEGORIES: CategoryKey[] = [
  'four_of_a_kind', 'full_house', 'little_straight', 'big_straight', 'yacht', 'choice',
]
export const ALL_CATEGORIES: CategoryKey[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES]

export const UPPER_BONUS_THRESHOLD = 63
export const UPPER_BONUS_VALUE = 35
export const TOTAL_TURNS = 12

function longestSeq(dice: number[]): number {
  const unique = [...new Set(dice)].sort((a, b) => a - b)
  if (!unique.length) return 0
  let max = 1, cur = 1
  for (let i = 1; i < unique.length; i++) {
    cur = unique[i] === unique[i - 1] + 1 ? cur + 1 : 1
    if (cur > max) max = cur
  }
  return max
}

export function calculateScore(category: CategoryKey, dice: number[]): number {
  const counts = new Map<number, number>()
  let sum = 0
  for (const d of dice) {
    counts.set(d, (counts.get(d) ?? 0) + 1)
    sum += d
  }

  switch (category) {
    case 'aces':   return (counts.get(1) ?? 0) * 1
    case 'twos':   return (counts.get(2) ?? 0) * 2
    case 'threes': return (counts.get(3) ?? 0) * 3
    case 'fours':  return (counts.get(4) ?? 0) * 4
    case 'fives':  return (counts.get(5) ?? 0) * 5
    case 'sixes':  return (counts.get(6) ?? 0) * 6
    case 'four_of_a_kind':
      return [...counts.values()].some(c => c >= 4) ? sum : 0
    case 'full_house': {
      const v = [...counts.values()].sort((a, b) => a - b)
      return v.length === 2 && v[0] === 2 && v[1] === 3 ? sum : 0
    }
    case 'little_straight': return longestSeq(dice) >= 4 ? 15 : 0
    case 'big_straight':    return longestSeq(dice) >= 5 ? 30 : 0
    case 'yacht': return [...counts.values()].some(c => c >= 5) ? 50 : 0
    case 'choice': return sum
  }
}

export function getUpperSubtotal(sc: ScoreCard): number {
  return UPPER_CATEGORIES.reduce((s, c) => s + (sc[c] ?? 0), 0)
}

export function getUpperBonus(sc: ScoreCard): number {
  return getUpperSubtotal(sc) >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS_VALUE : 0
}

export function getLowerTotal(sc: ScoreCard): number {
  return LOWER_CATEGORIES.reduce((s, c) => s + (sc[c] ?? 0), 0)
}

export function getTotalScore(sc: ScoreCard): number {
  return getUpperSubtotal(sc) + getUpperBonus(sc) + getLowerTotal(sc)
}

export function getPotentialScores(
  dice: number[],
  sc: ScoreCard,
): Partial<Record<CategoryKey, number>> {
  const out: Partial<Record<CategoryKey, number>> = {}
  for (const cat of ALL_CATEGORIES) {
    if (!(cat in sc)) out[cat] = calculateScore(cat, dice)
  }
  return out
}

export function rollDie(): DieValue {
  return (Math.floor(Math.random() * 6) + 1) as DieValue
}
