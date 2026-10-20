import { useRef, type ReactNode, type RefObject, type PointerEvent } from 'react'
import { SNAP_ORDER, type SheetSnap } from './sheetLayout.ts'

const DRAG_THRESHOLD = 5

interface DragState {
  pointerId: number
  startY: number
  startHeight: number
  moved: boolean
}

interface ParameterSheetHeaderProps {
  sheetRef: RefObject<HTMLElement | null>
  snap: SheetSnap
  heights: Record<SheetSnap, number>
  onSnapChange: (snap: SheetSnap) => void
  title: string
  subtitle: string
  children: ReactNode
}

export function ParameterSheetHeader({ sheetRef, snap, heights, onSnapChange, title, subtitle, children }: ParameterSheetHeaderProps) {
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.sheet-actions')) return
    const sheet = sheetRef.current
    if (!sheet) return
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: sheet.offsetHeight, moved: false }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const sheet = sheetRef.current
    if (!drag || !sheet || drag.pointerId !== event.pointerId) return
    const deltaY = drag.startY - event.clientY
    if (!drag.moved) {
      if (Math.abs(deltaY) < DRAG_THRESHOLD) return
      drag.moved = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const height = Math.min(heights.full, Math.max(heights.peek, drag.startHeight + deltaY))
    sheet.dataset.dragging = ''
    sheet.style.height = `${height}px`
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const sheet = sheetRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (!drag.moved || !sheet) return
    suppressClickRef.current = true
    const height = sheet.offsetHeight
    const nearest = SNAP_ORDER.reduce((best, candidate) =>
      Math.abs(heights[candidate] - height) < Math.abs(heights[best] - height) ? candidate : best,
    )
    delete sheet.dataset.dragging
    sheet.style.height = ''
    onSnapChange(nearest)
  }

  const handleGrabClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onSnapChange(SNAP_ORDER[(SNAP_ORDER.indexOf(snap) + 1) % SNAP_ORDER.length])
  }

  return (
    <div
      className="sheet-header"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <button
        type="button"
        className="sheet-grab"
        aria-label={snap === 'full' ? 'Collapse parameters' : 'Expand parameters'}
        aria-expanded={snap !== 'peek'}
        onClick={handleGrabClick}
      >
        <span />
      </button>
      <div className="sheet-summary">
        <div className="sheet-summary-text">
          <div className="sheet-title">{title}</div>
          <div className="sheet-subtitle mm-type-small">{subtitle}</div>
        </div>
        <div className="sheet-actions">{children}</div>
      </div>
    </div>
  )
}
