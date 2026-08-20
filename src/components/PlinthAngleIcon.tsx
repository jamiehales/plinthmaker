import { useMemo } from 'react'

interface PlinthAngleIconProps {
  angle: number
  size?: number
  color?: string
  selected?: boolean
}

export default function PlinthAngleIcon({ angle, size = 22, color = 'currentColor', selected = false }: PlinthAngleIconProps) {
  const pathData = useMemo(() => {
    const angleRad = (angle * Math.PI) / 180
    const tanA = Math.min(1, Math.tan(angleRad))
    const x0 = 0, y0 = 1
    const x1 = 0, y1 = tanA
    const x2 = 1, y2 = 0
    const x3 = 1, y3 = 1
    return `M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2.toFixed(4)} L ${x3} ${y3} Z`
  }, [angle])

  return (
    <svg
      width={size}
      height={size * 1.1}
      viewBox="0 0 1 1.1"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      <line
        x1={0} y1={1} x2={1} y2={1}
        stroke={color}
        strokeWidth={0.02}
        strokeLinecap="round"
        opacity={selected ? 0.5 : 0.3}
      />
      <path
        d={pathData}
        fill={color}
        opacity={selected ? 0.9 : 0.7}
        stroke={color}
        strokeWidth={0.015}
        strokeLinejoin="round"
      />
    </svg>
  )
}