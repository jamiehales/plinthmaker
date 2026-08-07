import type { Shape, RoundStyle, RoundLocation } from './components/geometryBuilder.ts'

export const DEFAULT_SHAPE: Shape = 'rectangle'
export const DEFAULT_WIDTH = 20
export const DEFAULT_DEPTH = 20
export const DEFAULT_HEIGHT = 20
export const DEFAULT_LOCKED_ASPECT = true
export const DEFAULT_ADD_HOLE = false
export const DEFAULT_HOLE_DIAMETER = 4
export const DEFAULT_HOLE_DEPTH = 10
export const DEFAULT_ADD_DRILL_JIG = false
export const DEFAULT_JIG_WALL_SIZE = 2
export const DEFAULT_JIG_HEIGHT = 10
export const DEFAULT_JIG_OVERLAP = 5
export const DEFAULT_JIG_TOLERANCE = 0.1
export const DEFAULT_JIG_LIFT = true
export const DEFAULT_JIG_FLATTEN_TOP = true
export const DEFAULT_ANGLE_TOP = false
export const DEFAULT_TOP_ANGLE = 0 // 30
export const DEFAULT_ROUND_STYLE: RoundStyle = 'fillet'
export const DEFAULT_ROUND_LOCATION: RoundLocation = 'top'
export const DEFAULT_ROUND_SIZE = 0.5
export const DEFAULT_DOWNLOAD_RESOLUTION = 0.05

export const DEFAULT_ADD_SUPPORTS = false
export const DEFAULT_PLINTH_ANGLE = 15
export const DEFAULT_RAISE_BY = 3
export const DEFAULT_SUPPORT_SIZE = 1
export const DEFAULT_SUPPORT_TIP_SIZE = 0.2
export const DEFAULT_SUPPORT_SPACING = 3.5

export const DEFAULT_CONE_START_GAP = 1
export const DEFAULT_RAFT_HEIGHT = 1.5
export const DEFAULT_RAFT_BOTTOM_INSET = 1
export const DEFAULT_SUPPORT_BASE_Y = 1
export const DEFAULT_CONE_TIP_PENETRATION = 0.1
export const DEFAULT_SUPPORT_CAPS = true

export const DEFAULT_RENDER_THROTTLE_MS = 50

export const DRAWER_WIDTH = 500