import type { Shape, RoundStyle, RoundLocation } from './components/geometryBuilder.ts'

export const DEFAULT_SHAPE: Shape = 'rectangle'
export const DEFAULT_WIDTH = 40
export const DEFAULT_DEPTH = 40
export const DEFAULT_HEIGHT = 40
export const DEFAULT_LOCKED_ASPECT = true
export const DEFAULT_ADD_HOLE = false
export const DEFAULT_HOLE_DIAMETER = 2
export const DEFAULT_HOLE_DEPTH = 15
export const DEFAULT_ADD_DRILL_JIG = false
export const DEFAULT_JIG_WALL_SIZE = 2
export const DEFAULT_JIG_HEIGHT = 10
export const DEFAULT_JIG_OVERLAP = 5
export const DEFAULT_JIG_TOLERANCE = 0.1
export const DEFAULT_JIG_LIFT = true
export const DEFAULT_JIG_FLATTEN_TOP = true
export const DEFAULT_ANGLE_TOP = false
export const DEFAULT_TOP_ANGLE = 0 // 30
export const TOP_ANGLE_PRESETS = [0, 20, 25, 30, 35, 40] as const
export const DEFAULT_ROUND_STYLE: RoundStyle = 'fillet'
export const DEFAULT_ROUND_LOCATION: RoundLocation = 'top'
export const DEFAULT_ROUND_SIZE = 0.5
export const DEFAULT_DOWNLOAD_RESOLUTION = 0.05

export const DEFAULT_MIN_HOLE_DIAMETER = 2
export const DEFAULT_MAX_HOLE_DIAMETER = 10

export const DEFAULT_HOLLOW_ENABLED = false
export const DEFAULT_HOLLOW_TOP_THICKNESS = 10
export const DEFAULT_HOLLOW_WALL_THICKNESS = 10
export const DEFAULT_HOLLOW_SEGMENT_MM = 10
export const DEFAULT_SUCTION_HOLE_ENABLED = true
export const DEFAULT_SUCTION_HOLE_DIAMETER = 3

export const DEFAULT_ADD_SUPPORTS = false
export const DEFAULT_PLINTH_ANGLE = 15
export const DEFAULT_RAISE_BY = 3
export const DEFAULT_SUPPORT_SIZE = 1
export const DEFAULT_SUPPORT_TIP_SIZE = 0.5
export const DEFAULT_SUPPORT_SPACING = 3
export const DEFAULT_INTERIOR_SPACING = 2
export const DEFAULT_LOCK_EDGE_SPACING_FILL = false

export const DEFAULT_CONE_START_GAP = 1
export const DEFAULT_RAFT_HEIGHT = 1
export const MIN_RAFT_HEIGHT = 0.25
export const MAX_RAFT_HEIGHT = 2
export const DEFAULT_RAFT_BOTTOM_INSET = 1
export const DEFAULT_SUPPORT_BASE_Y = 1
export const DEFAULT_CONE_TIP_PENETRATION = 0.1
export const DEFAULT_SUPPORT_OFFSET_EDGE = 0
export const DEFAULT_SUPPORT_OFFSET_CAVITY = -1
export const DEFAULT_SUPPORT_CAPS = true

export const DEFAULT_SCAFFOLDING_ENABLED = true
export const DEFAULT_SCAFFOLDING_ANGLE = 60
export const DEFAULT_SCAFFOLDING_SCALE = 0.5
export const DEFAULT_SCAFFOLDING_GAP_TOLERANCE = 1
export const SHOW_SCAFFOLDING_IN_PREVIEW = true

export const DEFAULT_RENDER_THROTTLE_MS = 50

export const DEFAULT_TRIM_ENABLED = false
export const DEFAULT_TRIM_PROFILE_ID = 'bead'
export const DEFAULT_TRIM_HEIGHT = 6
export const DEFAULT_TRIM_SIZE = 6
export { DEFAULT_CUSTOM_TRIM_POINTS } from './components/trimProfiles.ts'

export const TRIM_HANDLE_SCALE = 1
export const TRIM_MIN_HANDLE_LEN = 0.03

export const DRAWER_WIDTH = 500