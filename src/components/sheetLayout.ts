import {
  MIN_PREVIEW_HEIGHT, SHEET_FULL_TOP_GAP, SHEET_HALF_FRACTION, SHEET_PEEK_HEIGHT, TOPBAR_HEIGHT,
} from '../defaults.ts'

export type SheetSnap = 'peek' | 'half' | 'full'

export const SNAP_ORDER: SheetSnap[] = ['peek', 'half', 'full']

export function getSheetHeights(windowHeight: number): Record<SheetSnap, number> {
  const available = windowHeight - TOPBAR_HEIGHT
  const full = Math.max(SHEET_PEEK_HEIGHT, available - SHEET_FULL_TOP_GAP)
  const half = Math.min(full, Math.max(SHEET_PEEK_HEIGHT, Math.round(available * SHEET_HALF_FRACTION)))
  return { peek: SHEET_PEEK_HEIGHT, half, full }
}

export function getPreviewHeight(windowHeight: number, sheetHeight: number) {
  return Math.max(MIN_PREVIEW_HEIGHT, windowHeight - TOPBAR_HEIGHT - sheetHeight + 12)
}
