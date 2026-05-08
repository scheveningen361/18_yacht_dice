import type { ScoreCard, CategoryKey } from '../types'
import {
  CATEGORY_LABELS,
  CATEGORY_HINTS,
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  UPPER_BONUS_THRESHOLD,
  UPPER_BONUS_VALUE,
  getUpperSubtotal,
  getUpperBonus,
  getLowerTotal,
  getTotalScore,
} from '../gameLogic'
import './ScoreTable.css'

interface Props {
  scoreCard: ScoreCard
  potentialScores: Partial<Record<CategoryKey, number>> | null
  onRecord: (category: CategoryKey) => void
  canRecord: boolean
}

interface RowProps {
  category: CategoryKey
  scoreCard: ScoreCard
  potential: number | undefined
  onRecord: (cat: CategoryKey) => void
  canRecord: boolean
}

function ScoreRow({ category, scoreCard, potential, onRecord, canRecord }: RowProps) {
  const recorded = scoreCard[category]
  const isRecorded = recorded !== undefined
  const isClickable = !isRecorded && potential !== undefined && canRecord
  const isZeroScore = isClickable && potential === 0

  const rowCls = [
    'sr',
    isRecorded ? 'sr--recorded' : '',
    isClickable && !isZeroScore ? 'sr--available' : '',
    isZeroScore ? 'sr--zero' : '',
  ].filter(Boolean).join(' ')

  return (
    <tr
      className={rowCls}
      onClick={isClickable ? () => onRecord(category) : undefined}
      title={CATEGORY_HINTS[category]}
    >
      <td className="sr-name">
        {isRecorded && <span className="sr-check">✓</span>}
        {CATEGORY_LABELS[category]}
      </td>
      <td className="sr-score">
        {isRecorded ? (
          <span className="sr-val sr-val--recorded">{recorded}</span>
        ) : isClickable ? (
          <span className={`sr-val sr-val--potential ${isZeroScore ? 'sr-val--zero' : ''}`}>
            +{potential}
          </span>
        ) : (
          <span className="sr-val sr-val--empty">—</span>
        )}
      </td>
    </tr>
  )
}

export default function ScoreTable({ scoreCard, potentialScores, onRecord, canRecord }: Props) {
  const upperSub = getUpperSubtotal(scoreCard)
  const bonus = getUpperBonus(scoreCard)
  const lowerTotal = getLowerTotal(scoreCard)
  const total = getTotalScore(scoreCard)
  const bonusEarned = bonus > 0
  const bonusProgress = Math.min(upperSub / UPPER_BONUS_THRESHOLD, 1)
  const bonusNeeded = Math.max(UPPER_BONUS_THRESHOLD - upperSub, 0)

  const upperDone = UPPER_CATEGORIES.filter(c => c in scoreCard).length
  const lowerDone = LOWER_CATEGORIES.filter(c => c in scoreCard).length

  return (
    <div className="score-table-wrap">
      {/* Upper section */}
      <div className="score-section">
        <div className="score-section-head">
          <span className="score-section-title">상단 섹션</span>
          <span className="score-section-meta">{upperDone}/6</span>
        </div>

        <table className="score-tbl">
          <tbody>
            {UPPER_CATEGORIES.map(cat => (
              <ScoreRow
                key={cat}
                category={cat}
                scoreCard={scoreCard}
                potential={potentialScores?.[cat]}
                onRecord={onRecord}
                canRecord={canRecord}
              />
            ))}
          </tbody>
        </table>

        <div className="bonus-block">
          <div className="bonus-bar-wrap">
            <div className="bonus-bar">
              <div
                className={`bonus-fill ${bonusEarned ? 'bonus-fill--done' : ''}`}
                style={{ width: `${bonusProgress * 100}%` }}
              />
            </div>
            <span className="bonus-bar-label">{upperSub} / {UPPER_BONUS_THRESHOLD}</span>
          </div>
          <div className={`bonus-status ${bonusEarned ? 'bonus-status--earned' : ''}`}>
            {bonusEarned
              ? `✅ 보너스 +${UPPER_BONUS_VALUE}점 획득!`
              : `보너스까지 ${bonusNeeded}점 더 필요`}
          </div>
        </div>
      </div>

      {/* Lower section */}
      <div className="score-section">
        <div className="score-section-head">
          <span className="score-section-title">하단 섹션</span>
          <span className="score-section-meta">{lowerDone}/6</span>
        </div>

        <table className="score-tbl">
          <tbody>
            {LOWER_CATEGORIES.map(cat => (
              <ScoreRow
                key={cat}
                category={cat}
                scoreCard={scoreCard}
                potential={potentialScores?.[cat]}
                onRecord={onRecord}
                canRecord={canRecord}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="score-totals">
        <div className="score-total-row">
          <span>상단 소계</span>
          <span>{upperSub}</span>
        </div>
        <div className={`score-total-row ${bonusEarned ? 'score-total-row--bonus' : 'score-total-row--dim'}`}>
          <span>상단 보너스</span>
          <span>{bonusEarned ? `+${UPPER_BONUS_VALUE}` : '—'}</span>
        </div>
        <div className="score-total-row">
          <span>하단 소계</span>
          <span>{lowerTotal}</span>
        </div>
        <div className="score-total-row score-total-row--grand">
          <span>최종 합계</span>
          <span className="score-grand">{total}</span>
        </div>
      </div>
    </div>
  )
}
