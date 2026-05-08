import './Die.css'

interface DieProps {
  value: number | null
  held: boolean
  rolling: boolean
  disabled: boolean
  onClick: () => void
}

const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[30, 30], [50, 50], [70, 70]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
  6: [[30, 28], [70, 28], [30, 50], [70, 50], [30, 72], [70, 72]],
}

export default function Die({ value, held, rolling, disabled, onClick }: DieProps) {
  const dots = value != null ? (DOT_POSITIONS[value] ?? []) : []

  const cls = [
    'die',
    held ? 'die--held' : '',
    rolling ? 'die--rolling' : '',
    disabled ? 'die--disabled' : '',
    value == null ? 'die--empty' : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      className={cls}
      onClick={onClick}
      disabled={disabled}
      title={value == null ? '' : held ? 'HOLD 해제' : '클릭하여 HOLD'}
    >
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        {dots.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={8.5} />
        ))}
      </svg>
      {held && <span className="die-hold-badge">HOLD</span>}
    </button>
  )
}
