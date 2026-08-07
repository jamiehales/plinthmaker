export interface TrimHandle { dy: number; dOffset: number }

export interface TrimProfilePoint {
  y: number
  offset: number
  sharp: boolean
  inHandle?: TrimHandle
  outHandle?: TrimHandle
}

export type TrimInterpolation = 'bezier' | 'linear'

export interface TrimProfile {
  id: string
  name: string
  interpolate: TrimInterpolation
  points: TrimProfilePoint[]
}

function autoOutHandle(prev: TrimProfilePoint, cur: TrimProfilePoint, next: TrimProfilePoint): TrimHandle {
  const dy = (next.y - prev.y) / 6
  const dOffset = (next.offset - prev.offset) / 6
  const span = next.y - cur.y
  if (Math.abs(dy) > Math.abs(span) * 0.99) return { dy: span / 3, dOffset: dOffset * (span / 3 / dy) }
  return { dy, dOffset }
}

function autoInHandle(prev: TrimProfilePoint, cur: TrimProfilePoint, next: TrimProfilePoint): TrimHandle {
  const dy = (prev.y - next.y) / 6
  const dOffset = (prev.offset - next.offset) / 6
  const span = cur.y - prev.y
  if (Math.abs(dy) > Math.abs(span) * 0.99) return { dy: -span / 3, dOffset: dOffset * (-span / 3 / dy) }
  return { dy, dOffset }
}

function getOutHandle(pts: TrimProfilePoint[], i: number): TrimHandle {
  const cur = pts[i]
  if (cur.outHandle) return cur.outHandle
  if (i === 0 || i === pts.length - 1) return { dy: 0, dOffset: 0 }
  return autoOutHandle(pts[i - 1], cur, pts[i + 1])
}

function getInHandle(pts: TrimProfilePoint[], i: number): TrimHandle {
  const cur = pts[i]
  if (cur.inHandle) return cur.inHandle
  if (i === 0 || i === pts.length - 1) return { dy: 0, dOffset: 0 }
  return autoInHandle(pts[i - 1], cur, pts[i + 1])
}

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function solveBezierT(target: number, p0: number, p1: number, p2: number, p3: number): number {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    const val = cubicBezier(mid, p0, p1, p2, p3)
    if (Math.abs(val - target) < 1e-7) return mid
    if (val < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function sampleTrimOffset(profile: TrimProfile, yNorm: number): number {
  const pts = profile.points
  if (pts.length === 0) return 0
  const y = Math.max(0, Math.min(1, yNorm))
  if (y <= pts[0].y) return pts[0].offset
  if (y >= pts[pts.length - 1].y) return pts[pts.length - 1].offset

  let seg = 0
  while (seg < pts.length - 1 && pts[seg + 1].y < y) seg++
  const a = pts[seg]
  const b = pts[seg + 1]
  const span = b.y - a.y
  const t = span < 1e-9 ? 0 : (y - a.y) / span

  if (profile.interpolate === 'linear' || (a.sharp && b.sharp)) {
    return lerp(a.offset, b.offset, t)
  }

  const oh = a.sharp ? { dy: 0, dOffset: 0 } : getOutHandle(pts, seg)
  const ih = b.sharp ? { dy: 0, dOffset: 0 } : getInHandle(pts, seg + 1)
  const y0 = a.y
  const y1 = a.y + oh.dy
  const y2 = b.y + ih.dy
  const y3 = b.y
  const bezT = solveBezierT(y, y0, y1, y2, y3)
  const p0 = a.offset
  const p1 = a.offset + oh.dOffset
  const p2 = b.offset + ih.dOffset
  const p3 = b.offset
  return cubicBezier(bezT, p0, p1, p2, p3)
}

export interface TrimSample { y: number; offset: number }

export function sampleTrimRings(profile: TrimProfile, trimHeight: number, segMM: number): TrimSample[] {
  if (trimHeight <= 0) return []
  const pts = profile.points
  if (pts.length === 0) return []
  const samples: TrimSample[] = []
  samples.push({ y: pts[0].y * trimHeight, offset: pts[0].offset })

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const yA = a.y * trimHeight
    const yB = b.y * trimHeight
    const isVertical = Math.abs(b.y - a.y) < 1e-9

    if (profile.interpolate === 'linear' || (a.sharp && b.sharp)) {
      if (!isVertical) {
        if (yA > 1e-6 && Math.abs(yA - samples[samples.length - 1].y) > 1e-6) {
          samples.push({ y: yA, offset: a.offset })
        }
        if (yB > 1e-6 && yB < trimHeight - 1e-6) {
          samples.push({ y: yB, offset: b.offset })
        }
      } else {
        samples.push({ y: yA, offset: a.offset })
        samples.push({ y: yA, offset: b.offset })
      }
    } else {
      const oh = a.sharp ? { dy: 0, dOffset: 0 } : getOutHandle(pts, i)
      const ih = b.sharp ? { dy: 0, dOffset: 0 } : getInHandle(pts, i + 1)
      const dY = (b.y - a.y) * trimHeight
      const dOff = (b.offset - a.offset) * trimHeight
      const ohY = oh.dy * trimHeight
      const ohO = oh.dOffset * trimHeight
      const ihY = ih.dy * trimHeight
      const ihO = ih.dOffset * trimHeight
      const chordLen = Math.hypot(dY, dOff)
      const handleLen = Math.hypot(ohY, ohO) + Math.hypot(ihY, ihO)
      const arcLen = chordLen * 2 + handleLen
      const steps = Math.max(2, Math.ceil(arcLen / Math.max(0.01, segMM)))
      const yMin = Math.min(a.y, b.y)
      const yMax = Math.max(a.y, b.y)
      for (let j = 1; j < steps; j++) {
        const t = j / steps
        const yT = Math.max(yMin, Math.min(yMax, cubicBezier(t, a.y, a.y + oh.dy, b.y + ih.dy, b.y)))
        const offT = cubicBezier(t, a.offset, a.offset + oh.dOffset, b.offset + ih.dOffset, b.offset)
        samples.push({ y: yT * trimHeight, offset: offT })
      }
    }
  }

  const last = pts[pts.length - 1]
  if (Math.abs(last.y * trimHeight - samples[samples.length - 1].y) > 1e-6) {
    samples.push({ y: last.y * trimHeight, offset: last.offset })
  }

  return samples
}

export const TRIM_PROFILES: TrimProfile[] = [
  {
    id: 'quarterCircle',
    name: 'Quarter Circle',
    interpolate: 'bezier',
    points: [
      { y: 0, offset: 1, sharp: false, outHandle: { dy: 0.5523, dOffset: 0 } },
      { y: 1, offset: 0, sharp: false, inHandle: { dy: 0, dOffset: 0.5523 } },
    ],
  },
  {
    id: 'stepped',
    name: 'Stepped',
    interpolate: 'linear',
    points: [
      { y: 0, offset: 1, sharp: true },
      { y: 0.5, offset: 1, sharp: true },
      { y: 0.5, offset: 0.5, sharp: true },
      { y: 1, offset: 0.5, sharp: true },
      { y: 1, offset: 0, sharp: true },
    ],
  },
  {
    id: 'bead',
    name: 'Bead',
    interpolate: 'bezier',
    points: [
      { y: 0, offset: 1, sharp: true },
      { y: 0.1, offset: 1, sharp: true },
      { y: 0.1, offset: 0.9, sharp: true },
      { y: 0.62, offset: 0.59, sharp: false, inHandle: { dy: -0.25, dOffset: 0.25 }, outHandle: { dy: 0.25, dOffset: -0.25 } },
      { y: 0.9, offset: 0.1, sharp: true },
      { y: 1, offset: 0.1, sharp: true },
      { y: 1, offset: 0, sharp: false },
    ],
  },
  {
    id: 'cove',
    name: 'Cove',
    interpolate: 'bezier',
    points: [
      { y: 0, offset: 1, sharp: true },
      { y: 0.1, offset: 1, sharp: false, outHandle: { dy: 0, dOffset: -0.4418 } },
      { y: 1, offset: 0.1, sharp: false, inHandle: { dy: -0.4418, dOffset: 0 } },
      { y: 1, offset: 0, sharp: true },
    ],
  },
  {
    id: 'ogee',
    name: 'Ogee',
    interpolate: 'bezier',
    points: [
      { y: 0, offset: 1, sharp: true },
      { y: 0.1, offset: 1, sharp: true },
      { y: 0.1, offset: 1, sharp: false, outHandle: { dy: 0.2209, dOffset: 0 } },
      { y: 0.5, offset: 0.5, sharp: false, inHandle: { dy: 0, dOffset: 0.2209 }, outHandle: { dy: 0, dOffset: -0.2209 } },
      { y: 0.9, offset: 0, sharp: false, inHandle: { dy: -0.2209, dOffset: 0 } },
      { y: 0.9, offset: 0, sharp: true },
      { y: 1, offset: 0, sharp: true },
    ],
  },
  {
    id: 'romanOgee',
    name: 'Roman Ogee',
    interpolate: 'bezier',
    points: [
      { y: 0, offset: 1, sharp: true },
      { y: 0.16, offset: 1, sharp: true },
      { y: 0.16, offset: 1, sharp: false, outHandle: { dy: 0.1878, dOffset: 0 } },
      { y: 0.54, offset: 0.5, sharp: false, inHandle: { dy: -0.365, dOffset: 0.015 }, outHandle: { dy: 0.4375, dOffset: -0.011 } },
      { y: 1, offset: 0, sharp: true },
    ],
  },
  {
    id: 'roundover',
    name: 'Roundover',
    interpolate: 'bezier',
    points: [
      { y: 0, offset: 1, sharp: true },
      { y: 0.25, offset: 1, sharp: false, inHandle: { dy: -0.09, dOffset: 0 }, outHandle: { dy: 0.38, dOffset: 0 } },
      { y: 1, offset: 0.25, sharp: false, inHandle: { dy: -0.01, dOffset: 0.46 }, outHandle: { dy: 0.015, dOffset: 0 } },
      { y: 1, offset: 0, sharp: true },
    ],
  },
  {
    id: 'custom',
    name: 'Custom',
    interpolate: 'bezier',
    points: [],
  },
]

export const DEFAULT_CUSTOM_TRIM_POINTS: TrimProfilePoint[] = [
  { y: 0, offset: 1, sharp: true },
  { y: 1, offset: 0, sharp: true },
]

export function getTrimProfile(id: string): TrimProfile {
  return TRIM_PROFILES.find((p) => p.id === id) ?? TRIM_PROFILES[0]
}