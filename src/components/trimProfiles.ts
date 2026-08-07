export interface TrimProfilePoint {
  y: number
  offset: number
  sharp: boolean
}

export type TrimInterpolation = 'linear' | 'catmullRom'

export interface TrimProfile {
  id: string
  name: string
  interpolate: TrimInterpolation
  points: TrimProfilePoint[]
}

export const TRIM_PROFILES: TrimProfile[] = [
  {
    id: 'quarterCircle',
    name: 'Quarter Circle',
    interpolate: 'linear',
    points: [
      { y: 0, offset: 1, sharp: false },
      { y: 0.1, offset: 0.995, sharp: false },
      { y: 0.2, offset: 0.98, sharp: false },
      { y: 0.3, offset: 0.954, sharp: false },
      { y: 0.4, offset: 0.917, sharp: false },
      { y: 0.5, offset: 0.866, sharp: false },
      { y: 0.6, offset: 0.8, sharp: false },
      { y: 0.7, offset: 0.714, sharp: false },
      { y: 0.8, offset: 0.6, sharp: false },
      { y: 0.9, offset: 0.436, sharp: false },
      { y: 1, offset: 0, sharp: false },
    ],
  },
  {
    id: 'stepped2',
    name: 'Stepped (2)',
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
    interpolate: 'catmullRom',
    points: [
      { y: 0, offset: 1, sharp: true },
      { y: 0.1, offset: 1, sharp: true },
      { y: 0.12, offset: 0.97, sharp: false },
      { y: 0.18, offset: 0.917, sharp: false },
      { y: 0.28, offset: 0.8, sharp: false },
      { y: 0.38, offset: 0.7, sharp: false },
      { y: 0.5, offset: 0.6, sharp: false },
      { y: 0.62, offset: 0.5, sharp: false },
      { y: 0.72, offset: 0.3, sharp: false },
      { y: 0.82, offset: 0.08, sharp: false },
      { y: 0.88, offset: 0.03, sharp: false },
      { y: 0.9, offset: 0, sharp: true },
      { y: 1, offset: 0, sharp: false },
    ],
  },
  {
    id: 'cove',
    name: 'Cove',
    interpolate: 'catmullRom',
    points: [
      { y: 0, offset: 1, sharp: true },
      { y: 0.1, offset: 1, sharp: true },
      { y: 0.12, offset: 0.97, sharp: false },
      { y: 0.2, offset: 0.8, sharp: false },
      { y: 0.3, offset: 0.5, sharp: false },
      { y: 0.4, offset: 0.2, sharp: false },
      { y: 0.5, offset: 0.08, sharp: false },
      { y: 0.6, offset: 0.03, sharp: false },
      { y: 0.7, offset: 0.005, sharp: false },
      { y: 0.8, offset: 0, sharp: true },
      { y: 1, offset: 0, sharp: false },
    ],
  },
  {
    id: 'ogee',
    name: 'Ogee',
    interpolate: 'catmullRom',
    points: [
      { y: 0, offset: 1, sharp: true },
      { y: 0.1, offset: 1, sharp: true },
      { y: 0.12, offset: 0.98, sharp: false },
      { y: 0.2, offset: 0.93, sharp: false },
      { y: 0.3, offset: 0.8, sharp: false },
      { y: 0.42, offset: 0.5, sharp: false },
      { y: 0.5, offset: 0.3, sharp: false },
      { y: 0.6, offset: 0.1, sharp: false },
      { y: 0.7, offset: 0.03, sharp: false },
      { y: 0.8, offset: 0.005, sharp: false },
      { y: 0.85, offset: 0, sharp: true },
      { y: 1, offset: 0, sharp: false },
    ],
  },
  {
    id: 'romanOgee',
    name: 'Roman Ogee',
    interpolate: 'catmullRom',
    points: [
      { y: 0, offset: 1, sharp: true },
      { y: 0.08, offset: 1, sharp: true },
      { y: 0.1, offset: 0.98, sharp: false },
      { y: 0.18, offset: 0.93, sharp: false },
      { y: 0.28, offset: 0.8, sharp: false },
      { y: 0.4, offset: 0.5, sharp: false },
      { y: 0.5, offset: 0.25, sharp: false },
      { y: 0.6, offset: 0.1, sharp: false },
      { y: 0.7, offset: 0.04, sharp: false },
      { y: 0.76, offset: 0.03, sharp: true },
      { y: 0.82, offset: 0.03, sharp: true },
      { y: 0.85, offset: 0, sharp: true },
      { y: 1, offset: 0, sharp: false },
    ],
  },
  {
    id: 'frenchProvincial',
    name: 'French Provincial',
    interpolate: 'catmullRom',
    points: [
      { y: 0, offset: 1, sharp: true },
      { y: 0.08, offset: 1, sharp: true },
      { y: 0.1, offset: 0.97, sharp: false },
      { y: 0.18, offset: 0.9, sharp: false },
      { y: 0.28, offset: 0.7, sharp: false },
      { y: 0.38, offset: 0.5, sharp: false },
      { y: 0.42, offset: 0.35, sharp: true },
      { y: 0.48, offset: 0.2, sharp: false },
      { y: 0.58, offset: 0.08, sharp: false },
      { y: 0.68, offset: 0.03, sharp: false },
      { y: 0.78, offset: 0.005, sharp: false },
      { y: 0.85, offset: 0, sharp: true },
      { y: 1, offset: 0, sharp: false },
    ],
  },
  {
    id: 'roundover',
    name: 'Roundover',
    interpolate: 'catmullRom',
    points: [
      { y: 0, offset: 1, sharp: true },
      { y: 0.55, offset: 1, sharp: true },
      { y: 0.6, offset: 0.995, sharp: false },
      { y: 0.65, offset: 0.97, sharp: false },
      { y: 0.7, offset: 0.93, sharp: false },
      { y: 0.75, offset: 0.866, sharp: false },
      { y: 0.8, offset: 0.78, sharp: false },
      { y: 0.85, offset: 0.66, sharp: false },
      { y: 0.9, offset: 0.5, sharp: false },
      { y: 0.93, offset: 0.3, sharp: false },
      { y: 0.96, offset: 0.1, sharp: false },
      { y: 0.98, offset: 0.02, sharp: false },
      { y: 1, offset: 0, sharp: false },
    ],
  },
  {
    id: 'custom',
    name: 'Custom',
    interpolate: 'catmullRom',
    points: [],
  },
]

export const DEFAULT_CUSTOM_TRIM_POINTS: TrimProfilePoint[] = [
  { y: 0, offset: 1, sharp: true },
  { y: 0.1, offset: 1, sharp: true },
  { y: 0.12, offset: 0.98, sharp: false },
  { y: 0.3, offset: 0.8, sharp: false },
  { y: 0.5, offset: 0.5, sharp: false },
  { y: 0.7, offset: 0.2, sharp: false },
  { y: 0.85, offset: 0, sharp: true },
  { y: 1, offset: 0, sharp: false },
]

export function getTrimProfile(id: string): TrimProfile {
  return TRIM_PROFILES.find((p) => p.id === id) ?? TRIM_PROFILES[0]
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  )
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
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

  if (a.sharp || b.sharp || profile.interpolate === 'linear') {
    return lerp(a.offset, b.offset, t)
  }

  const n = pts.length
  const p0 = pts[(seg - 1 + n) % n]
  const p3 = pts[(seg + 2) % n]
  return catmullRom(p0.offset, a.offset, b.offset, p3.offset, t)
}

export interface TrimSample { y: number; offset: number }

export function sampleTrimRings(profile: TrimProfile, trimHeight: number, segMM: number): TrimSample[] {
  if (trimHeight <= 0) return []
  const pts = profile.points
  const samples: TrimSample[] = []
  samples.push({ y: pts[0].y * trimHeight, offset: pts[0].offset })

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const yA = a.y * trimHeight
    const yB = b.y * trimHeight
    const isVertical = Math.abs(b.y - a.y) < 1e-9

    if (a.sharp || b.sharp) {
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
      const arcLen = Math.hypot(yB - yA, (b.offset - a.offset) * trimHeight)
      const steps = Math.max(2, Math.ceil(arcLen / Math.max(0.01, segMM)))
      for (let j = 1; j < steps; j++) {
        const t = j / steps
        const yT = a.y + (b.y - a.y) * t
        samples.push({ y: yT * trimHeight, offset: sampleTrimOffset(profile, yT) })
      }
    }
  }

  const last = pts[pts.length - 1]
  if (Math.abs(last.y * trimHeight - samples[samples.length - 1].y) > 1e-6) {
    samples.push({ y: last.y * trimHeight, offset: last.offset })
  }

  return samples
}