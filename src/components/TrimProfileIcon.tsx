import { useMemo } from 'react'
import { type TrimProfile, sampleTrimOffset } from './trimProfiles.ts'

interface TrimProfileIconProps {
  profile: TrimProfile
  size?: number
  color?: string
  selected?: boolean
}

export default function TrimProfileIcon({ profile, size = 28, color = 'currentColor', selected = false }: TrimProfileIconProps) {
  const pathData = useMemo(() => {
    const samples = 48
    const d: string[] = []

    d.push(`M ${1} ${0}`)
    for (let i = 0; i <= samples; i++) {
      const yNorm = 1 - (i / samples)
      const offset = sampleTrimOffset(profile, yNorm)
      const svgX = 1 - offset
      const svgY = i / samples
      d.push(`L ${svgX.toFixed(4)} ${svgY.toFixed(4)}`)
    }
    d.push(`L ${1} ${1}`)
    d.push('Z')
    return d.join(' ')
  }, [profile])

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
      <line
        x1={1} y1={0} x2={1} y2={1}
        stroke={color}
        strokeWidth={0.015}
        strokeDasharray="0.06 0.04"
        opacity={selected ? 0.4 : 0.25}
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