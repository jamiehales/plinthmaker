import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { type TrimProfilePoint, sampleTrimOffset } from './trimProfiles.ts'

interface TrimProfileEditorProps {
  points: TrimProfilePoint[]
  onChange: (points: TrimProfilePoint[]) => void
  width?: number
  height?: number
}

const PAD = 12
const HANDLE_R = 5
const HIT_R = 12

export default function TrimProfileEditor({ points, onChange, width = 300, height = 220 }: TrimProfileEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [didDrag, setDidDrag] = useState(false)

  const plotW = width - PAD * 2
  const plotH = height - PAD * 2

  const toSvg = useCallback((y: number, offset: number): [number, number] => {
    return [PAD + (1 - offset) * plotW, PAD + (1 - y) * plotH]
  }, [plotW, plotH])

  const fromSvg = useCallback((sx: number, sy: number): [number, number] => {
    const y = 1 - (sy - PAD) / plotH
    const offset = 1 - (sx - PAD) / plotW
    return [Math.max(0, Math.min(1, y)), Math.max(0, Math.min(1, offset))]
  }, [plotW, plotH])

  const getMousePos = useCallback((e: React.MouseEvent): [number, number] => {
    const svg = svgRef.current
    if (!svg) return [0, 0]
    const rect = svg.getBoundingClientRect()
    const scaleX = width / rect.width
    const scaleY = height / rect.height
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY]
  }, [width, height])

  const sortedPoints = useMemo(() => points.map((p, i) => ({ ...p, idx: i })).sort((a, b) => a.y - b.y), [points])

  const curvePath = useMemo(() => {
    const samples = 80
    const d: string[] = []
    for (let i = 0; i <= samples; i++) {
      const yNorm = i / samples
      const offset = sampleTrimOffset({ id: 'custom', name: 'Custom', interpolate: 'catmullRom', points }, yNorm)
      const [sx, sy] = toSvg(yNorm, offset)
      d.push(`${i === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`)
    }
    return d.join(' ')
  }, [points, toSvg])

  const findPointAt = useCallback((sx: number, sy: number): number | null => {
    for (let i = 0; i < points.length; i++) {
      const [px, py] = toSvg(points[i].y, points[i].offset)
      if (Math.hypot(sx - px, sy - py) <= HIT_R) return i
    }
    return null
  }, [points, toSvg])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const [sx, sy] = getMousePos(e)
    const hit = findPointAt(sx, sy)
    setDidDrag(false)

    if (e.button === 2) {
      if (hit !== null && points.length > 2) {
        const next = points.filter((_, i) => i !== hit)
        onChange(next)
      }
      return
    }

    if (hit !== null) {
      setDragIdx(hit)
    } else {
      const [y, offset] = fromSvg(sx, sy)
      const insertIdx = points.findIndex((p) => p.y > y)
      const newPt = { y, offset, sharp: false }
      const next = [...points]
      if (insertIdx === -1) next.push(newPt)
      else next.splice(insertIdx, 0, newPt)
      const newIdx = insertIdx === -1 ? next.length - 1 : insertIdx
      onChange(next)
      setDragIdx(newIdx)
    }
  }, [points, onChange, findPointAt, fromSvg, getMousePos])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragIdx === null) return
    const [sx, sy] = getMousePos(e)
    const [rawY, offset] = fromSvg(sx, sy)
    setDidDrag(true)
    setHoverIdx(dragIdx)
    const next = [...points]
    const isFirst = dragIdx === 0
    const isLast = dragIdx === points.length - 1
    let y: number
    if (isFirst) {
      y = 0
    } else if (isLast) {
      y = 1
    } else {
      const yMin = next[dragIdx - 1].y + 0.001
      const yMax = next[dragIdx + 1].y - 0.001
      y = Math.max(yMin, Math.min(yMax, rawY))
    }
    next[dragIdx] = { ...next[dragIdx], y, offset }
    onChange(next)
  }, [dragIdx, points, onChange, fromSvg, getMousePos])

  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    if (dragIdx === null) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = width / rect.width
    const scaleY = height / rect.height
    const sx = (e.clientX - rect.left) * scaleX
    const sy = (e.clientY - rect.top) * scaleY
    const [rawY, offset] = fromSvg(sx, sy)
    setDidDrag(true)
    const next = [...points]
    const isFirst = dragIdx === 0
    const isLast = dragIdx === points.length - 1
    let y: number
    if (isFirst) {
      y = 0
    } else if (isLast) {
      y = 1
    } else {
      const yMin = next[dragIdx - 1].y + 0.001
      const yMax = next[dragIdx + 1].y - 0.001
      y = Math.max(yMin, Math.min(yMax, rawY))
    }
    next[dragIdx] = { ...next[dragIdx], y, offset }
    onChange(next)
  }, [dragIdx, points, onChange, fromSvg, width, height])

  useEffect(() => {
    if (dragIdx === null) return
    window.addEventListener('mousemove', handleWindowMouseMove)
    return () => window.removeEventListener('mousemove', handleWindowMouseMove)
  }, [dragIdx, handleWindowMouseMove])

  const handleMouseUp = useCallback(() => {
    if (dragIdx !== null && !didDrag) {
      const next = [...points]
      next[dragIdx] = { ...next[dragIdx], sharp: !next[dragIdx].sharp }
      onChange(next)
    }
    setDragIdx(null)
    setDidDrag(false)
  }, [dragIdx, didDrag, points, onChange])

  useEffect(() => {
    if (dragIdx === null) return
    const handler = () => handleMouseUp()
    window.addEventListener('mouseup', handler)
    return () => window.removeEventListener('mouseup', handler)
  }, [dragIdx, handleMouseUp])

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const [sx, sy] = getMousePos(e)
    setHoverIdx(findPointAt(sx, sy))
  }, [getMousePos, findPointAt])

  const handleMouseLeave = useCallback(() => {
    setHoverIdx(null)
    if (dragIdx === null) setDidDrag(false)
  }, [dragIdx])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', cursor: 'crosshair', userSelect: 'none', touchAction: 'none' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      <rect x={PAD} y={PAD} width={plotW} height={plotH} fill="rgba(25, 118, 210, 0.05)" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      <line x1={PAD} y1={height - PAD} x2={width - PAD} y2={height - PAD} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      <line x1={width - PAD} y1={PAD} x2={width - PAD} y2={height - PAD} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="4 3" />
      <path d={curvePath} fill="none" stroke="#1976d2" strokeWidth={2} strokeLinejoin="round" />
      <path
        d={`${curvePath} L ${width - PAD} ${height - PAD} L ${PAD} ${height - PAD} Z`}
        fill="rgba(25, 118, 210, 0.12)"
        stroke="none"
      />
      {sortedPoints.map((p) => {
        const [sx, sy] = toSvg(p.y, p.offset)
        const isDragging = p.idx === dragIdx
        const isHover = p.idx === hoverIdx
        const r = isDragging || isHover ? HANDLE_R + 1 : HANDLE_R
        return (
          <g key={p.idx}>
            {p.sharp ? (
              <rect
                x={sx - r}
                y={sy - r}
                width={r * 2}
                height={r * 2}
                fill={isDragging ? '#fff' : '#1976d2'}
                stroke="#fff"
                strokeWidth={1.5}
              />
            ) : (
              <circle
                cx={sx}
                cy={sy}
                r={r}
                fill={isDragging ? '#fff' : '#1976d2'}
                stroke="#fff"
                strokeWidth={1.5}
              />
            )}
          </g>
        )
      })}
      <text x={PAD} y={height - 2} fontSize={9} fill="rgba(255,255,255,0.4)">bottom</text>
      <text x={width - PAD - 20} y={height - 2} fontSize={9} fill="rgba(255,255,255,0.4)">column</text>
      <text x={2} y={PAD + 4} fontSize={9} fill="rgba(255,255,255,0.4)">top</text>
    </svg>
  )
}