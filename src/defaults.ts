import type { Shape, RoundStyle, RoundLocation } from './components/geometryBuilder.ts'

export const DEFAULT_SHAPE: Shape = 'rectangle'
export const DEFAULT_NGON_SIDES = 6
export const MIN_NGON_SIDES = 3
export const MAX_NGON_SIDES = 20
export const DEFAULT_WIDTH = 40
export const DEFAULT_DEPTH = 40
export const DEFAULT_HEIGHT = 40
export const DEFAULT_LOCKED_ASPECT = true
export const DEFAULT_ADD_HOLE = false
export const DEFAULT_HOLE_DIAMETER = 2
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
export const TOP_ANGLE_PRESETS = [0, 20, 25, 30, 35, 40] as const
export const DEFAULT_ROUND_STYLE: RoundStyle = 'fillet'
export const DEFAULT_ROUND_LOCATION: RoundLocation = 'top'
export const DEFAULT_ROUND_SIZE = 0.5
export const DEFAULT_DOWNLOAD_RESOLUTION = 0.2

export const DEFAULT_MIN_HOLE_DIAMETER = 2
export const DEFAULT_MAX_HOLE_DIAMETER = 10

export const DEFAULT_HOLLOW_ENABLED = false
export const DEFAULT_HOLLOW_TOP_THICKNESS = 12
export const DEFAULT_HOLLOW_WALL_THICKNESS = 6
export const DEFAULT_HOLLOW_SEGMENT_MM = 10
export const DEFAULT_SUCTION_HOLE_ENABLED = true
export const DEFAULT_SUCTION_HOLE_DIAMETER = 3
export const MAX_SUCTION_HOLE_DIAMETER = 5

export const DEFAULT_ADD_SUPPORTS = false
export const DEFAULT_PLINTH_ANGLE = 15
export const DEFAULT_RAISE_BY = 5
export const DEFAULT_SUPPORT_SIZE = 1
export const DEFAULT_SUPPORT_TIP_SIZE = 0.5
export const DEFAULT_SUPPORT_SPACING = 4

export const DEFAULT_CONE_START_GAP = 1
export const DEFAULT_RAFT_HEIGHT = 1
export const MIN_RAFT_HEIGHT = 0.25
export const MAX_RAFT_HEIGHT = 2
export const DEFAULT_RAFT_BOTTOM_INSET = 1
export const DEFAULT_SUPPORT_BASE_Y = 1
export const DEFAULT_CONE_TIP_PENETRATION = 0.1
export const DEFAULT_SUPPORT_OFFSET_EDGE = 0
export const DEFAULT_SUPPORT_OFFSET_CAVITY = 1
export const DEFAULT_SUPPORT_CAPS = true

export const DEFAULT_SCAFFOLDING_ENABLED = true
export const DEFAULT_SCAFFOLDING_ANGLE = 60
export const DEFAULT_SCAFFOLDING_SCALE = 0.5
export const DEFAULT_SCAFFOLDING_GAP_TOLERANCE = 1
export const SHOW_SCAFFOLDING_IN_PREVIEW = true
export const SUPPORT_PREVIEW_OPACITY = 0.25

export const DEFAULT_RENDER_THROTTLE_MS = 50

export const DEFAULT_TRIM_ENABLED = false
export const DEFAULT_TRIM_PROFILE_ID = 'bead'
export const DEFAULT_TRIM_HEIGHT = 6
export const DEFAULT_TRIM_SIZE = 6
export const DEFAULT_TRIM_LINKED = true

export const DEFAULT_SHOW_FIGURE = false
export const DEFAULT_FIGURE_FEED_PATH = ['mezgike-miniatures', 'the-dredge', 'dredge-marine', 'dredge-marine-dred014-h']
export const FIGURE_SOURCE_PATH = 'minicompare/'
export const FIGURE_FEED_PATH = 'includes/_data.php?r4'
export const FIGURE_FEED_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const FIGURE_PIXELS_PER_MM = 10
export const FIGURE_ALPHA_THRESHOLD = 128
export const FIGURE_MONOCHROME = true
export const FIGURE_SHADE_BAND = 0.25
export const FIGURE_SHADOW_COLOR = 0xa8404f
export const FIGURE_SHADOW_TINT = 1
export const FIGURE_OPACITY = 0.55
export const MAX_FIGURE_RESULTS = 60
export const FIGURE_HANDLE_RADIUS_SCALE = 0.4
export const FIGURE_HANDLE_MIN_RADIUS = 6
export const FIGURE_HANDLE_MAX_RADIUS = 25
export const FIGURE_HANDLE_OPACITY = 0.2
export const FIGURE_HANDLE_HOVER_OPACITY = 0.35
export const FIGURE_HANDLE_ARROW_SCALE = 0.55


export const DRAWER_WIDTH = 500
export const COMPACT_LAYOUT_QUERY = '(max-width: 720px)'
export const TOPBAR_HEIGHT = 48
export const SHEET_PEEK_HEIGHT = 88
export const SHEET_FULL_TOP_GAP = 40
export const SHEET_HALF_FRACTION = 0.5
export const MIN_PREVIEW_HEIGHT = 160
export const DEFAULT_SHEET_SNAP = 'half'
