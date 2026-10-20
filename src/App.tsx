import { useState, useMemo, useCallback, useRef, type CSSProperties } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  IconButton,
  SegmentedControl,
  SegmentedControlItem,
  Separator,
  Spinner,
  Textarea,
  TextLink,
  Tooltip,
} from '@jamiehales/next-kit/ui/mostlymaking'
import { CircleIcon, CopyIcon, DownloadIcon, EditIcon, HelpIcon, PasteIcon, SquareIcon } from './components/icons.tsx'
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
  DEFAULT_SHAPE, DEFAULT_WIDTH, DEFAULT_DEPTH, DEFAULT_HEIGHT, DEFAULT_LOCKED_ASPECT,
  DEFAULT_ADD_HOLE, DEFAULT_HOLE_DIAMETER, DEFAULT_HOLE_DEPTH, DEFAULT_ADD_DRILL_JIG,
  DEFAULT_JIG_WALL_SIZE, DEFAULT_JIG_HEIGHT, DEFAULT_JIG_OVERLAP, DEFAULT_JIG_TOLERANCE,
  DEFAULT_JIG_LIFT, DEFAULT_JIG_FLATTEN_TOP, DEFAULT_TOP_ANGLE,
  DEFAULT_ROUND_STYLE, DEFAULT_ROUND_LOCATION, DEFAULT_ROUND_SIZE, DEFAULT_DOWNLOAD_RESOLUTION,
  DEFAULT_ADD_SUPPORTS, DEFAULT_PLINTH_ANGLE, DEFAULT_RAISE_BY, DEFAULT_SUPPORT_SIZE,
  DEFAULT_SUPPORT_TIP_SIZE, DEFAULT_SUPPORT_SPACING, DEFAULT_INTERIOR_SPACING, DEFAULT_SUPPORT_CAPS,
  DEFAULT_LOCK_EDGE_SPACING_FILL, DRAWER_WIDTH,
  DEFAULT_SCAFFOLDING_ENABLED, DEFAULT_SCAFFOLDING_ANGLE,
  DEFAULT_RAFT_HEIGHT, MIN_RAFT_HEIGHT, MAX_RAFT_HEIGHT,
  DEFAULT_TRIM_ENABLED, DEFAULT_TRIM_PROFILE_ID, DEFAULT_TRIM_HEIGHT, DEFAULT_TRIM_SIZE,
  DEFAULT_CUSTOM_TRIM_POINTS, DEFAULT_MIN_HOLE_DIAMETER, DEFAULT_MAX_HOLE_DIAMETER,
  DEFAULT_HOLLOW_ENABLED, DEFAULT_HOLLOW_TOP_THICKNESS, DEFAULT_HOLLOW_WALL_THICKNESS,
  DEFAULT_SUCTION_HOLE_ENABLED, DEFAULT_SUCTION_HOLE_DIAMETER,
  TOP_ANGLE_PRESETS,
} from './defaults.ts'
import { TRIM_PROFILES, getTrimProfile, type TrimProfilePoint } from './components/trimProfiles.ts'
import TrimProfileIcon from './components/TrimProfileIcon.tsx'
import TrimProfileEditor from './components/TrimProfileEditor.tsx'
import PlinthAngleIcon from './components/PlinthAngleIcon.tsx'

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
  const [interiorSpacing, setInteriorSpacing] = useState(DEFAULT_INTERIOR_SPACING)
  const [lockEdgeToFill, setLockEdgeToFill] = useState(DEFAULT_LOCK_EDGE_SPACING_FILL)
  const [supportCaps] = useState(DEFAULT_SUPPORT_CAPS)
  const [scaffoldingEnabled, setScaffoldingEnabled] = useState(DEFAULT_SCAFFOLDING_ENABLED)
  const [scaffoldingAngle, setScaffoldingAngle] = useState(DEFAULT_SCAFFOLDING_ANGLE)
  const [raftHeight, setRaftHeight] = useState(DEFAULT_RAFT_HEIGHT)
  const [hollowEnabled, setHollowEnabled] = useState(DEFAULT_HOLLOW_ENABLED)
  const [topThickness, setTopThickness] = useState(DEFAULT_HOLLOW_TOP_THICKNESS)
  const [hollowWallThickness, setHollowWallThickness] = useState(DEFAULT_HOLLOW_WALL_THICKNESS)
  const [suctionHoleEnabled, setSuctionHoleEnabled] = useState(DEFAULT_SUCTION_HOLE_ENABLED)
  const [suctionHoleDiameter, setSuctionHoleDiameter] = useState(DEFAULT_SUCTION_HOLE_DIAMETER)
  const [trimEnabled, setTrimEnabled] = useState(DEFAULT_TRIM_ENABLED)
  const [trimProfileId, setTrimProfileId] = useState(DEFAULT_TRIM_PROFILE_ID)
  const [trimHeight, setTrimHeight] = useState(DEFAULT_TRIM_HEIGHT)
  const [trimSize, setTrimSize] = useState(DEFAULT_TRIM_SIZE)
  const [customTrimPoints, setCustomTrimPoints] = useState<TrimProfilePoint[]>(DEFAULT_CUSTOM_TRIM_POINTS)
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const { build } = useGeometryWorker()
  const helpRef = useRef<HelpDialogHandle>(null)

  const handleEditPreset = useCallback(() => {
    const preset = getTrimProfile(trimProfileId)
    if (preset.points.length > 0) {
      setCustomTrimPoints(preset.points.map((p) => ({ ...p, inHandle: p.inHandle ? { ...p.inHandle } : undefined, outHandle: p.outHandle ? { ...p.outHandle } : undefined })))
      setTrimProfileId('custom')
    }
  }, [trimProfileId])

  const handleSaveJson = useCallback(() => {
    setJsonText(JSON.stringify(customTrimPoints, null, 2))
    setJsonDialogOpen(true)
  }, [customTrimPoints])

  const handleLoadJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText)
      if (Array.isArray(parsed) && parsed.length >= 2) {
        setCustomTrimPoints(parsed)
        setJsonDialogOpen(false)
      }
    } catch {
      // ignore parse errors
    }
  }, [jsonText])

  const handleShape = (v: Shape) => {
    setShape(v)
    if (v === 'ellipse' && roundLocation !== 'top') setRoundLocation('top')
  }

  const handleWidth = (w: number) => {
    setWidth(w)
    if (lockedAspect) setDepth(w)
  }

  const handleLocked = (checked: boolean) => {
    setLockedAspect(checked)
    if (checked) setDepth(width)
  }

  const plinthParams: PlinthParams = useMemo(() => ({
    shape,
    width,
    depth,
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
    trimProfileId,
    trimHeight,
    trimSize,
    customTrimPoints: trimProfileId === 'custom' ? customTrimPoints : undefined,
    hollowEnabled,
    hollowHeight: height - topThickness,
    hollowWallThickness,
    suctionHoleEnabled,
    suctionHoleDiameter,
  }), [shape, width, depth, height, addHole, holeDiameter, holeDepth, topAngle, roundStyle, roundLocation, roundSize, trimEnabled, trimProfileId, trimHeight, trimSize, customTrimPoints, hollowEnabled, topThickness, hollowWallThickness, suctionHoleEnabled, suctionHoleDiameter])

  const buildPlinthFilename = useCallback((p: PlinthParams, resMM: number, supported: boolean) => {
    const roundPart = p.roundStyle === 'none' ? '' : `_${p.roundStyle}-${p.roundSize}_`
    const holePart = p.addHole ? `hole-${p.holeDiameter}mm` : 'hole-none'
    const anglePart = p.angleTop ? `angled-${p.topAngle}°` : 'flat'
    const trimPart = p.trimEnabled ? `_trim-${p.trimProfileId}-${p.trimHeight}x${p.trimSize}` : ''
    const hollowPart = p.hollowEnabled ? `_hollow-${p.height - p.hollowHeight}x${p.hollowWallThickness}` : ''
    const supportPart = supported ? '_supported' : '_unsupported'
    const um = Math.round(resMM * 1000)
    return `plinth_${p.shape}_${p.width}x${p.depth}x${p.height}_${anglePart}${roundPart}${holePart}${trimPart}${hollowPart}${supportPart}_${um}um.stl`
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

  const effectiveInteriorSpacing = lockEdgeToFill ? supportSpacing : interiorSpacing

  const supportParams: SupportParams = useMemo(() => ({
    enabled: addSupports,
    plinthAngle,
    raiseBy,
    supportSize,
    supportTipSize,
    supportSpacing,
    interiorSpacing: effectiveInteriorSpacing,
    supportCaps,
    scaffoldingEnabled,
    scaffoldingAngle,
    raftHeight,
  }), [addSupports, plinthAngle, raiseBy, supportSize, supportTipSize, supportSpacing, effectiveInteriorSpacing, supportCaps, scaffoldingEnabled, scaffoldingAngle, raftHeight])

  return (
    <div className="app" style={{ '--sidebar-width': `${DRAWER_WIDTH}px` } as CSSProperties}>
      <header className="topbar">
        <h1 className="topbar-title mm-type-logo">
          <TextLink href="https://mostlymaking.net" target="_blank" rel="noopener noreferrer">
            mostlymaking.
          </TextLink>
          plinths
        </h1>
        <IconButton variant="ghost" aria-label="Help" onClick={() => helpRef.current?.open()}>
          <HelpIcon />
        </IconButton>
      </header>

      <aside className="sidebar">
        <div className="sidebar-scroll">
          <SectionTitle>Shape</SectionTitle>
          <SegmentedControl className="fill-row" value={shape} onValueChange={(v) => handleShape(v as Shape)} aria-label="Shape">
            <SegmentedControlItem value="rectangle">
              <SquareIcon /> Rectangle
            </SegmentedControlItem>
            <SegmentedControlItem value="ellipse">
              <CircleIcon /> Ellipse
            </SegmentedControlItem>
          </SegmentedControl>

          <SectionTitle>Dimensions</SectionTitle>
          <LabeledSlider label="Width" value={width} onChange={handleWidth} min={20} max={150} />
          <LabeledSlider
            label="Depth"
            value={depth}
            onChange={setDepth}
            min={20}
            max={150}
            disabled={lockedAspect}
          />
          <CheckField checked={lockedAspect} onChange={handleLocked}>Lock Depth to Width</CheckField>

          <LabeledSlider label="Height" value={height} onChange={setHeight} min={20} max={150} />

          <SectionTitle>Top Angle</SectionTitle>
          <SegmentedControl
            className="fill-row tall"
            value={String(topAnglePreset)}
            onValueChange={(v) => {
              const preset = v === 'custom' ? 'custom' : Number(v)
              setTopAnglePreset(preset)
              if (preset !== 'custom') setTopAngle(preset)
            }}
            aria-label="Top angle"
          >
            {TOP_ANGLE_PRESETS.map((a) => (
              <SegmentedControlItem key={a} value={String(a)}>
                <PlinthAngleIcon angle={a} selected={topAnglePreset === a} />
                <span className="seg-caption">{a}°</span>
              </SegmentedControlItem>
            ))}
            <SegmentedControlItem value="custom">
              <PlinthAngleIcon angle={topAnglePreset === 'custom' ? topAngle : 30} selected={topAnglePreset === 'custom'} />
              <span className="seg-caption">Custom</span>
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

          <SectionTitle>Chamfer / Fillet</SectionTitle>
          <SegmentedControl className="fill-row" value={roundStyle} onValueChange={(v) => setRoundStyle(v as RoundStyle)} aria-label="Edge style">
            <SegmentedControlItem value="none">None</SegmentedControlItem>
            <SegmentedControlItem value="chamfer">Chamfer</SegmentedControlItem>
            <SegmentedControlItem value="fillet">Fillet</SegmentedControlItem>
          </SegmentedControl>
          {roundStyle !== 'none' ? (
            <>
              {shape === 'rectangle' ? (
                <SegmentedControl className="fill-row" value={roundLocation} onValueChange={(v) => setRoundLocation(v as RoundLocation)} aria-label="Edge location">
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

          <SectionTitle>Trim</SectionTitle>
          <CheckField checked={trimEnabled} onChange={setTrimEnabled}>Add Trim</CheckField>
          {trimEnabled ? (
            <>
              <SegmentedControl className="fill-row" value={trimProfileId} onValueChange={setTrimProfileId} aria-label="Trim profile">
                {TRIM_PROFILES.map((tp) => {
                  const profile = tp.id === 'custom'
                    ? { ...tp, points: customTrimPoints }
                    : tp
                  return (
                    <Tooltip key={tp.id} content={tp.name} side="top">
                      <SegmentedControlItem value={tp.id} aria-label={tp.name}>
                        <TrimProfileIcon profile={profile} selected={trimProfileId === tp.id} />
                      </SegmentedControlItem>
                    </Tooltip>
                  )
                })}
              </SegmentedControl>
              {trimProfileId !== 'custom' ? (
                <div className="center-row">
                  <Button size="sm" onClick={handleEditPreset}>
                    <EditIcon /> Edit Preset
                  </Button>
                </div>
              ) : null}
              {trimProfileId === 'custom' ? (
                <div>
                  <div className="center-row">
                    <TrimProfileEditor
                      points={customTrimPoints}
                      onChange={setCustomTrimPoints}
                    />
                  </div>
                  <div className="center-row">
                    <Button size="sm" onClick={handleSaveJson}>
                      <CopyIcon /> Export
                    </Button>
                    <Button size="sm" onClick={() => { setJsonDialogOpen(true) }}>
                      <PasteIcon /> Import
                    </Button>
                  </div>
                </div>
              ) : null}
              <LabeledSlider
                label="Trim Height"
                value={trimHeight}
                onChange={setTrimHeight}
                min={1}
                max={height - 1}
                step={0.5}
              />
              <LabeledSlider
                label="Trim Size"
                value={trimSize}
                onChange={setTrimSize}
                min={0.5}
                max={15}
                step={0.5}
              />
            </>
          ) : null}

          <Separator />

          <SectionTitle>Plinth Hole</SectionTitle>
          <CheckField checked={addHole} onChange={setAddHole}>Add Hole</CheckField>
          {addHole ? (
            <>
              <LabeledSlider label="Hole Diameter" value={holeDiameter} onChange={(v) => { setHoleDiameter(v); if (!(jigDiffHole && addHole)) setJigHoleDiameter(v) }} min={DEFAULT_MIN_HOLE_DIAMETER} max={DEFAULT_MAX_HOLE_DIAMETER} step={0.5} />
              <LabeledSlider
                label="Hole Depth"
                value={holeDepth}
                onChange={setHoleDepth}
                min={1}
                max={50}
              />
            </>
          ) : null}

          <Separator />

          <SectionTitle>Hollow</SectionTitle>
          <CheckField checked={hollowEnabled} onChange={setHollowEnabled}>Enable Hollowing</CheckField>
          {hollowEnabled ? (
            <>
              <LabeledSlider
                label="Top Thickness"
                value={topThickness}
                onChange={setTopThickness}
                min={1}
                max={height - 1}
                step={0.5}
              />
              <LabeledSlider
                label="Wall Thickness"
                value={hollowWallThickness}
                onChange={setHollowWallThickness}
                min={0.5}
                max={Math.min(width, depth) / 2 - 0.5}
                step={0.1}
              />
              <CheckField checked={suctionHoleEnabled} onChange={setSuctionHoleEnabled}>
                Add Hole for Suction Cup prevention
              </CheckField>
              {suctionHoleEnabled ? (
                <LabeledSlider
                  label="Hole Diameter"
                  value={suctionHoleDiameter}
                  onChange={setSuctionHoleDiameter}
                  min={1}
                  max={Math.min(width, depth) - 2 * hollowWallThickness}
                  step={0.5}
                />
              ) : null}
            </>
          ) : null}

          <Separator />

          <SectionTitle>Drill Jig</SectionTitle>
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
              <CheckField checked={jigFlattenTop} onChange={setJigFlattenTop}>Flatten Top</CheckField>
            </>
          ) : null}

          <Separator />

          <SectionTitle>Supports</SectionTitle>
          <CheckField checked={addSupports} onChange={setAddSupports}>Generate Resin Supports</CheckField>
          {addSupports ? (
            <>
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
                label="Raise By"
                value={raiseBy}
                onChange={setRaiseBy}
                min={1}
                max={30}
              />
              <LabeledSlider
                label="Support Size"
                value={supportSize}
                onChange={setSupportSize}
                min={0.5}
                max={2}
              />
              <LabeledSlider
                label="Support Tip Size"
                value={supportTipSize}
                onChange={setSupportTipSize}
                min={0}
                max={0.5}
                step={0.025}
              />
              <LabeledSlider
                label="Support Spacing (Edges)"
                value={supportSpacing}
                onChange={setSupportSpacing}
                min={2}
                max={5}
              />
              <CheckField
                checked={lockEdgeToFill}
                onChange={(checked) => {
                  setLockEdgeToFill(checked)
                  if (checked) setInteriorSpacing(supportSpacing)
                }}
              >
                Lock Edge Spacing to Fill
              </CheckField>
              <LabeledSlider
                label="Support Spacing (Fill)"
                value={lockEdgeToFill ? supportSpacing : interiorSpacing}
                onChange={(v) => {
                  if (lockEdgeToFill) {
                    setSupportSpacing(v)
                    setInteriorSpacing(v)
                  } else {
                    setInteriorSpacing(v)
                  }
                }}
                min={2}
                max={5}
                disabled={lockEdgeToFill}
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
            </>
          ) : null}
        </div>

        <div className="sidebar-footer">
          {addDrillJig ? (
            <Button
              className="fill-button"
              disabled={downloadingJig}
              onClick={async () => {
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
              }}
            >
              {downloadingJig ? <Spinner label="Generating" /> : <DownloadIcon />}
              {downloadingJig ? 'Generating...' : 'Download Drill Jig (.stl)'}
            </Button>
          ) : null}
          <Button
            variant="primary"
            className="fill-button"
            disabled={downloadingPlinth}
            onClick={async () => {
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
            }}
          >
            {downloadingPlinth ? <Spinner label="Generating" /> : <DownloadIcon />}
            {downloadingPlinth ? 'Generating...' : 'Download Plinth (.stl)'}
          </Button>
        </div>
      </aside>

      <main className="viewport">
        <Viewport
          plinthParams={plinthParams}
          drillJigParams={drillJigParams}
          supportParams={supportParams}
          baseSegMM={0.5}
          filletSegMM={0.5}
        />
        <BuildingIndicator />
      </main>

      <Dialog open={jsonDialogOpen} onOpenChange={setJsonDialogOpen}>
        <DialogContent className="json-dialog" aria-describedby={undefined}>
          <DialogTitle>Trim Profile JSON</DialogTitle>
          <Textarea
            className="json-text"
            rows={10}
            aria-label="Trim profile JSON"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setJsonDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleLoadJson}>Load</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HelpDialog ref={helpRef} />
    </div>
  )
}

export default App