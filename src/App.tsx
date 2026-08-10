import { useState, useMemo, useCallback } from 'react'
import {
  Box,
  Drawer,
  Toolbar,
  Typography,
  AppBar,
  ToggleButtonGroup,
  ToggleButton,
  FormControlLabel,
  Checkbox,
  Divider,
  Button,
  CircularProgress,
  Tooltip,
  Link,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import SquareIcon from '@mui/icons-material/Square'
import CircleIcon from '@mui/icons-material/Circle'
import EditIcon from '@mui/icons-material/Edit'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'
import Viewport from './components/Viewport.tsx'
import { type Shape, type PlinthParams, type RoundStyle, type RoundLocation, type SupportParams } from './components/geometryBuilder.ts'
import { type DrillJigParams } from './components/geometryBuilder.ts'
import { useGeometryWorker, deserializeGeometry, useBuilding } from './components/useGeometryWorker.ts'
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
  DEFAULT_SUPPORT_TIP_SIZE, DEFAULT_SUPPORT_SPACING, DEFAULT_INTERIOR_SPACING, DEFAULT_SUPPORT_CAPS, DRAWER_WIDTH,
  DEFAULT_SCAFFOLDING_ENABLED, DEFAULT_SCAFFOLDING_ANGLE,
  DEFAULT_TRIM_ENABLED, DEFAULT_TRIM_PROFILE_ID, DEFAULT_TRIM_HEIGHT, DEFAULT_TRIM_SIZE,
  DEFAULT_CUSTOM_TRIM_POINTS, DEFAULT_MIN_HOLE_DIAMETER, DEFAULT_MAX_HOLE_DIAMETER,
  DEFAULT_HOLLOW_ENABLED, DEFAULT_HOLLOW_TOP_THICKNESS, DEFAULT_HOLLOW_WALL_THICKNESS,
  DEFAULT_SUCTION_HOLE_ENABLED, DEFAULT_SUCTION_HOLE_DIAMETER,
} from './defaults.ts'
import { TRIM_PROFILES, getTrimProfile, type TrimProfilePoint } from './components/trimProfiles.ts'
import TrimProfileIcon from './components/TrimProfileIcon.tsx'
import TrimProfileEditor from './components/TrimProfileEditor.tsx'

function BuildingIndicator() {
  const building = useBuilding()
  return (
    <div style={{
      position: 'absolute',
      bottom: '16px',
      left: '16px',
      display: building ? 'flex' : 'none',
      alignItems: 'center',
      gap: '8px',
      color: '#fff',
      fontSize: '14px',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 9999,
      background: 'rgba(0,0,0,0.7)',
      padding: '6px 10px',
    }}>
      <div style={{
        width: '20px',
        height: '20px',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      Generating…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
  const [roundStyle, setRoundStyle] = useState<RoundStyle>(DEFAULT_ROUND_STYLE)
  const [roundLocation, setRoundLocation] = useState<RoundLocation>(DEFAULT_ROUND_LOCATION)
  const [roundSize, setRoundSize] = useState(DEFAULT_ROUND_SIZE)
  const [downloadResolution, setDownloadResolution] = useState(DEFAULT_DOWNLOAD_RESOLUTION)
  const [downloadingPlinth, setDownloadingPlinth] = useState(false)
  const [downloadingJig, setDownloadingJig] = useState(false)
  const [addSupports, setAddSupports] = useState(DEFAULT_ADD_SUPPORTS)
  const [plinthAngle, setPlinthAngle] = useState(DEFAULT_PLINTH_ANGLE)
  const [raiseBy, setRaiseBy] = useState(DEFAULT_RAISE_BY)
  const [supportSize, setSupportSize] = useState(DEFAULT_SUPPORT_SIZE)
  const [supportTipSize, setSupportTipSize] = useState(DEFAULT_SUPPORT_TIP_SIZE)
  const [supportSpacing, setSupportSpacing] = useState(DEFAULT_SUPPORT_SPACING)
  const [interiorSpacing, setInteriorSpacing] = useState(DEFAULT_INTERIOR_SPACING)
  const [lockEdgeToFill, setLockEdgeToFill] = useState(true)
  const [supportCaps] = useState(DEFAULT_SUPPORT_CAPS)
  const [scaffoldingEnabled, setScaffoldingEnabled] = useState(DEFAULT_SCAFFOLDING_ENABLED)
  const [scaffoldingAngle, setScaffoldingAngle] = useState(DEFAULT_SCAFFOLDING_ANGLE)
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

  const handleShape = (_e: unknown, v: Shape | null) => {
    if (v !== null) {
      setShape(v)
      if (v === 'ellipse' && roundLocation !== 'top') setRoundLocation('top')
    }
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

  const buildPlinthFilename = useCallback((p: PlinthParams, resMM: number) => {
    const roundPart = p.roundStyle === 'none' ? '' : `_${p.roundStyle}-${p.roundSize}_`
    const holePart = p.addHole ? `hole-${p.holeDiameter}mm` : 'hole-none'
    const anglePart = p.angleTop ? `angled-${p.topAngle}°` : 'flat'
    const trimPart = p.trimEnabled ? `_trim-${p.trimProfileId}-${p.trimHeight}x${p.trimSize}` : ''
    const um = Math.round(resMM * 1000)
    return `plinth_${p.shape}_${p.width}x${p.depth}x${p.height}_${anglePart}${roundPart}${holePart}${trimPart}_${um}um.stl`
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
  }), [addSupports, plinthAngle, raiseBy, supportSize, supportTipSize, supportSpacing, effectiveInteriorSpacing, supportCaps, scaffoldingEnabled, scaffoldingAngle])

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar variant="dense">
          <Typography
            component="h1"
            noWrap
            sx={{
              fontFamily: '"Elms Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: '1.25rem',
              fontWeight: 400,
              letterSpacing: '0.02em',
            }}
          >
            <Link href="https://mostlymaking.net" target="_blank" rel="noopener noreferrer" color="inherit" underline="hover">
              mostlymaking.
            </Link>
            plinths
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            top: 48,
            height: 'calc(100% - 48px)',
          },
        }}
        open
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ p: 2, overflowY: 'auto', flexGrow: 1 }}>
            <Typography variant="overline" sx={{ color: 'primary.main', fontSize: '0.9rem', fontWeight: 600 }}>
              Shape
            </Typography>
            <ToggleButtonGroup
              value={shape}
              exclusive
              onChange={handleShape}
              size="small"
              fullWidth
              sx={{ mb: 1 }}
            >
              <ToggleButton value="rectangle">
                <SquareIcon sx={{ mr: 0.75 }} fontSize="small" />
                Rectangle
              </ToggleButton>
              <ToggleButton value="ellipse">
                <CircleIcon sx={{ mr: 0.75 }} fontSize="small" />
                Ellipse
              </ToggleButton>
            </ToggleButtonGroup>

            <Typography variant="overline" sx={{ color: 'primary.main', fontSize: '0.9rem', fontWeight: 600 }}>
              Dimensions
            </Typography>
            <LabeledSlider label="Width" value={width} onChange={handleWidth} min={20} max={60} />
            <LabeledSlider
              label="Depth"
              value={depth}
              onChange={setDepth}
              min={20}
              max={60}
              disabled={lockedAspect}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={lockedAspect}
                  onChange={(e) => handleLocked(e.target.checked)}
                  size="small"
                />
              }
              label="Lock Depth to Width"
              sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
            />

            <LabeledSlider label="Height" value={height} onChange={setHeight} min={20} max={60} />

            <LabeledSlider
              label="Top Angle"
              value={topAngle}
              onChange={setTopAngle}
              min={0}
              max={45}
              step={1}
              unit="°"
            />

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="overline" sx={{ color: 'primary.main', fontSize: '0.9rem', fontWeight: 600 }}>
              Chamfer / Fillet
            </Typography>
            <ToggleButtonGroup
              value={roundStyle}
              exclusive
              onChange={(_e, v: RoundStyle | null) => {
                if (v !== null) {
                  setRoundStyle(v)
                }
              }}
              size="small"
              fullWidth
              sx={{ mb: 1 }}
            >
              <ToggleButton value="none">None</ToggleButton>
              <ToggleButton value="chamfer">Chamfer</ToggleButton>
              <ToggleButton value="fillet">Fillet</ToggleButton>
            </ToggleButtonGroup>
            {roundStyle !== 'none' ? (
              <>
                {shape === 'rectangle' ? (
                  <ToggleButtonGroup
                    value={roundLocation}
                    exclusive
                    onChange={(_e, v: RoundLocation | null) => { if (v !== null) setRoundLocation(v) }}
                    size="small"
                    fullWidth
                    sx={{ mb: 1 }}
                  >
                    <ToggleButton value="top">Top</ToggleButton>
                    <ToggleButton value="edges">Edges</ToggleButton>
                    <ToggleButton value="both">Both</ToggleButton>
                  </ToggleButtonGroup>
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

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="overline" sx={{ color: 'primary.main', fontSize: '0.9rem', fontWeight: 600 }}>
              Trim
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={trimEnabled}
                  onChange={(e) => setTrimEnabled(e.target.checked)}
                  size="small"
                />
              }
              label="Add Trim"
              sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
            />
            {trimEnabled ? (
              <>
                <ToggleButtonGroup
                  value={trimProfileId}
                  exclusive
                  onChange={(_e, v: string | null) => { if (v !== null) setTrimProfileId(v) }}
                  size="small"
                  fullWidth
                  sx={{ mb: 1 }}
                >
                  {TRIM_PROFILES.map((tp) => {
                    const profile = tp.id === 'custom'
                      ? { ...tp, points: customTrimPoints }
                      : tp
                    return (
                    <Tooltip key={tp.id} title={tp.name} placement="top" arrow>
                      <ToggleButton
                        value={tp.id}
                        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 0.75 }}
                      >
                        <TrimProfileIcon profile={profile} selected={trimProfileId === tp.id} />
                      </ToggleButton>
                    </Tooltip>
                    )
                  })}
                </ToggleButtonGroup>
                {trimProfileId !== 'custom' ? (
                  <Box sx={{ mb: 1, display: 'flex', justifyContent: 'center' }}>
                    <Button
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={handleEditPreset}
                      variant="outlined"
                    >
                      Edit Preset
                    </Button>
                  </Box>
                ) : null}
                {trimProfileId === 'custom' ? (
                  <Box sx={{ mb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                      <TrimProfileEditor
                        points={customTrimPoints}
                        onChange={setCustomTrimPoints}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                      <Button
                        size="small"
                        startIcon={<ContentCopyIcon />}
                        onClick={handleSaveJson}
                        variant="outlined"
                      >
                        Export
                      </Button>
                      <Button
                        size="small"
                        startIcon={<ContentPasteIcon />}
                        onClick={() => { setJsonDialogOpen(true) }}
                        variant="outlined"
                      >
                        Import
                      </Button>
                    </Box>
                  </Box>
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

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="overline" sx={{ color: 'primary.main', fontSize: '0.9rem', fontWeight: 600 }}>
              Plinth Hole
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={addHole}
                  onChange={(e) => setAddHole(e.target.checked)}
                  size="small"
                />
              }
              label="Add Hole"
              sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
            />
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

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="overline" sx={{ color: 'primary.main', fontSize: '0.9rem', fontWeight: 600 }}>
              Hollow
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={hollowEnabled}
                  onChange={(e) => setHollowEnabled(e.target.checked)}
                  size="small"
                />
              }
              label="Enable Hollowing"
              sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
            />
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
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={suctionHoleEnabled}
                      onChange={(e) => setSuctionHoleEnabled(e.target.checked)}
                      size="small"
                    />
                  }
                  label="Add Hole for Suction Cup prevention"
                  sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
                />
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

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="overline" sx={{ color: 'primary.main', fontSize: '0.9rem', fontWeight: 600 }}>
              Drill Jig
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={addDrillJig}
                  onChange={(e) => setAddDrillJig(e.target.checked)}
                  size="small"
                />
              }
              label="Generate Drill Jig"
              sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
            />
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
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={jigDiffHole}
                        onChange={(e) => setJigDiffHole(e.target.checked)}
                        size="small"
                      />
                    }
                    label="Use Different Hole Size to Plinth"
                    sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
                  />
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
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={jigLift}
                      onChange={(e) => setJigLift(e.target.checked)}
                      size="small"
                    />
                  }
                  label="Lift Drill Jig"
                  sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={jigFlattenTop}
                      onChange={(e) => setJigFlattenTop(e.target.checked)}
                      size="small"
                    />
                  }
                  label="Flatten Top"
                  sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
                />
              </>
            ) : null}

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="overline" sx={{ color: 'primary.main', fontSize: '0.9rem', fontWeight: 600 }}>
              Supports
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={addSupports}
                  onChange={(e) => setAddSupports(e.target.checked)}
                  size="small"
                />
              }
              label="Generate Resin Supports"
              sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
            />
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
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={lockEdgeToFill}
                      onChange={(e) => {
                        setLockEdgeToFill(e.target.checked)
                        if (e.target.checked) setInteriorSpacing(supportSpacing)
                      }}
                      size="small"
                    />
                  }
                  label="Lock Edge Spacing to Fill"
                  sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
                />
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
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={scaffoldingEnabled}
                      onChange={(e) => setScaffoldingEnabled(e.target.checked)}
                      size="small"
                    />
                  }
                  label="Add Scaffolding"
                  sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
                />
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
              </>
            ) : null}
          </Box>

          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.75 }}>
              Download Resolution
            </Typography>
            <ToggleButtonGroup
              value={downloadResolution}
              exclusive
              onChange={(_e, v: number | null) => { if (v !== null) setDownloadResolution(v) }}
              size="small"
              fullWidth
              sx={{ mb: 1.5 }}
            >
              <ToggleButton value={0.03}>30um</ToggleButton>
              <ToggleButton value={0.05}>50um</ToggleButton>
              <ToggleButton value={0.1}>100um</ToggleButton>
              <ToggleButton value={0.2}>200um</ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {addDrillJig ? (
                <Button
                  variant="contained"
                  fullWidth
                  color="secondary"
                  disabled={downloadingJig}
                  startIcon={downloadingJig ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
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
                  {downloadingJig ? 'Generating...' : 'Download Drill Jig (.stl)'}
                </Button>
              ) : null}
              <Button
                variant="contained"
                fullWidth
                disabled={downloadingPlinth}
                startIcon={downloadingPlinth ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
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
                      exportSTL(zup, buildPlinthFilename(plinthParams, downloadResolution))
                      if (merged !== transformedPlinth) merged.dispose()
                      transformedPlinth.dispose()
                      supportGeo.dispose()
                      zup.dispose()
                    } else {
                      const zup = applyYUpToZUp(geo)
                      exportSTL(zup, buildPlinthFilename(plinthParams, downloadResolution))
                      zup.dispose()
                    }
                    geo.dispose()
                  } finally {
                    setDownloadingPlinth(false)
                  }
                }}
              >
                {downloadingPlinth ? 'Generating...' : 'Download Plinth (.stl)'}
              </Button>
            </Box>
          </Box>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          position: 'relative',
          height: 'calc(100vh - 48px)',
          mt: '48px',
        }}
      >
        <Viewport
          plinthParams={plinthParams}
          drillJigParams={drillJigParams}
          supportParams={supportParams}
          baseSegMM={0.5}
          filletSegMM={0.5}
        />
        <BuildingIndicator />
      </Box>

      <Dialog open={jsonDialogOpen} onClose={() => setJsonDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Trim Profile JSON</DialogTitle>
        <DialogContent>
          <TextField
            multiline
            fullWidth
            minRows={6}
            maxRows={16}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            sx={{ mt: 1, fontFamily: 'monospace' }}
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJsonDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleLoadJson} variant="contained">Load</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default App