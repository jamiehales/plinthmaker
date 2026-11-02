import { useState, useMemo, useCallback, useEffect, useRef, type CSSProperties } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  IconButton,
  LinkedPair,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Spinner,
  Tooltip,
  WarningTooltip,
} from '@jamiehales/ui-kit/mostlymaking'
import { CircleIcon, DownloadIcon, HelpIcon, HexagonIcon, SquareIcon } from './components/icons.tsx'
import { CheckField, SectionTitle } from './components/FormParts.tsx'
import Viewport from './components/Viewport.tsx'
import HelpDialog, { type HelpDialogHandle } from './components/HelpDialog.tsx'
import { type Shape, type PlinthParams, type RoundStyle, type RoundLocation, type SupportParams } from './components/geometryBuilder.ts'
import { type DrillJigParams } from './components/geometryBuilder.ts'
import { useGeometryWorker, deserializeGeometry, useBuilding, useGenerationFailed } from './components/useGeometryWorker.ts'
import LabeledSlider from './components/LabeledSlider.tsx'
import { exportSTL } from './components/exportSTL.ts'
import { buildSupportMeshGeometry, mergePlinthWithSupports, applySupportTransform, applyYUpToZUp } from './components/supportBuilder.ts'
import {
  DEFAULT_SHAPE, DEFAULT_NGON_SIDES, MIN_NGON_SIDES, MAX_NGON_SIDES, DEFAULT_WIDTH, DEFAULT_DEPTH, DEFAULT_HEIGHT, DEFAULT_LOCKED_ASPECT,
  DEFAULT_ADD_HOLE, DEFAULT_HOLE_DIAMETER, DEFAULT_HOLE_DEPTH, DEFAULT_ADD_DRILL_JIG,
  DEFAULT_JIG_WALL_SIZE, DEFAULT_JIG_HEIGHT, DEFAULT_JIG_OVERLAP, DEFAULT_JIG_TOLERANCE,
  DEFAULT_JIG_LIFT, DEFAULT_JIG_FLATTEN_TOP, DEFAULT_TOP_ANGLE,
  DEFAULT_ROUND_STYLE, DEFAULT_ROUND_LOCATION, DEFAULT_ROUND_SIZE, DEFAULT_DOWNLOAD_RESOLUTION,
  DEFAULT_ADD_SUPPORTS, DEFAULT_PLINTH_ANGLE, DEFAULT_RAISE_BY, DEFAULT_SUPPORT_SIZE,
  DEFAULT_SUPPORT_TIP_SIZE, DEFAULT_SUPPORT_SPACING, DEFAULT_SUPPORT_CAPS,
  DRAWER_WIDTH,
  DEFAULT_SCAFFOLDING_ENABLED, DEFAULT_SCAFFOLDING_ANGLE,
  DEFAULT_RAFT_HEIGHT, MIN_RAFT_HEIGHT, MAX_RAFT_HEIGHT,
  DEFAULT_TRIM_ENABLED, DEFAULT_TRIM_PROFILE_ID, DEFAULT_TRIM_HEIGHT, DEFAULT_TRIM_SIZE, DEFAULT_TRIM_LINKED,
  DEFAULT_MIN_HOLE_DIAMETER, DEFAULT_MAX_HOLE_DIAMETER,
  DEFAULT_HOLLOW_ENABLED, DEFAULT_HOLLOW_TOP_THICKNESS, DEFAULT_HOLLOW_WALL_THICKNESS,
  DEFAULT_SUCTION_HOLE_ENABLED, DEFAULT_SUCTION_HOLE_DIAMETER, MAX_SUCTION_HOLE_DIAMETER,
  DEFAULT_BASE_INSERT_ENABLED, DEFAULT_BASE_INSERT_ID, DEFAULT_BASE_INSERT_DEPTH, DEFAULT_BASE_INSERT_TOLERANCE,
  BASE_INSERT_PLINTH_MARGIN, MIN_BASE_INSERT_DEPTH, MAX_BASE_INSERT_DEPTH, MIN_BASE_INSERT_SIZE, MAX_BASE_INSERT_SIZE,
  TOP_ANGLE_PRESETS, COMPACT_LAYOUT_QUERY, DEFAULT_SHEET_SNAP, DEFAULT_SHOW_FIGURE,
} from './defaults.ts'
import { ParameterSheetHeader } from './components/ParameterSheet.tsx'
import { getPreviewHeight, getSheetHeights, type SheetSnap } from './components/sheetLayout.ts'
import { useMediaQuery, useWindowHeight } from './components/useLayout.ts'
import { describePlinthFeatures, describePlinthSize } from './components/plinthSummary.ts'
import TrimDesigner from './components/TrimDesigner.tsx'
import { useTrimDesign } from './components/useTrimDesign.ts'
import { ngonDepthRatio } from './components/ngon.ts'
import SavedConfigs from './components/SavedConfigs.tsx'
import type { PlinthConfig } from './components/savedConfigs.ts'
import PlinthAngleIcon from './components/PlinthAngleIcon.tsx'
import { type CavityGuideMode } from './components/CavityGuide.tsx'
import { type HoleGuideMode } from './components/HoleGuide.tsx'
import MiniatureList, { type Miniature } from './components/MiniatureList.tsx'
import { type FigureEntry, DEFAULT_PREVIEW_FIGURE } from './components/figureCatalog.ts'
import { GAMING_BASES, HEXAGON_SIDES, getGamingBase, hasSingleSize, hexagonAcrossCorners, baseInsertFits } from './components/gamingBases.ts'
import VisibilityToggle from './components/VisibilityToggle.tsx'
import { type FigurePosition } from './components/FigureGuide.tsx'

type IntroPreview = 'hollow' | 'hole' | 'suction' | 'supports'

const CENTERED_FIGURE: FigurePosition = { x: 0, z: 0 }
const DEFAULT_MINIATURES: Miniature[] = [{ id: 0, figure: DEFAULT_PREVIEW_FIGURE, position: CENTERED_FIGURE }]

const SUPPORT_VISIBILITY_NOTE = 'supports in viewport, supports will be generated for the download whenever resin supports are enabled'

const BASE_INSERT_TOO_LARGE = 'The base is larger than the top of the plinth, so the insert will cut through the edge'

const BASE_INSERT_BREAKS_CAVITY = 'The insert is deeper than the top thickness, so it will cut into the hollow cavity'

const HOLLOWING_RECOMMENDATION = 'When printing on a resin printer, I recommend hollowing the model. It reduces the likelihood of a failed print due to the pull forces generated'

function BuildingIndicator() {
  const building = useBuilding()
  const failed = useGenerationFailed()
  if (!building && !failed) return null
  return (
    <div className="building-indicator" data-failed={failed ? '' : undefined}>
      {failed ? (
        'Generation failed'
      ) : (
        <>
          <Spinner label="Generating" width={20} height={20} />
          Generating…
        </>
      )}
    </div>
  )
}

function App() {
  const [shape, setShape] = useState<Shape>(DEFAULT_SHAPE)
  const [ngonSides, setNgonSides] = useState(DEFAULT_NGON_SIDES)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [depth, setDepth] = useState(DEFAULT_DEPTH)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [lockedAspect, setLockedAspect] = useState(DEFAULT_LOCKED_ASPECT)
  const [addHole, setAddHole] = useState(DEFAULT_ADD_HOLE)
  const [holeDiameter, setHoleDiameter] = useState(DEFAULT_HOLE_DIAMETER)
  const [holeDepth, setHoleDepth] = useState(DEFAULT_HOLE_DEPTH)
  const [addDrillJig, setAddDrillJig] = useState(DEFAULT_ADD_DRILL_JIG)
  const [jigWallSize, setJigWallSize] = useState(DEFAULT_JIG_WALL_SIZE)
  const [jigHeight, setJigHeight] = useState(DEFAULT_JIG_HEIGHT)
  const [jigOverlap, setJigOverlap] = useState(DEFAULT_JIG_OVERLAP)
  const [jigTolerance, setJigTolerance] = useState(DEFAULT_JIG_TOLERANCE)
  const [jigLift, setJigLift] = useState(DEFAULT_JIG_LIFT)
  const [jigFlattenTop, setJigFlattenTop] = useState(DEFAULT_JIG_FLATTEN_TOP)
  const [jigDiffHole, setJigDiffHole] = useState(false)
  const [jigHoleDiameter, setJigHoleDiameter] = useState(DEFAULT_HOLE_DIAMETER)
  const [topAngle, setTopAngle] = useState(DEFAULT_TOP_ANGLE)
  const [topAnglePreset, setTopAnglePreset] = useState<number | 'custom'>(DEFAULT_TOP_ANGLE)
  const [roundStyle, setRoundStyle] = useState<RoundStyle>(DEFAULT_ROUND_STYLE)
  const [roundLocation, setRoundLocation] = useState<RoundLocation>(DEFAULT_ROUND_LOCATION)
  const [roundSize, setRoundSize] = useState(DEFAULT_ROUND_SIZE)
  const downloadResolution = DEFAULT_DOWNLOAD_RESOLUTION
  const [downloadingPlinth, setDownloadingPlinth] = useState(false)
  const [downloadingJig, setDownloadingJig] = useState(false)
  const [addSupports, setAddSupports] = useState(DEFAULT_ADD_SUPPORTS)
  const [plinthAngle, setPlinthAngle] = useState(DEFAULT_PLINTH_ANGLE)
  const [raiseBy, setRaiseBy] = useState(DEFAULT_RAISE_BY)
  const [supportSize, setSupportSize] = useState(DEFAULT_SUPPORT_SIZE)
  const [supportTipSize, setSupportTipSize] = useState(DEFAULT_SUPPORT_TIP_SIZE)
  const [supportSpacing, setSupportSpacing] = useState(DEFAULT_SUPPORT_SPACING)
  const [supportCaps] = useState(DEFAULT_SUPPORT_CAPS)
  const [scaffoldingEnabled, setScaffoldingEnabled] = useState(DEFAULT_SCAFFOLDING_ENABLED)
  const [scaffoldingAngle, setScaffoldingAngle] = useState(DEFAULT_SCAFFOLDING_ANGLE)
  const [raftHeight, setRaftHeight] = useState(DEFAULT_RAFT_HEIGHT)
  const [hollowEnabled, setHollowEnabled] = useState(DEFAULT_HOLLOW_ENABLED)
  const [topThickness, setTopThickness] = useState(DEFAULT_HOLLOW_TOP_THICKNESS)
  const [hollowWallThickness, setHollowWallThickness] = useState(DEFAULT_HOLLOW_WALL_THICKNESS)
  const [editingTrimSection, setEditingTrimSection] = useState(-1)
  const [editingHole, setEditingHole] = useState<HoleGuideMode | null>(null)
  const [editingSupportLayout, setEditingSupportLayout] = useState(false)
  const [editingHollow, setEditingHollow] = useState<CavityGuideMode | null>(null)
  const [suctionHoleEnabled, setSuctionHoleEnabled] = useState(DEFAULT_SUCTION_HOLE_ENABLED)
  const [suctionHoleDiameter, setSuctionHoleDiameter] = useState(DEFAULT_SUCTION_HOLE_DIAMETER)
  const [baseInsertEnabled, setBaseInsertEnabled] = useState(DEFAULT_BASE_INSERT_ENABLED)
  const [baseInsertId, setBaseInsertId] = useState(DEFAULT_BASE_INSERT_ID)
  const [baseInsertWidth, setBaseInsertWidth] = useState(getGamingBase(DEFAULT_BASE_INSERT_ID).width)
  const [baseInsertLength, setBaseInsertLength] = useState(getGamingBase(DEFAULT_BASE_INSERT_ID).length)
  const [baseInsertDepth, setBaseInsertDepth] = useState(DEFAULT_BASE_INSERT_DEPTH)
  const [baseInsertTolerance, setBaseInsertTolerance] = useState(DEFAULT_BASE_INSERT_TOLERANCE)
  const [trimEnabled, setTrimEnabled] = useState(DEFAULT_TRIM_ENABLED)
  const trimDesign = useTrimDesign(DEFAULT_TRIM_PROFILE_ID)
  const [trimHeight, setTrimHeight] = useState(DEFAULT_TRIM_HEIGHT)
  const [trimSize, setTrimSize] = useState(DEFAULT_TRIM_SIZE)
  const [trimLinked, setTrimLinked] = useState(DEFAULT_TRIM_LINKED)
  const [trimResetCount, setTrimResetCount] = useState(0)
  const [showSupportsInViewport, setShowSupportsInViewport] = useState(true)
  const [showFigure, setShowFigure] = useState(DEFAULT_SHOW_FIGURE)
  const [miniatures, setMiniatures] = useState<Miniature[]>(DEFAULT_MINIATURES)
  const [editingMiniature, setEditingMiniature] = useState<number | null>(null)
  const [loadingMiniatures, setLoadingMiniatures] = useState<ReadonlySet<number>>(new Set())
  const nextMiniatureId = useRef(DEFAULT_MINIATURES.length)
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>(DEFAULT_SHEET_SNAP)
  const { build } = useGeometryWorker()
  const helpRef = useRef<HelpDialogHandle>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const [introPreview, setIntroPreview] = useState<IntroPreview | null>(null)

  const enableWithIntro = (feature: IntroPreview, setEnabled: (enabled: boolean) => void) => (enabled: boolean) => {
    setEnabled(enabled)
    setIntroPreview((current) => (enabled ? feature : current === feature ? null : current))
  }

  useEffect(() => {
    const sheet = sheetRef.current
    if (!introPreview || !sheet) return
    const dismiss = () => setIntroPreview(null)
    const timer = setTimeout(() => {
      sheet.addEventListener('pointerdown', dismiss)
      sheet.addEventListener('focusin', dismiss)
    }, 0)
    return () => {
      clearTimeout(timer)
      sheet.removeEventListener('pointerdown', dismiss)
      sheet.removeEventListener('focusin', dismiss)
    }
  }, [introPreview])
  const compact = useMediaQuery(COMPACT_LAYOUT_QUERY)
  const windowHeight = useWindowHeight()
  const sheetHeights = getSheetHeights(windowHeight)

  const handleShape = (v: Shape) => {
    setShape(v)
    if (v === 'ellipse' && roundLocation !== 'top') setRoundLocation('top')
  }

  const selectedGamingBase = getGamingBase(baseInsertId)
  const singleSizeBaseInsert = hasSingleSize(selectedGamingBase)
  const plinthDepth = lockedAspect && shape === 'ngon' ? Math.round(width * ngonDepthRatio(ngonSides) * 100) / 100 : depth

  const handleWidth = (w: number) => {
    setWidth(w)
    if (lockedAspect) setDepth(w)
  }

  const handleEditingHollow = (mode: CavityGuideMode, editing: boolean) => {
    setEditingHollow((current) => (editing ? mode : current === mode ? null : current))
  }

  const handleEditingHole = (mode: HoleGuideMode, editing: boolean) => {
    setEditingHole((current) => (editing ? mode : current === mode ? null : current))
  }

  const introHoleGuide: HoleGuideMode | null = introPreview === 'hole' ? 'diameter' : introPreview === 'suction' ? 'suction' : null
  const activeHoleGuide = editingHole ?? introHoleGuide
  const visibleHoleGuide = activeHoleGuide === 'suction'
    ? (hollowEnabled && suctionHoleEnabled ? activeHoleGuide : null)
    : addHole ? activeHoleGuide : null

  const maxSupportTipSize = Math.min(1, supportSize)

  const handleSupportSize = (size: number) => {
    setSupportSize(size)
    setSupportTipSize((tipSize) => Math.min(tipSize, Math.min(1, size)))
  }

  const resetIf = (modified: boolean, reset: () => void) => (modified ? reset : null)

  const resetShape = resetIf(shape !== DEFAULT_SHAPE || ngonSides !== DEFAULT_NGON_SIDES, () => {
    setShape(DEFAULT_SHAPE)
    setNgonSides(DEFAULT_NGON_SIDES)
  })
  const resetDimensions = resetIf(
    width !== DEFAULT_WIDTH || depth !== DEFAULT_DEPTH || height !== DEFAULT_HEIGHT || lockedAspect !== DEFAULT_LOCKED_ASPECT,
    () => {
      setWidth(DEFAULT_WIDTH)
      setDepth(DEFAULT_DEPTH)
      setHeight(DEFAULT_HEIGHT)
      setLockedAspect(DEFAULT_LOCKED_ASPECT)
    },
  )
  const resetTopAngle = resetIf(topAngle !== DEFAULT_TOP_ANGLE || topAnglePreset !== DEFAULT_TOP_ANGLE, () => {
    setTopAngle(DEFAULT_TOP_ANGLE)
    setTopAnglePreset(DEFAULT_TOP_ANGLE)
  })
  const resetRounding = resetIf(
    roundStyle !== DEFAULT_ROUND_STYLE || roundLocation !== DEFAULT_ROUND_LOCATION || roundSize !== DEFAULT_ROUND_SIZE,
    () => {
      setRoundStyle(DEFAULT_ROUND_STYLE)
      setRoundLocation(DEFAULT_ROUND_LOCATION)
      setRoundSize(DEFAULT_ROUND_SIZE)
    },
  )
  const resetTrim = resetIf(
    trimHeight !== DEFAULT_TRIM_HEIGHT || trimSize !== DEFAULT_TRIM_SIZE
      || trimLinked !== DEFAULT_TRIM_LINKED || trimDesign.source.kind !== 'preset' || trimDesign.source.id !== DEFAULT_TRIM_PROFILE_ID || trimDesign.modified,
    () => {
      setTrimHeight(DEFAULT_TRIM_HEIGHT)
      setTrimSize(DEFAULT_TRIM_SIZE)
      setTrimLinked(DEFAULT_TRIM_LINKED)
      trimDesign.selectPreset(DEFAULT_TRIM_PROFILE_ID)
      setTrimResetCount((count) => count + 1)
    },
  )
  const resetHole = resetIf(
    holeDiameter !== DEFAULT_HOLE_DIAMETER || holeDepth !== DEFAULT_HOLE_DEPTH,
    () => {
      setHoleDiameter(DEFAULT_HOLE_DIAMETER)
      setHoleDepth(DEFAULT_HOLE_DEPTH)
      if (!jigDiffHole) setJigHoleDiameter(DEFAULT_HOLE_DIAMETER)
    },
  )
  const handleBaseInsertId = (id: string) => {
    const base = getGamingBase(id)
    setBaseInsertId(base.id)
    setBaseInsertWidth(base.width)
    setBaseInsertLength(base.length)
  }

  const setPlinthToBase = () => {
    const plinthLength = baseInsertLength + BASE_INSERT_PLINTH_MARGIN
    if (selectedGamingBase.outline === 'hexagon') {
      const acrossCorners = Math.round(hexagonAcrossCorners(plinthLength) * 100) / 100
      handleShape('ngon')
      setNgonSides(HEXAGON_SIDES)
      setLockedAspect(true)
      setWidth(acrossCorners)
      setDepth(acrossCorners)
      return
    }
    const plinthWidth = baseInsertWidth + BASE_INSERT_PLINTH_MARGIN
    handleShape(selectedGamingBase.outline)
    setLockedAspect(plinthWidth === plinthLength)
    setWidth(plinthWidth)
    setDepth(plinthLength)
  }

  const handleBaseInsertDiameter = (diameter: number) => {
    setBaseInsertWidth(diameter)
    setBaseInsertLength(diameter)
  }

  const resetBaseInsert = resetIf(
    baseInsertId !== DEFAULT_BASE_INSERT_ID || baseInsertWidth !== getGamingBase(DEFAULT_BASE_INSERT_ID).width
      || baseInsertLength !== getGamingBase(DEFAULT_BASE_INSERT_ID).length
      || baseInsertDepth !== DEFAULT_BASE_INSERT_DEPTH || baseInsertTolerance !== DEFAULT_BASE_INSERT_TOLERANCE,
    () => {
      handleBaseInsertId(DEFAULT_BASE_INSERT_ID)
      setBaseInsertDepth(DEFAULT_BASE_INSERT_DEPTH)
      setBaseInsertTolerance(DEFAULT_BASE_INSERT_TOLERANCE)
    },
  )
  const resetHollow = resetIf(
    topThickness !== DEFAULT_HOLLOW_TOP_THICKNESS || hollowWallThickness !== DEFAULT_HOLLOW_WALL_THICKNESS
      || suctionHoleEnabled !== DEFAULT_SUCTION_HOLE_ENABLED || suctionHoleDiameter !== DEFAULT_SUCTION_HOLE_DIAMETER,
    () => {
      setTopThickness(DEFAULT_HOLLOW_TOP_THICKNESS)
      setHollowWallThickness(DEFAULT_HOLLOW_WALL_THICKNESS)
      setSuctionHoleEnabled(DEFAULT_SUCTION_HOLE_ENABLED)
      setSuctionHoleDiameter(DEFAULT_SUCTION_HOLE_DIAMETER)
    },
  )
  const resetDrillJig = resetIf(
    jigWallSize !== DEFAULT_JIG_WALL_SIZE || jigHeight !== DEFAULT_JIG_HEIGHT
      || jigOverlap !== DEFAULT_JIG_OVERLAP || jigTolerance !== DEFAULT_JIG_TOLERANCE || jigLift !== DEFAULT_JIG_LIFT
      || jigFlattenTop !== DEFAULT_JIG_FLATTEN_TOP || jigDiffHole || (jigHoleDiameter !== holeDiameter),
    () => {
      setJigWallSize(DEFAULT_JIG_WALL_SIZE)
      setJigHeight(DEFAULT_JIG_HEIGHT)
      setJigOverlap(DEFAULT_JIG_OVERLAP)
      setJigTolerance(DEFAULT_JIG_TOLERANCE)
      setJigLift(DEFAULT_JIG_LIFT)
      setJigFlattenTop(DEFAULT_JIG_FLATTEN_TOP)
      setJigDiffHole(false)
      setJigHoleDiameter(holeDiameter)
    },
  )
  const resetSupports = resetIf(
    plinthAngle !== DEFAULT_PLINTH_ANGLE || raiseBy !== DEFAULT_RAISE_BY
      || supportSize !== DEFAULT_SUPPORT_SIZE || supportTipSize !== DEFAULT_SUPPORT_TIP_SIZE || supportSpacing !== DEFAULT_SUPPORT_SPACING
      || scaffoldingEnabled !== DEFAULT_SCAFFOLDING_ENABLED || scaffoldingAngle !== DEFAULT_SCAFFOLDING_ANGLE || raftHeight !== DEFAULT_RAFT_HEIGHT,
    () => {
      setPlinthAngle(DEFAULT_PLINTH_ANGLE)
      setRaiseBy(DEFAULT_RAISE_BY)
      setSupportSize(DEFAULT_SUPPORT_SIZE)
      setSupportTipSize(DEFAULT_SUPPORT_TIP_SIZE)
      setSupportSpacing(DEFAULT_SUPPORT_SPACING)
      setScaffoldingEnabled(DEFAULT_SCAFFOLDING_ENABLED)
      setScaffoldingAngle(DEFAULT_SCAFFOLDING_ANGLE)
      setRaftHeight(DEFAULT_RAFT_HEIGHT)
    },
  )

  const resetFigure = resetIf(
    miniatures.length !== 1 || miniatures[0].figure.id !== DEFAULT_PREVIEW_FIGURE.id
      || miniatures[0].position.x !== 0 || miniatures[0].position.z !== 0,
    () => {
      setMiniatures(DEFAULT_MINIATURES)
      setEditingMiniature(null)
    },
  )

  const handleShowFigure = (enabled: boolean) => {
    setShowFigure(enabled)
    if (enabled && miniatures.length === 0) setMiniatures(DEFAULT_MINIATURES)
  }

  const updateMiniature = (id: number, change: Partial<Miniature>) => {
    setMiniatures((current) => current.map((miniature) => (miniature.id === id ? { ...miniature, ...change } : miniature)))
  }

  const addMiniature = () => {
    const id = nextMiniatureId.current++
    setMiniatures((current) => [...current, { id, figure: DEFAULT_PREVIEW_FIGURE, position: CENTERED_FIGURE }])
    setEditingMiniature(id)
  }

  const deleteMiniature = (id: number) => {
    setMiniatures((current) => current.filter((miniature) => miniature.id !== id))
    setEditingMiniature((current) => (current === id ? null : current))
  }

  const handleMiniaturePosition = useCallback((id: number, position: FigurePosition) => {
    setMiniatures((current) => current.map((miniature) => (miniature.id === id ? { ...miniature, position } : miniature)))
  }, [])

  const handleMiniatureLoading = useCallback((id: number, loading: boolean) => {
    setLoadingMiniatures((current) => {
      if (current.has(id) === loading) return current
      const next = new Set(current)
      if (loading) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const currentConfig: PlinthConfig = {
    shape, ngonSides, width, depth, height, lockedAspect,
    topAngle, topAnglePreset, roundStyle, roundLocation, roundSize,
    trimEnabled, trimSource: trimDesign.source, trimSections: trimDesign.sections, trimHeight, trimSize, trimLinked,
    addHole, holeDiameter, holeDepth,
    baseInsertEnabled, baseInsertId, baseInsertWidth, baseInsertLength, baseInsertDepth, baseInsertTolerance,
    hollowEnabled, topThickness, hollowWallThickness, suctionHoleEnabled, suctionHoleDiameter,
    addDrillJig, jigWallSize, jigHeight, jigOverlap, jigTolerance, jigLift, jigFlattenTop, jigDiffHole, jigHoleDiameter,
    addSupports, plinthAngle, raiseBy, supportSize, supportTipSize, supportSpacing, scaffoldingEnabled, scaffoldingAngle, raftHeight,
  }

  const applyConfig = (config: PlinthConfig) => {
    setShape(config.shape)
    setNgonSides(config.ngonSides)
    setWidth(config.width)
    setDepth(config.depth)
    setHeight(config.height)
    setLockedAspect(config.lockedAspect)
    setTopAngle(config.topAngle)
    setTopAnglePreset(config.topAnglePreset)
    setRoundStyle(config.roundStyle)
    setRoundLocation(config.roundLocation)
    setRoundSize(config.roundSize)
    setTrimEnabled(config.trimEnabled)
    trimDesign.load(config.trimSource, config.trimSections)
    setTrimHeight(config.trimHeight)
    setTrimSize(config.trimSize)
    setTrimLinked(config.trimLinked)
    setTrimResetCount((count) => count + 1)
    setAddHole(config.addHole)
    setHoleDiameter(config.holeDiameter)
    setHoleDepth(config.holeDepth)
    setBaseInsertEnabled(config.baseInsertEnabled)
    setBaseInsertId(config.baseInsertId)
    setBaseInsertWidth(config.baseInsertWidth)
    setBaseInsertLength(config.baseInsertLength)
    setBaseInsertDepth(config.baseInsertDepth)
    setBaseInsertTolerance(config.baseInsertTolerance)
    setHollowEnabled(config.hollowEnabled)
    setTopThickness(config.topThickness)
    setHollowWallThickness(config.hollowWallThickness)
    setSuctionHoleEnabled(config.suctionHoleEnabled)
    setSuctionHoleDiameter(config.suctionHoleDiameter)
    setAddDrillJig(config.addDrillJig)
    setJigWallSize(config.jigWallSize)
    setJigHeight(config.jigHeight)
    setJigOverlap(config.jigOverlap)
    setJigTolerance(config.jigTolerance)
    setJigLift(config.jigLift)
    setJigFlattenTop(config.jigFlattenTop)
    setJigDiffHole(config.jigDiffHole)
    setJigHoleDiameter(config.jigHoleDiameter)
    setAddSupports(config.addSupports)
    setPlinthAngle(config.plinthAngle)
    setRaiseBy(config.raiseBy)
    setSupportSize(config.supportSize)
    setSupportTipSize(config.supportTipSize)
    setSupportSpacing(config.supportSpacing)
    setScaffoldingEnabled(config.scaffoldingEnabled)
    setScaffoldingAngle(config.scaffoldingAngle)
    setRaftHeight(config.raftHeight)
    setIntroPreview(null)
  }

  const handleLocked = (checked: boolean) => {
    setLockedAspect(checked)
    setDepth(checked ? width : plinthDepth)
  }

  const plinthParams: PlinthParams = useMemo(() => ({
    shape,
    ngonSides,
    width,
    depth: plinthDepth,
    height,
    addHole,
    holeDiameter,
    holeDepth,
    angleTop: topAngle > 0,
    topAngle,
    roundStyle,
    roundLocation: shape === 'ellipse' ? 'top' : roundLocation,
    roundSize,
    trimEnabled,
    trimProfileId: trimDesign.trimProfileId,
    trimHeight,
    trimSize,
    customTrimPoints: trimDesign.customTrimPoints,
    hollowEnabled,
    hollowHeight: height - topThickness,
    hollowWallThickness,
    suctionHoleEnabled,
    suctionHoleDiameter,
    baseInsertEnabled,
    baseInsertId,
    baseInsertOutline: selectedGamingBase.outline,
    baseInsertWidth,
    baseInsertLength,
    baseInsertDepth,
    baseInsertTolerance,
  }), [shape, ngonSides, width, plinthDepth, height, addHole, holeDiameter, holeDepth, topAngle, roundStyle, roundLocation, roundSize, trimEnabled, trimDesign.trimProfileId, trimDesign.customTrimPoints, trimHeight, trimSize, hollowEnabled, topThickness, hollowWallThickness, suctionHoleEnabled, suctionHoleDiameter, baseInsertEnabled, baseInsertId, selectedGamingBase.outline, baseInsertWidth, baseInsertLength, baseInsertDepth, baseInsertTolerance])

  const baseInsertWarning = !baseInsertEnabled
    ? null
    : !baseInsertFits(plinthParams)
      ? BASE_INSERT_TOO_LARGE
      : hollowEnabled && baseInsertDepth >= topThickness
        ? BASE_INSERT_BREAKS_CAVITY
        : null

  const buildPlinthFilename = useCallback((p: PlinthParams, resMM: number, supported: boolean) => {
    const roundPart = p.roundStyle === 'none' ? '' : `_${p.roundStyle}-${p.roundSize}_`
    const holePart = p.addHole ? `hole-${p.holeDiameter}mm` : 'hole-none'
    const anglePart = p.angleTop ? `angled-${p.topAngle}°` : 'flat'
    const trimPart = p.trimEnabled ? `_trim-${p.trimProfileId}-${p.trimHeight}x${p.trimSize}` : ''
    const insertPart = p.baseInsertEnabled ? `_insert-${p.baseInsertWidth}x${p.baseInsertLength}x${p.baseInsertDepth}` : ''
    const hollowPart = p.hollowEnabled ? `_hollow-${p.height - p.hollowHeight}x${p.hollowWallThickness}` : ''
    const supportPart = supported ? '_supported' : '_unsupported'
    const um = Math.round(resMM * 1000)
    const shapePart = p.shape === 'ngon' ? `ngon-${p.ngonSides}` : p.shape
    return `plinth_${shapePart}_${p.width}x${p.depth}x${p.height}_${anglePart}${roundPart}${holePart}${insertPart}${trimPart}${hollowPart}${supportPart}_${um}um.stl`
  }, [])

  const buildJigFilename = useCallback((p: PlinthParams, j: DrillJigParams) => {
    const anglePart = p.angleTop ? `${p.topAngle}°` : 'flat'
    const flattenPart = j.flattenTop ? 'flat' : 'angled'
    const jigHole = j.holeDiameter ?? p.holeDiameter
    const holePart = p.addHole ? `hole-${jigHole}mm${j.holeDiameter != null && j.holeDiameter !== p.holeDiameter ? '-diff' : ''}` : 'hole-none'
    return `plinth_drilljig_${p.width}x${p.depth}x${p.height}_${anglePart}_${flattenPart}_${holePart}.stl`
  }, [])

  const drillJigParams: DrillJigParams = useMemo(() => ({
    enabled: addDrillJig,
    wallSize: jigWallSize,
    jigHeight,
    overlap: jigOverlap,
    tolerance: jigTolerance,
    lift: jigLift,
    flattenTop: jigFlattenTop,
    holeDiameter: jigDiffHole && addHole ? jigHoleDiameter : undefined,
  }), [addDrillJig, jigWallSize, jigHeight, jigOverlap, jigTolerance, jigLift, jigFlattenTop, jigDiffHole, jigHoleDiameter, addHole])

  const supportParams: SupportParams = useMemo(() => ({
    enabled: addSupports,
    plinthAngle,
    raiseBy,
    supportSize,
    supportTipSize,
    supportSpacing,
    supportCaps,
    scaffoldingEnabled,
    scaffoldingAngle,
    raftHeight,
  }), [addSupports, plinthAngle, raiseBy, supportSize, supportTipSize, supportSpacing, supportCaps, scaffoldingEnabled, scaffoldingAngle, raftHeight])

  const downloadJig = async () => {
    setDownloadingJig(true)
    try {
      const { promise } = build({ type: 'jig', shape, plinthParams, jigParams: drillJigParams, baseSegMM: downloadResolution, filletSegMM: downloadResolution, useCDT: true, computeCavity: true })
      const msg = await promise
      if (msg.type !== 'jig') return
      const geo = deserializeGeometry(msg.jig)
      exportSTL(geo, buildJigFilename(plinthParams, drillJigParams))
      geo.dispose()
    } finally {
      setDownloadingJig(false)
    }
  }

  const downloadPlinth = async () => {
    setDownloadingPlinth(true)
    try {
      const { promise } = build({ type: 'plinth', params: plinthParams, baseSegMM: downloadResolution, filletSegMM: downloadResolution, useCDT: true })
      const msg = await promise
      if (msg.type !== 'plinth') return
      const geo = deserializeGeometry(msg.geometry)
      if (addSupports) {
        const supportGeo = buildSupportMeshGeometry(shape, plinthParams, supportParams, 16, scaffoldingEnabled)
        const transformedPlinth = applySupportTransform(geo, supportParams, plinthParams.depth)
        const merged = mergePlinthWithSupports(transformedPlinth, supportGeo)
        const zup = applyYUpToZUp(merged)
        exportSTL(zup, buildPlinthFilename(plinthParams, downloadResolution, true))
        if (merged !== transformedPlinth) merged.dispose()
        transformedPlinth.dispose()
        supportGeo.dispose()
        zup.dispose()
      } else {
        const zup = applyYUpToZUp(geo)
        exportSTL(zup, buildPlinthFilename(plinthParams, downloadResolution, false))
        zup.dispose()
      }
      geo.dispose()
    } finally {
      setDownloadingPlinth(false)
    }
  }

  const layoutStyle = {
    '--sidebar-width': `${DRAWER_WIDTH}px`,
    '--sheet-height': `${sheetHeights[sheetSnap]}px`,
    '--preview-height': `${getPreviewHeight(windowHeight, sheetHeights[sheetSnap])}px`,
  } as CSSProperties

  return (
    <div className="app" data-compact={compact ? '' : undefined} style={layoutStyle}>
      <header className="topbar">
        <h1 className="topbar-title mm-type-logo">
          <a className="wordmark-home" href="https://mostlymaking.net" target="_blank" rel="noopener noreferrer">
            mostlymaking<span className="wordmark-dot">.</span>
          </a>
          <span className="wordmark-product">plinths</span>
        </h1>
        <IconButton variant="ghost" aria-label="Help" onClick={() => helpRef.current?.open()}>
          <HelpIcon />
        </IconButton>
      </header>

      <aside className="sidebar" ref={sheetRef} aria-label="Parameters">
        {compact ? (
          <ParameterSheetHeader
            sheetRef={sheetRef}
            snap={sheetSnap}
            heights={sheetHeights}
            onSnapChange={setSheetSnap}
            title={describePlinthSize(plinthParams)}
            subtitle={describePlinthFeatures(plinthParams, drillJigParams, supportParams)}
          >
            {addDrillJig ? (
              <Button disabled={downloadingJig} onClick={downloadJig}>
                {downloadingJig ? <Spinner label="Generating" /> : <DownloadIcon />}
                Jig
              </Button>
            ) : null}
            <IconButton variant="primary" aria-label="Download plinth (.stl)" disabled={downloadingPlinth} onClick={downloadPlinth}>
              {downloadingPlinth ? <Spinner label="Generating" /> : <DownloadIcon />}
            </IconButton>
          </ParameterSheetHeader>
        ) : null}
        <div className="sidebar-scroll">
          <SavedConfigs current={currentConfig} onLoad={applyConfig} />

          <Separator />

          <SectionTitle onReset={resetShape}>Shape</SectionTitle>
          <SegmentedControl fullWidth value={shape} onValueChange={(v) => handleShape(v as Shape)} aria-label="Shape">
            <SegmentedControlItem value="rectangle">
              <SquareIcon /> Rectangle
            </SegmentedControlItem>
            <SegmentedControlItem value="ellipse">
              <CircleIcon /> Ellipse
            </SegmentedControlItem>
            <SegmentedControlItem value="ngon">
              <HexagonIcon /> N-gon
            </SegmentedControlItem>
          </SegmentedControl>
          {shape === 'ngon' ? (
            <LabeledSlider
              label="Sides"
              value={ngonSides}
              onChange={(sides) => setNgonSides(Math.min(MAX_NGON_SIDES, Math.max(MIN_NGON_SIDES, Math.round(sides))))}
              min={MIN_NGON_SIDES}
              max={MAX_NGON_SIDES}
              step={1}
              unit=""
            />
          ) : null}

          <SectionTitle onReset={resetDimensions}>Dimensions</SectionTitle>
          <LinkedPair
            linked={lockedAspect}
            onLinkedChange={handleLocked}
            label="Link depth to width"
            linkedHint={shape === 'ngon' ? 'Depth keeps the sides equal' : 'Depth follows width'}
            unlinkedHint="Link depth to width"
          >
            <LabeledSlider label="Width" value={width} onChange={handleWidth} min={20} max={150} />
            <LabeledSlider
              label="Depth"
              value={plinthDepth}
              onChange={setDepth}
              min={20}
              max={150}
              disabled={lockedAspect}
            />
          </LinkedPair>

          <LabeledSlider label="Height" value={height} onChange={setHeight} min={20} max={150} />

          <SectionTitle onReset={resetTopAngle}>Top Angle</SectionTitle>
          <SegmentedControl
            fullWidth
            value={String(topAnglePreset)}
            onValueChange={(v) => {
              const preset = v === 'custom' ? 'custom' : Number(v)
              setTopAnglePreset(preset)
              if (preset !== 'custom') setTopAngle(preset)
            }}
            aria-label="Top angle"
          >
            {TOP_ANGLE_PRESETS.map((a) => (
              <SegmentedControlItem key={a} value={String(a)} layout="stacked">
                <PlinthAngleIcon angle={a} selected={topAnglePreset === a} />
                <span>{a}°</span>
              </SegmentedControlItem>
            ))}
            <SegmentedControlItem value="custom" layout="stacked">
              <PlinthAngleIcon angle={topAnglePreset === 'custom' ? topAngle : 30} selected={topAnglePreset === 'custom'} />
              <span>Custom</span>
            </SegmentedControlItem>
          </SegmentedControl>
          {topAnglePreset === 'custom' ? (
            <LabeledSlider
              label="Top Angle"
              value={topAngle}
              onChange={setTopAngle}
              min={0}
              max={45}
              step={1}
              unit="°"
            />
          ) : null}

          <Separator />

          <SectionTitle onReset={resetRounding}>Chamfer / Fillet</SectionTitle>
          <SegmentedControl fullWidth value={roundStyle} onValueChange={(v) => setRoundStyle(v as RoundStyle)} aria-label="Edge style">
            <SegmentedControlItem value="none">None</SegmentedControlItem>
            <SegmentedControlItem value="chamfer">Chamfer</SegmentedControlItem>
            <SegmentedControlItem value="fillet">Fillet</SegmentedControlItem>
          </SegmentedControl>
          {roundStyle !== 'none' ? (
            <>
              {shape !== 'ellipse' ? (
                <SegmentedControl fullWidth value={roundLocation} onValueChange={(v) => setRoundLocation(v as RoundLocation)} aria-label="Edge location">
                  <SegmentedControlItem value="top">Top</SegmentedControlItem>
                  <SegmentedControlItem value="edges">Edges</SegmentedControlItem>
                  <SegmentedControlItem value="both">Both</SegmentedControlItem>
                </SegmentedControl>
              ) : null}
              <LabeledSlider
                label="Size"
                value={roundSize}
                onChange={setRoundSize}
                min={0}
                max={5}
                step={0.1}
              />
            </>
          ) : null}

          <Separator />

          <SectionTitle onReset={resetTrim}>Trim</SectionTitle>
          <CheckField checked={trimEnabled} onChange={setTrimEnabled}>Add Trim</CheckField>
          {trimEnabled ? (
            <TrimDesigner
              key={trimResetCount}
              design={trimDesign}
              trimHeight={trimHeight}
              onTrimHeightChange={setTrimHeight}
              maxTrimSize={height - 1}
              trimSize={trimSize}
              onTrimSizeChange={setTrimSize}
              trimLinked={trimLinked}
              onTrimLinkedChange={setTrimLinked}
              onEditingSectionChange={setEditingTrimSection}
            />
          ) : null}

          <Separator />

          <SectionTitle onReset={resetHole}>Plinth Hole</SectionTitle>
          <CheckField checked={addHole} onChange={enableWithIntro('hole', setAddHole)}>Add Hole</CheckField>
          {addHole ? (
            <>
              <LabeledSlider label="Hole Diameter" value={holeDiameter} onChange={(v) => { setHoleDiameter(v); if (!(jigDiffHole && addHole)) setJigHoleDiameter(v) }} min={DEFAULT_MIN_HOLE_DIAMETER} max={DEFAULT_MAX_HOLE_DIAMETER} step={0.5} onEditingChange={(editing) => handleEditingHole('diameter', editing)} />
              <LabeledSlider
                label="Hole Depth"
                value={holeDepth}
                onChange={setHoleDepth}
                min={1}
                max={50}
                onEditingChange={(editing) => handleEditingHole('depth', editing)}
              />
            </>
          ) : null}

          <Separator />

          <SectionTitle onReset={resetBaseInsert}>Base Insert</SectionTitle>
          <div className="check-row">
            <CheckField checked={baseInsertEnabled} onChange={setBaseInsertEnabled}>Add Gaming Base Insert</CheckField>
            {baseInsertWarning ? <WarningTooltip aria-label="Base insert warning" content={baseInsertWarning} /> : null}
          </div>
          {baseInsertEnabled ? (
            <>
              <div className="labeled-select">
                <span className="labeled-slider-label mm-type-small">Base</span>
                <Select value={baseInsertId} onValueChange={handleBaseInsertId}>
                  <SelectTrigger className="labeled-select-trigger" aria-label="Gaming base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GAMING_BASES.map((base) => (
                      <SelectItem key={base.id} value={base.id}>{base.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Tooltip content={`Set the plinth to the size and the shape of the gaming base + ${BASE_INSERT_PLINTH_MARGIN}mm`}>
                <Button variant="primary" className="inline-button" onClick={setPlinthToBase}>Set plinth shape to base</Button>
              </Tooltip>
              <LabeledSlider
                label="Depth"
                value={baseInsertDepth}
                onChange={setBaseInsertDepth}
                min={MIN_BASE_INSERT_DEPTH}
                max={MAX_BASE_INSERT_DEPTH}
                step={0.1}
              />
              <Accordion type="single" collapsible variant="minimal" trailingDivider={false} className="advanced-options">
                <AccordionItem value="advanced">
                  <AccordionTrigger>Advanced options</AccordionTrigger>
                  <AccordionContent className="advanced-options-body">
                    {singleSizeBaseInsert ? (
                      <LabeledSlider
                        label={selectedGamingBase.outline === 'hexagon' ? 'Across Flats' : 'Diameter'}
                        value={baseInsertWidth}
                        onChange={handleBaseInsertDiameter}
                        min={MIN_BASE_INSERT_SIZE}
                        max={MAX_BASE_INSERT_SIZE}
                        step={0.1}
                      />
                    ) : (
                      <>
                        <LabeledSlider
                          label="Width"
                          value={baseInsertWidth}
                          onChange={setBaseInsertWidth}
                          min={MIN_BASE_INSERT_SIZE}
                          max={MAX_BASE_INSERT_SIZE}
                          step={0.1}
                        />
                        <LabeledSlider
                          label="Length"
                          value={baseInsertLength}
                          onChange={setBaseInsertLength}
                          min={MIN_BASE_INSERT_SIZE}
                          max={MAX_BASE_INSERT_SIZE}
                          step={0.1}
                        />
                      </>
                    )}
                    <LabeledSlider
                      label="Tolerance"
                      value={baseInsertTolerance}
                      onChange={setBaseInsertTolerance}
                      min={0}
                      max={1}
                      step={0.01}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          ) : null}

          <Separator />

          <SectionTitle onReset={resetHollow}>Hollow</SectionTitle>
          <CheckField checked={hollowEnabled} onChange={enableWithIntro('hollow', setHollowEnabled)}>Enable Hollowing</CheckField>
          {hollowEnabled ? (
            <>
              <LabeledSlider
                label="Top Thickness"
                value={topThickness}
                onChange={setTopThickness}
                min={1}
                max={height - 1}
                step={0.5}
                onEditingChange={(editing) => handleEditingHollow('top', editing)}
              />
              <LabeledSlider
                label="Wall Thickness"
                value={hollowWallThickness}
                onChange={setHollowWallThickness}
                min={0.5}
                max={Math.min(width, plinthDepth) / 2 - 0.5}
                step={0.1}
                onEditingChange={(editing) => handleEditingHollow('wall', editing)}
              />
              <CheckField checked={suctionHoleEnabled} onChange={enableWithIntro('suction', setSuctionHoleEnabled)}>
                Add Hole for Suction Cup prevention
              </CheckField>
              {suctionHoleEnabled ? (
                <LabeledSlider
                  label="Hole Diameter"
                  value={suctionHoleDiameter}
                  onChange={setSuctionHoleDiameter}
                  min={1}
                  max={Math.min(MAX_SUCTION_HOLE_DIAMETER, Math.min(width, plinthDepth) - 2 * hollowWallThickness)}
                  step={0.5}
                  onEditingChange={(editing) => handleEditingHole('suction', editing)}
                />
              ) : null}
            </>
          ) : null}

          <Separator />

          <SectionTitle onReset={resetDrillJig}>Drill Jig</SectionTitle>
          <CheckField checked={addDrillJig} onChange={setAddDrillJig}>Generate Drill Jig</CheckField>
          {addDrillJig ? (
            <>
              <LabeledSlider
                label="Hole Diameter"
                value={jigDiffHole && addHole ? jigHoleDiameter : holeDiameter}
                onChange={(v) => {
                  if (jigDiffHole && addHole) {
                    setJigHoleDiameter(v)
                  } else {
                    setHoleDiameter(v)
                    setJigHoleDiameter(v)
                  }
                }}
                min={DEFAULT_MIN_HOLE_DIAMETER}
                max={DEFAULT_MAX_HOLE_DIAMETER}
                step={0.5}
                disabled={addHole && !jigDiffHole}
              />
              {addHole ? (
                <CheckField checked={jigDiffHole} onChange={setJigDiffHole}>
                  Use Different Hole Size to Plinth
                </CheckField>
              ) : null}
              <CheckField checked={jigFlattenTop} onChange={setJigFlattenTop}>Flatten Top</CheckField>
              <Accordion type="single" collapsible variant="minimal" trailingDivider={false} className="advanced-options">
                <AccordionItem value="advanced">
                  <AccordionTrigger>Advanced options</AccordionTrigger>
                  <AccordionContent className="advanced-options-body">
                    <LabeledSlider
                      label="Wall Size"
                      value={jigWallSize}
                      onChange={setJigWallSize}
                      min={1}
                      max={10}
                      step={0.1}
                    />
                    <LabeledSlider
                      label="Height"
                      value={jigHeight}
                      onChange={setJigHeight}
                      min={1}
                      max={50}
                      step={0.1}
                    />
                    <LabeledSlider
                      label="Overlap"
                      value={jigOverlap}
                      onChange={setJigOverlap}
                      min={1}
                      max={20}
                      step={0.1}
                    />
                    <LabeledSlider
                      label="Tolerance"
                      value={jigTolerance}
                      onChange={setJigTolerance}
                      min={0}
                      max={1}
                      step={0.01}
                    />
                    <CheckField checked={jigLift} onChange={setJigLift}>Lift Drill Jig</CheckField>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          ) : null}

          <Separator />

          <SectionTitle
            onReset={resetSupports}
            actions={addSupports ? (
              <VisibilityToggle
                visible={showSupportsInViewport}
                onVisibleChange={setShowSupportsInViewport}
                label={showSupportsInViewport ? 'Hide supports in viewport' : 'Show supports in viewport'}
                content={`${showSupportsInViewport ? 'Hide' : 'Show'} ${SUPPORT_VISIBILITY_NOTE}`}
              />
            ) : null}
          >
            Supports
          </SectionTitle>
          <div className="check-row">
            <CheckField checked={addSupports} onChange={enableWithIntro('supports', setAddSupports)}>Generate Resin Supports</CheckField>
            {addSupports && !hollowEnabled ? (
              <WarningTooltip aria-label="Hollowing recommended" content={HOLLOWING_RECOMMENDATION} />
            ) : null}
          </div>
          {addSupports ? (
            <>
              <LabeledSlider
                label="Tip Size"
                value={supportTipSize}
                onChange={setSupportTipSize}
                min={0.05}
                max={maxSupportTipSize}
                step={0.025}
                onEditingChange={setEditingSupportLayout}
              />
              <LabeledSlider
                label="Spacing"
                value={supportSpacing}
                onChange={setSupportSpacing}
                min={2}
                max={5}
                onEditingChange={setEditingSupportLayout}
              />
              <Accordion type="single" collapsible variant="minimal" trailingDivider={false} className="advanced-options">
                <AccordionItem value="advanced">
                  <AccordionTrigger>Advanced options</AccordionTrigger>
                  <AccordionContent className="advanced-options-body">
                    <LabeledSlider
                      label="Plinth Angle"
                      value={plinthAngle}
                      onChange={setPlinthAngle}
                      min={0}
                      max={30}
                      step={1}
                      unit="°"
                    />
                    <LabeledSlider
                      label="Plinth Lift"
                      value={raiseBy}
                      onChange={setRaiseBy}
                      min={1}
                      max={30}
                    />
                    <LabeledSlider
                      label="Support Size"
                      value={supportSize}
                      onChange={handleSupportSize}
                      min={0.5}
                      max={2}
                    />
                    <CheckField checked={scaffoldingEnabled} onChange={setScaffoldingEnabled}>Add Scaffolding</CheckField>
                    {scaffoldingEnabled ? (
                      <LabeledSlider
                        label="Scaffolding Angle"
                        value={scaffoldingAngle}
                        onChange={setScaffoldingAngle}
                        min={15}
                        max={75}
                        step={1}
                        unit="°"
                      />
                    ) : null}
                    <LabeledSlider
                      label="Raft Thickness"
                      value={raftHeight}
                      onChange={setRaftHeight}
                      min={MIN_RAFT_HEIGHT}
                      max={MAX_RAFT_HEIGHT}
                      step={0.05}
                      unit="mm"
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          ) : null}

          <Separator />

          <SectionTitle onReset={resetFigure}>Preview Figures</SectionTitle>
          <CheckField checked={showFigure} onChange={handleShowFigure}>Show Size Guide Figure</CheckField>
          {showFigure ? (
            <MiniatureList
              miniatures={miniatures}
              editingId={editingMiniature}
              loadingIds={loadingMiniatures}
              onEdit={setEditingMiniature}
              onFigureChange={(id, figure: FigureEntry) => updateMiniature(id, { figure })}
              onDelete={deleteMiniature}
              onAdd={addMiniature}
            />
          ) : null}
        </div>

        {compact ? null : (
          <div className="sidebar-footer">
            {addDrillJig ? (
              <Button fullWidth disabled={downloadingJig} onClick={downloadJig}>
                {downloadingJig ? <Spinner label="Generating" /> : <DownloadIcon />}
                {downloadingJig ? 'Generating...' : 'Download Drill Jig (.stl)'}
              </Button>
            ) : null}
            <Button variant="primary" fullWidth disabled={downloadingPlinth} onClick={downloadPlinth}>
              {downloadingPlinth ? <Spinner label="Generating" /> : <DownloadIcon />}
              {downloadingPlinth ? 'Generating...' : 'Download Plinth (.stl)'}
            </Button>
          </div>
        )}
      </aside>

      <main className="viewport">
        <Viewport
          plinthParams={plinthParams}
          drillJigParams={drillJigParams}
          supportParams={supportParams}
          cavityGuide={hollowEnabled ? (editingHollow ?? (introPreview === 'hollow' ? 'outline' : null)) : null}
          showSupportGuide={editingSupportLayout || introPreview === 'supports'}
          showSupports={showSupportsInViewport}
          figures={showFigure ? miniatures.map((miniature) => ({ id: miniature.id, imagePath: miniature.figure.imagePath, position: miniature.position })) : []}
          onFigurePositionChange={handleMiniaturePosition}
          onFigureLoadingChange={handleMiniatureLoading}
          holeGuide={visibleHoleGuide}
          trimGuide={trimEnabled && editingTrimSection >= 0 ? { sections: trimDesign.sections, sectionIndex: editingTrimSection } : null}
          baseSegMM={0.5}
          filletSegMM={0.5}
        />
        <BuildingIndicator />
      </main>

      <HelpDialog ref={helpRef} />
    </div>
  )
}

export default App