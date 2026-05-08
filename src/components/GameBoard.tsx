import { useReducer, useEffect, useRef } from 'react'
import type { DieState, ScoreCard, CategoryKey, RollRecord, TurnRecord, GameRecord } from '../types'
import {
  rollDie,
  calculateScore,
  getPotentialScores,
  getTotalScore,
  getUpperSubtotal,
  getUpperBonus,
  TOTAL_TURNS,
} from '../gameLogic'
import { saveGame } from '../storage'
import Die from './Die'
import ScoreTable from './ScoreTable'
import './GameBoard.css'

// ─── State ────────────────────────────────────────────────────────────────────

interface State {
  dice: DieState[]
  scoreCard: ScoreCard
  rollCount: number          // 0 = turn not started, 1‑3 = after nth roll
  turnNumber: number         // 1‑12
  currentRolls: RollRecord[] // rolls accumulated in the current turn
  completedTurns: TurnRecord[]
  isRolling: boolean
  isGameOver: boolean
}

type Action =
  | { type: 'ROLL' }
  | { type: 'FINISH_ROLLING' }
  | { type: 'TOGGLE_HOLD'; index: number }
  | { type: 'RECORD_SCORE'; category: CategoryKey }

const BLANK_DICE: DieState[] = Array.from({ length: 5 }, () => ({ value: null, held: false }))

function init(): State {
  return {
    dice: BLANK_DICE.map(d => ({ ...d })),
    scoreCard: {},
    rollCount: 0,
    turnNumber: 1,
    currentRolls: [],
    completedTurns: [],
    isRolling: false,
    isGameOver: false,
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ROLL': {
      if (state.isRolling || state.rollCount >= 3) return state

      // Save roll record for the dice we've been showing (before rolling again)
      let rolls = state.currentRolls
      if (state.rollCount > 0) {
        const vals = state.dice.map(d => d.value as number)
        const heldIdx = state.dice.map((d, i) => (d.held ? i : -1)).filter(i => i >= 0)
        rolls = [
          ...rolls,
          {
            rollNumber: state.rollCount,
            diceValues: vals,
            heldIndices: heldIdx,
            heldValues: heldIdx.map(i => vals[i]),
          },
        ]
      }

      // Generate new dice — held dice keep their value
      const newDice: DieState[] = state.dice.map(d => ({
        value: state.rollCount === 0 || !d.held ? rollDie() : d.value,
        held: state.rollCount > 0 && d.held,
      }))

      // Sort dice ascending on the very first roll only (for consistent training data)
      if (state.rollCount === 0) {
        newDice.sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
      }

      return {
        ...state,
        dice: newDice,
        rollCount: state.rollCount + 1,
        currentRolls: rolls,
        isRolling: true,
      }
    }

    case 'FINISH_ROLLING':
      return { ...state, isRolling: false }

    case 'TOGGLE_HOLD': {
      if (state.rollCount === 0 || state.rollCount >= 3 || state.isRolling) return state
      const dice = state.dice.map((d, i) =>
        i === action.index ? { ...d, held: !d.held } : d,
      )
      return { ...state, dice }
    }

    case 'RECORD_SCORE': {
      if (state.rollCount === 0 || state.isRolling) return state
      if (state.scoreCard[action.category] !== undefined) return state

      const diceValues = state.dice.map(d => d.value as number)
      const score = calculateScore(action.category, diceValues)

      // Final roll record — player had no more holds to make
      const finalRoll: RollRecord = {
        rollNumber: state.rollCount,
        diceValues,
        heldIndices: [],
        heldValues: [],
      }

      const turn: TurnRecord = {
        turnNumber: state.turnNumber,
        rolls: [...state.currentRolls, finalRoll],
        categoryScored: action.category,
        scoreRecorded: score,
      }

      const newCard: ScoreCard = { ...state.scoreCard, [action.category]: score }
      const isLast = state.turnNumber >= TOTAL_TURNS

      return {
        ...state,
        scoreCard: newCard,
        rollCount: 0,
        turnNumber: state.turnNumber + 1,
        currentRolls: [],
        completedTurns: [...state.completedTurns, turn],
        dice: BLANK_DICE.map(d => ({ ...d })),
        isGameOver: isLast,
      }
    }

    default:
      return state
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onGameOver: (score: number) => void
  onHistory: () => void
  onMenu: () => void
}

export default function GameBoard({ onGameOver, onHistory, onMenu }: Props) {
  const [state, dispatch] = useReducer(reducer, undefined, init)
  const savedRef = useRef(false)
  const onGameOverRef = useRef(onGameOver)
  onGameOverRef.current = onGameOver

  // Resolve rolling animation
  useEffect(() => {
    if (!state.isRolling) return
    const t = setTimeout(() => dispatch({ type: 'FINISH_ROLLING' }), 580)
    return () => clearTimeout(t)
  }, [state.isRolling, state.rollCount])

  // Save & navigate when game ends
  useEffect(() => {
    if (!state.isGameOver || savedRef.current) return
    savedRef.current = true

    const sc = state.scoreCard
    const record: GameRecord = {
      gameId: crypto.randomUUID(),
      playedAt: new Date().toISOString(),
      finalScore: getTotalScore(sc),
      upperBonus: getUpperBonus(sc) > 0,
      turns: state.completedTurns,
    }
    saveGame(record)
    onGameOverRef.current(record.finalScore)
  }, [state.isGameOver, state.scoreCard, state.completedTurns])

  // Derived values
  const diceVals = state.dice.map(d => d.value as number)
  const allRolled = diceVals.every(v => v != null)
  const potentials =
    state.rollCount >= 3 && !state.isRolling && allRolled
      ? getPotentialScores(diceVals, state.scoreCard)
      : null

  const rollsLeft = 3 - state.rollCount
  const canRoll = state.rollCount < 3 && !state.isRolling
  const canRecord = state.rollCount >= 3 && !state.isRolling  // must use all 3 rolls
  const mustRecord = state.rollCount >= 3 && !state.isRolling

  const upperSub = getUpperSubtotal(state.scoreCard)
  const total = getTotalScore(state.scoreCard)

  return (
    <div className="board">
      {/* ── Header ── */}
      <header className="board-header">
        <button className="btn btn-ghost btn-sm" onClick={onMenu}>← 메뉴</button>

        <div className="board-header-center">
          <span className="board-turn">
            턴&nbsp;
            <strong>{Math.min(state.turnNumber, TOTAL_TURNS)}</strong>
            &nbsp;/&nbsp;{TOTAL_TURNS}
          </span>

          {state.rollCount > 0 && (
            <div className="board-roll-info">
              <div className="roll-pips">
                {Array.from({ length: 3 }, (_, i) => (
                  <span
                    key={i}
                    className={`roll-pip ${i < state.rollCount ? 'roll-pip--used' : ''}`}
                  />
                ))}
              </div>
              <span className={`board-roll-hint ${mustRecord ? 'board-roll-hint--must' : ''}`}>
                {mustRecord ? '카테고리를 선택하세요' : `재굴림 ${rollsLeft}번 남음`}
              </span>
            </div>
          )}
        </div>

        <div className="board-header-right">
          <span className="board-total">{total}점</span>
          <button className="btn btn-ghost btn-sm" onClick={onHistory}>기록</button>
        </div>
      </header>

      {/* ── Main content ── */}
      <div className="board-content">
        {/* Left: score table */}
        <div className="board-left">
          <ScoreTable
            scoreCard={state.scoreCard}
            potentialScores={potentials}
            onRecord={cat => canRecord && dispatch({ type: 'RECORD_SCORE', category: cat })}
            canRecord={canRecord}
          />
        </div>

        {/* Right: dice + roll button */}
        <div className="board-right">
          <div className="dice-area">
            <div className="dice-row">
              {state.dice.map((die, i) => (
                <Die
                  key={i}
                  value={die.value}
                  held={die.held}
                  rolling={state.isRolling && !die.held}
                  disabled={
                    state.rollCount === 0 || state.rollCount >= 3 || state.isRolling
                  }
                  onClick={() => dispatch({ type: 'TOGGLE_HOLD', index: i })}
                />
              ))}
            </div>

            {state.rollCount > 0 && state.rollCount < 3 && !state.isRolling && (
              <p className="dice-hint">주사위 클릭 → HOLD / HOLD 해제</p>
            )}
          </div>

          <div className="roll-btn-area">
            <button
              className={`btn btn-primary btn-xl roll-btn ${state.isRolling ? 'roll-btn--active' : ''}`}
              onClick={() => canRoll && dispatch({ type: 'ROLL' })}
              disabled={!canRoll}
            >
              {state.isRolling
                ? '굴리는 중…'
                : state.rollCount === 0
                  ? '🎲  주사위 굴리기'
                  : rollsLeft > 0
                    ? `🎲  다시 굴리기 (${rollsLeft}번 남음)`
                    : '← 카테고리를 선택하세요'}
            </button>
          </div>

          {/* Upper bonus mini-bar on the left panel */}
          <div className="board-bonus-hint">
            <span className="board-bonus-label">
              상단 보너스 목표 ({upperSub} / 63)
            </span>
            <div className="board-bonus-bar">
              <div
                className={`board-bonus-fill ${upperSub >= 63 ? 'board-bonus-fill--done' : ''}`}
                style={{ width: `${Math.min(upperSub / 63, 1) * 100}%` }}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
