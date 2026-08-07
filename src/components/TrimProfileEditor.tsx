import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { type TrimProfilePoint, type TrimHandle, sampleTrimOffset } from './trimProfiles.ts'
import { TRIM_HANDLE_SCALE, TRIM_MIN_HANDLE_LEN } from '../defaults.ts'

interface TrimProfileEditorProps {
  points: TrimProfilePoint[]
  onChange: (points: TrimProfilePoint[]) => void
  width?: number
  height?: number
}

const PAD = 16
const HANDLE_R = 4
const POINT_R = 5
const HIT_R = 12
const HANDLE_HIT_R = 10
const HANDLE_SCALE = TRIM_HANDLE_SCALE
const MIN_HANDLE_LEN = TRIM_MIN_HANDLE_LEN

type DragTarget =
  | { type: 'point'; index: number }
  | { type: 'handle'; index: number; which: 'in' | 'out' }
  | null

function handleLen(h: TrimHandle): number {
  return Math.hypot(h.dy, h.dOffset)
}

function clampHandleLen(h: TrimHandle, minLen: number): TrimHandle {
  const len = handleLen(h)
  if (len < 1e-9) return h
  if (len >= minLen) return h
  const s = minLen / len
  return { dy: h.dy * s, dOffset: h.dOffset * s }
}

function defaultHandles(points: TrimProfilePoint[], index: number): { inHandle: TrimHandle; outHandle: TrimHandle } {
  const cur = points[index]
  const prev = index > 0 ? points[index - 1] : undefined
  const next = index < points.length - 1 ? points[index + 1] : undefined
  const spanOut = next ? (next.y - cur.y) / 3 : 0.05
  const spanIn = prev ? (cur.y - prev.y) / 3 : 0.05
  return {
    inHandle: { dy: -Math.max(MIN_HANDLE_LEN, Math.abs(spanIn)) * Math.sign(spanIn || 1), dOffset: 0 },
    outHandle: { dy: Math.max(MIN_HANDLE_LEN, Math.abs(spanOut)) * Math.sign(spanOut || 1), dOffset: 0 },
  }
}

function getDisplayHandle(p: TrimProfilePoint, which: 'in' | 'out'): TrimHandle | undefined {
  const h = which === 'in' ? p.inHandle : p.outHandle
  if (!h) return undefined
  const clamped = clampHandleLen(h, MIN_HANDLE_LEN)
  return { dy: clamped.dy * HANDLE_SCALE, dOffset: clamped.dOffset * HANDLE_SCALE }
}

export default function TrimProfileEditor({ points, onChange, width = 300, height = 240 }: TrimProfileEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragTarget>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [hover, setHover] = useState<DragTarget>(null)
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

  const getMousePos = useCallback((e: { clientX: number; clientY: number }): [number, number] => {
    const svg = svgRef.current
    if (!svg) return [0, 0]
    const rect = svg.getBoundingClientRect()
    const scaleX = width / rect.width
    const scaleY = height / rect.height
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY]
  }, [width, height])

  const profile = useMemo(() => ({ id: 'custom', name: 'Custom', interpolate: 'bezier' as const, points }), [points])

  const curvePath = useMemo(() => {
    const samples = 100
    const d: string[] = []
    for (let i = 0; i <= samples; i++) {
      const yNorm = i / samples
      const offset = sampleTrimOffset(profile, yNorm)
      const [sx, sy] = toSvg(yNorm, offset)
      d.push(`${i === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`)
    }
    return d.join(' ')
  }, [profile, toSvg])

  const findHitTarget = useCallback((sx: number, sy: number): DragTarget => {
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      if (!p.sharp && selected === i) {
        const inH = getDisplayHandle(p, 'in')
        if (inH) {
          const [hx, hy] = toSvg(p.y + inH.dy, p.offset + inH.dOffset)
          if (Math.hypot(sx - hx, sy - hy) <= HANDLE_HIT_R) return { type: 'handle', index: i, which: 'in' }
        }
        const outH = getDisplayHandle(p, 'out')
        if (outH) {
          const [hx, hy] = toSvg(p.y + outH.dy, p.offset + outH.dOffset)
          if (Math.hypot(sx - hx, sy - hy) <= HANDLE_HIT_R) return { type: 'handle', index: i, which: 'out' }
        }
      }
      const [px, py] = toSvg(p.y, p.offset)
      if (Math.hypot(sx - px, sy - py) <= HIT_R) return { type: 'point', index: i }
    }
    return null
  }, [points, toSvg, selected])

  const updateHandle = useCallback((index: number, which: 'in' | 'out', handle: TrimHandle) => {
    const next = [...points]
    next[index] = { ...next[index], [which === 'in' ? 'inHandle' : 'outHandle']: handle }
    onChange(next)
  }, [points, onChange])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const [sx, sy] = getMousePos(e)
    const hit = findHitTarget(sx, sy)
    setDidDrag(false)

    if (e.button === 2) {
      if (hit?.type === 'point' && points.length > 2) {
        const next = points.filter((_, i) => i !== hit.index)
        onChange(next)
        if (selected === hit.index) setSelected(null)
      }
      return
    }

    if (hit) {
      setDrag(hit)
      if (hit.type === 'point') setSelected(hit.index)
    } else {
      const [y, offset] = fromSvg(sx, sy)
      const insertIdx = points.findIndex((p) => p.y > y)
      const newPt: TrimProfilePoint = { y, offset, sharp: false }
      const next = [...points]
      if (insertIdx === -1) next.push(newPt)
      else next.splice(insertIdx, 0, newPt)
      const newIdx = insertIdx === -1 ? next.length - 1 : insertIdx
      const handles = defaultHandles(next, newIdx)
      next[newIdx] = { ...next[newIdx], ...handles }
      onChange(next)
      setSelected(newIdx)
      setDrag({ type: 'point', index: newIdx })
    }
  }, [points, onChange, findHitTarget, fromSvg, getMousePos, selected])

  const doDrag = useCallback((sx: number, sy: number) => {
    if (!drag) return
    setDidDrag(true)

    if (drag.type === 'point') {
      const idx = drag.index
      const [rawY, offset] = fromSvg(sx, sy)
      const next = [...points]
      const isFirst = idx === 0
      const isLast = idx === points.length - 1
      let y: number
      if (isFirst) y = 0
      else if (isLast) y = 1
      else {
        const yMin = next[idx - 1].y + 0.001
        const yMax = next[idx + 1].y - 0.001
        y = Math.max(yMin, Math.min(yMax, rawY))
      }
      next[idx] = { ...next[idx], y, offset }
      onChange(next)
    } else {
      const idx = drag.index
      const p = points[idx]
      const [rawY, offset] = fromSvg(sx, sy)
      let dy = (rawY - p.y) / HANDLE_SCALE
      let dOffset = (offset - p.offset) / HANDLE_SCALE
      const len = Math.hypot(dy, dOffset)
      if (len < MIN_HANDLE_LEN && len > 1e-9) {
        const s = MIN_HANDLE_LEN / len
        dy *= s
        dOffset *= s
      } else if (len <= 1e-9) {
        dy = 0
        dOffset = MIN_HANDLE_LEN
      }
      const handle: TrimHandle = { dy, dOffset }
      updateHandle(idx, drag.which, handle)
    }
  }, [drag, points, onChange, fromSvg, updateHandle])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const [sx, sy] = getMousePos(e)
    setHover(findHitTarget(sx, sy))
    if (!drag) return
    doDrag(sx, sy)
  }, [drag, getMousePos, doDrag, findHitTarget])

  const handleMouseUp = useCallback(() => {
    if (drag?.type === 'point' && !didDrag && selected === drag.index) {
      const next = [...points]
      const wasSharp = next[drag.index].sharp
      next[drag.index] = { ...next[drag.index], sharp: !wasSharp }
      if (wasSharp) {
        const handles = defaultHandles(next, drag.index)
        next[drag.index] = { ...next[drag.index], ...handles }
      }
      onChange(next)
    }
    setDrag(null)
    setDidDrag(false)
  }, [drag, didDrag, points, onChange, selected])

  useEffect(() => {
    if (!drag) return
    const moveHandler = (e: MouseEvent) => {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const scaleX = width / rect.width
      const scaleY = height / rect.height
      const sx = (e.clientX - rect.left) * scaleX
      const sy = (e.clientY - rect.top) * scaleY
      doDrag(sx, sy)
    }
    const upHandler = () => handleMouseUp()
    window.addEventListener('mousemove', moveHandler)
    window.addEventListener('mouseup', upHandler)
    return () => {
      window.removeEventListener('mousemove', moveHandler)
      window.removeEventListener('mouseup', upHandler)
    }
  }, [drag, doDrag, handleMouseUp, width, height])

  const cursor = hover?.type === 'handle' ? 'grab' : hover?.type === 'point' ? 'pointer' : 'crosshair'

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', cursor, userSelect: 'none', touchAction: 'none' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { setHover(null) }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <rect x={PAD} y={PAD} width={plotW} height={plotH} fill="rgba(25, 118, 210, 0.05)" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      <line x1={PAD} y1={height - PAD} x2={width - PAD} y2={height - PAD} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      <line x1={width - PAD} y1={PAD} x2={width - PAD} y2={height - PAD} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="4 3" />
      <path
        d={`${curvePath} L ${width - PAD} ${height - PAD} L ${PAD} ${height - PAD} Z`}
        fill="rgba(25, 118, 210, 0.12)"
        stroke="none"
      />
      <path d={curvePath} fill="none" stroke="#1976d2" strokeWidth={2} strokeLinejoin="round" />

      {points.map((p, i) => {
        const [px, py] = toSvg(p.y, p.offset)
        const isSelected = selected === i
        const isDragging = drag?.type === 'point' && drag.index === i
        const isHovered = hover?.type === 'point' && hover.index === i
        const showHandles = isSelected && !p.sharp
        const inH = showHandles ? getDisplayHandle(p, 'in') : undefined
        const outH = showHandles ? getDisplayHandle(p, 'out') : undefined

        return (
          <g key={i}>
            {inH && (() => {
              const [hx, hy] = toSvg(p.y + inH.dy, p.offset + inH.dOffset)
              const isHandleDrag = drag?.type === 'handle' && drag.index === i && drag.which === 'in'
              const isHandleHover = hover?.type === 'handle' && hover.index === i && hover.which === 'in'
              return (
                <>
                  <line x1={px} y1={py} x2={hx} y2={hy} stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="3 2" />
                  <circle cx={hx} cy={hy} r={HANDLE_R} fill={isHandleDrag ? '#fff' : 'rgba(255,255,255,0.5)'} stroke="#1976d2" strokeWidth={1} opacity={isHandleHover ? 1 : 0.7} />
                </>
              )
            })()}
            {outH && (() => {
              const [ox, oy] = toSvg(p.y + outH.dy, p.offset + outH.dOffset)
              const isOutDrag = drag?.type === 'handle' && drag.index === i && drag.which === 'out'
              const isOutHover = hover?.type === 'handle' && hover.index === i && hover.which === 'out'
              return (
                <>
                  <line x1={px} y1={py} x2={ox} y2={oy} stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="3 2" />
                  <circle cx={ox} cy={oy} r={HANDLE_R} fill={isOutDrag ? '#fff' : 'rgba(255,255,255,0.5)'} stroke="#1976d2" strokeWidth={1} opacity={isOutHover ? 1 : 0.7} />
                </>
              )
            })()}
            {renderPoint(px, py, p.sharp, isDragging || isHovered, isSelected)}
          </g>
        )
      })}

      <text x={PAD} y={height - 3} fontSize={9} fill="rgba(255,255,255,0.4)">bottom</text>
      <text x={width - PAD - 22} y={height - 3} fontSize={9} fill="rgba(255,255,255,0.4)">column</text>
      <text x={3} y={PAD + 4} fontSize={9} fill="rgba(255,255,255,0.4)">top</text>
    </svg>
  )
}

function renderPoint(px: number, py: number, sharp: boolean, active: boolean, selected: boolean): React.ReactElement {
  const r = active ? POINT_R + 1.5 : POINT_R
  const fill = active ? '#fff' : selected ? '#42a5f5' : '#1976d2'
  if (sharp) {
    return (
      <rect
        x={px - r}
        y={py - r}
        width={r * 2}
        height={r * 2}
        fill={fill}
        stroke="#fff"
        strokeWidth={1.5}
      />
    )
  }
  return (
    <circle
      cx={px}
      cy={py}
      r={r}
      fill={fill}
      stroke="#fff"
      strokeWidth={1.5}
    />
  )
}