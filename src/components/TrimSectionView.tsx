import { useMemo } from 'react'
import { traceSections, type TrimSection } from './trimSections.ts'

interface TrimSectionViewProps {
  sections: TrimSection[]
  trimHeight: number
  trimSize: number
  selectedIndex: number
}

const VIEW_WIDTH = 466
const VIEW_HEIGHT = 180
const PAD_LEFT = 14
const PAD_RIGHT = 64
const PAD_TOP = 20
const PAD_BOTTOM = 30
const BODY_WIDTH = 3

function formatMM(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)} mm`
}

export default function TrimSectionView({ sections, trimHeight, trimSize, selectedIndex }: TrimSectionViewProps) {
  const drawing = useMemo(() => {
    const traced = traceSections(sections).map((point) => ({ ...point, y: point.y * trimHeight, offset: point.offset * trimSize }))
    const viewOut = Math.max(trimSize, 1) + 1.5
    const viewHeight = Math.max(trimHeight, 1) + 2
    const scale = Math.min((VIEW_WIDTH - PAD_LEFT - PAD_RIGHT) / (BODY_WIDTH + viewOut), (VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM) / viewHeight)
    const originX = PAD_LEFT + BODY_WIDTH * scale
    const floorY = VIEW_HEIGHT - PAD_BOTTOM
    const toX = (offset: number) => originX + offset * scale
    const toY = (y: number) => floorY - y * scale
    const format = (value: number) => value.toFixed(1)

    let minorGrid = ''
    let majorGrid = ''
    for (let line = -BODY_WIDTH; line <= Math.floor(viewOut); line++) {
      const segment = `M${format(toX(line))} ${format(toY(0))}V${format(toY(viewHeight))}`
      if (line % 5 === 0) majorGrid += segment
      else minorGrid += segment
    }
    for (let line = 0; line <= Math.floor(viewHeight); line++) {
      const segment = `M${format(toX(-BODY_WIDTH))} ${format(toY(line))}H${format(toX(viewOut))}`
      if (line % 5 === 0) majorGrid += segment
      else minorGrid += segment
    }

    const outline = traced.map((point, index) => `${index ? 'L' : 'M'}${format(toX(point.offset))} ${format(toY(point.y))}`).join('')
    const bodyWall = `M${format(toX(0))} ${format(toY(trimHeight))}V${format(toY(viewHeight))}`
    const material = `M${format(toX(-BODY_WIDTH))} ${format(toY(0))}${outline.replace(/^M/, 'L')}L${format(toX(0))} ${format(toY(viewHeight))}L${format(toX(-BODY_WIDTH))} ${format(toY(viewHeight))}Z`

    const firstSelected = traced.findIndex((point) => point.section === selectedIndex)
    const highlight = firstSelected > 0
      ? [traced[firstSelected - 1], ...traced.filter((point) => point.section === selectedIndex)]
        .map((point, index) => `${index ? 'L' : 'M'}${format(toX(point.offset))} ${format(toY(point.y))}`).join('')
      : ''

    const dimensionX = toX(trimSize) + 16
    const dimensions = `M${format(dimensionX)} ${format(toY(0))}V${format(toY(trimHeight))}`
      + `M${format(dimensionX - 4)} ${format(toY(0))}h8M${format(dimensionX - 4)} ${format(toY(trimHeight))}h8`
      + `M${format(toX(0))} ${format(floorY + 12)}H${format(toX(trimSize))}`
      + `M${format(toX(0))} ${format(floorY + 8)}v8M${format(toX(trimSize))} ${format(floorY + 8)}v8`

    return {
      minorGrid,
      majorGrid,
      outline,
      bodyWall,
      material,
      highlight,
      dimensions,
      floorStart: toX(-BODY_WIDTH),
      floorEnd: toX(viewOut),
      floorY,
      heightLabelX: dimensionX + 6,
      heightLabelY: toY(trimHeight / 2) + 4,
      depthLabelX: (toX(0) + toX(trimSize)) / 2,
      depthLabelY: floorY + 26,
    }
  }, [sections, trimHeight, trimSize, selectedIndex])

  return (
    <div className="trim-section-view">
      <svg
        width="100%"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={`Cross-section of the trim at 1:1, ${formatMM(trimHeight)} tall and ${formatMM(trimSize)} deep`}
        style={{ display: 'block' }}
      >
        <path d={drawing.minorGrid} fill="none" stroke="var(--muted)" strokeWidth={1} />
        <path d={drawing.majorGrid} fill="none" stroke="var(--border)" strokeWidth={1} />
        <path d={drawing.material} fill="var(--secondary)" />
        <path d={drawing.bodyWall} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.5} />
        <path d={drawing.outline} fill="none" stroke="var(--primary-text)" strokeWidth={2} strokeLinejoin="round" />
        {drawing.highlight ? (
          <path d={drawing.highlight} fill="none" stroke="var(--brass)" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        <line x1={drawing.floorStart} y1={drawing.floorY} x2={drawing.floorEnd} y2={drawing.floorY} stroke="var(--muted-foreground)" strokeWidth={1} />
        <path d={drawing.dimensions} fill="none" stroke="var(--muted-foreground)" strokeWidth={1} />
        <text x={drawing.heightLabelX} y={drawing.heightLabelY} className="trim-section-label">{formatMM(trimHeight)}</text>
        <text x={drawing.depthLabelX} y={drawing.depthLabelY} textAnchor="middle" className="trim-section-label">{formatMM(trimSize)}</text>
        <text x={8} y={14} className="trim-section-caption">1:1 section · 1 mm grid</text>
      </svg>
    </div>
  )
}
