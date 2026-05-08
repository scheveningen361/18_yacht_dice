import { useState, useEffect } from 'react'
import type { GameRecord } from '../types'
import { getAllGames, deleteGame, exportData } from '../storage'
import './GameHistory.css'

interface Props {
  onBack: () => void
}

export default function GameHistory({ onBack }: Props) {
  const [games, setGames] = useState<GameRecord[]>([])
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    setGames(getAllGames())
  }, [])

  const handleDelete = (id: string) => {
    if (confirmId === id) {
      deleteGame(id)
      setGames(getAllGames())
      setConfirmId(null)
    } else {
      setConfirmId(id)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  const getRating = (score: number) => {
    if (score >= 300) return { label: '완벽', color: '#a78bfa' }
    if (score >= 250) return { label: '훌륭', color: '#34d399' }
    if (score >= 200) return { label: '양호', color: '#60a5fa' }
    if (score >= 150) return { label: '보통', color: '#94a3b8' }
    return { label: '분발', color: '#f87171' }
  }

  const avg =
    games.length > 0
      ? Math.round(games.reduce((s, g) => s + g.finalScore, 0) / games.length)
      : 0
  const best = games.length > 0 ? Math.max(...games.map(g => g.finalScore)) : 0
  const bonusCount = games.filter(g => g.upperBonus).length

  return (
    <div className="history-screen">
      <header className="history-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          ← 뒤로
        </button>
        <h1 className="history-title">게임 기록</h1>
        <button
          className="btn btn-secondary btn-sm"
          onClick={exportData}
          disabled={games.length === 0}
        >
          JSON 내보내기
        </button>
      </header>

      <div className="history-body">
        {games.length === 0 ? (
          <div className="history-empty">
            <div className="history-empty-icon">📭</div>
            <p className="history-empty-title">기록된 게임이 없습니다</p>
            <p className="history-empty-sub">게임을 완료하면 자동으로 저장됩니다</p>
          </div>
        ) : (
          <>
            <div className="history-stats">
              <div className="stat-card">
                <span className="stat-value">{games.length}</span>
                <span className="stat-label">총 게임</span>
              </div>
              <div className="stat-card">
                <span className="stat-value stat-value--gold">{best}</span>
                <span className="stat-label">최고 점수</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{avg}</span>
                <span className="stat-label">평균 점수</span>
              </div>
              <div className="stat-card">
                <span className="stat-value stat-value--green">{bonusCount}</span>
                <span className="stat-label">보너스 획득</span>
              </div>
            </div>

            <div className="history-list">
              {games.map((game, idx) => {
                const rating = getRating(game.finalScore)
                const isConfirm = confirmId === game.gameId
                return (
                  <div key={game.gameId} className="history-item">
                    <div className="history-item-rank">#{games.length - idx}</div>

                    <div className="history-item-score">
                      <span className="h-score">{game.finalScore}</span>
                      <span className="h-score-unit">점</span>
                    </div>

                    <div className="history-item-info">
                      <div className="h-date">{formatDate(game.playedAt)}</div>
                      <div className="h-badges">
                        <span
                          className="h-rating"
                          style={{ color: rating.color, borderColor: rating.color }}
                        >
                          {rating.label}
                        </span>
                        {game.upperBonus && (
                          <span className="h-bonus">보너스 +35</span>
                        )}
                      </div>
                    </div>

                    <button
                      className={`btn btn-sm ${isConfirm ? 'btn-danger' : 'btn-ghost'}`}
                      onClick={() => handleDelete(game.gameId)}
                      onBlur={() => {
                        if (isConfirm) setConfirmId(null)
                      }}
                    >
                      {isConfirm ? '삭제 확인' : '삭제'}
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
