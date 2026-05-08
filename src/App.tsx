import { useState } from 'react'
import GameBoard from './components/GameBoard'
import GameHistory from './components/GameHistory'
import './App.css'

type View = 'menu' | 'game' | 'history' | 'gameover'

export default function App() {
  const [view, setView] = useState<View>('menu')
  const [lastScore, setLastScore] = useState(0)

  const handleGameOver = (score: number) => {
    setLastScore(score)
    setView('gameover')
  }

  if (view === 'game') {
    return (
      <GameBoard
        onGameOver={handleGameOver}
        onHistory={() => setView('history')}
        onMenu={() => setView('menu')}
      />
    )
  }

  if (view === 'history') {
    return <GameHistory onBack={() => setView('menu')} />
  }

  if (view === 'gameover') {
    const rating =
      lastScore >= 300 ? '⭐⭐⭐  완벽한 플레이!' :
      lastScore >= 250 ? '⭐⭐  훌륭한 플레이!' :
      lastScore >= 200 ? '⭐  좋은 플레이!' :
      '더 잘 할 수 있어요!'

    return (
      <div className="fullscreen-center gameover-bg">
        <div className="panel gameover-panel">
          <div className="panel-icon">🏆</div>
          <h1 className="panel-title">게임 종료!</h1>
          <div className="gameover-score-wrap">
            <span className="gameover-score-label">최종 점수</span>
            <span className="gameover-score">{lastScore}</span>
          </div>
          <p className="gameover-rating">{rating}</p>
          <div className="panel-actions">
            <button className="btn btn-primary btn-lg" onClick={() => setView('game')}>
              다시 시작
            </button>
            <button className="btn btn-secondary" onClick={() => setView('history')}>
              기록 보기
            </button>
            <button className="btn btn-ghost" onClick={() => setView('menu')}>
              메인 메뉴
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Menu
  return (
    <div className="fullscreen-center menu-bg">
      <div className="panel menu-panel">
        <div className="panel-icon menu-icon">🎲</div>
        <h1 className="panel-title menu-title">Yacht Dice</h1>
        <p className="menu-subtitle">
          12개 카테고리 · 상단 63점 이상 시 보너스 +35점
        </p>
        <div className="panel-actions">
          <button className="btn btn-primary btn-lg" onClick={() => setView('game')}>
            게임 시작
          </button>
          <button className="btn btn-secondary" onClick={() => setView('history')}>
            게임 기록 보기
          </button>
        </div>
        <div className="menu-rules">
          <div className="menu-rules-title">게임 방법</div>
          <ul className="menu-rules-list">
            <li>매 턴 주사위를 최대 3번 굴릴 수 있습니다</li>
            <li>원하는 주사위를 HOLD하고 나머지를 다시 굴리세요</li>
            <li>12개 카테고리 중 하나에 점수를 기록하세요</li>
            <li>상단 섹션 합계가 63점 이상이면 보너스 +35점!</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
