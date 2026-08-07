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
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import SquareIcon from '@mui/icons-material/Square'
import CircleIcon from '@mui/icons-material/Circle'
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
  DEFAULT_JIG_LIFT, DEFAULT_JIG_FLATTEN_TOP, DEFAULT_ANGLE_TOP, DEFAULT_TOP_ANGLE,
  DEFAULT_ROUND_STYLE, DEFAULT_ROUND_LOCATION, DEFAULT_ROUND_SIZE, DEFAULT_DOWNLOAD_RESOLUTION,
  DEFAULT_ADD_SUPPORTS, DEFAULT_PLINTH_ANGLE, DEFAULT_RAISE_BY, DEFAULT_SUPPORT_SIZE,
  DEFAULT_SUPPORT_TIP_SIZE, DEFAULT_SUPPORT_SPACING, DEFAULT_SUPPORT_CAPS, DRAWER_WIDTH,
} from './defaults.ts'

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
  const [angleTop, setAngleTop] = useState(DEFAULT_ANGLE_TOP)
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
  const [supportCaps, setSupportCaps] = useState(DEFAULT_SUPPORT_CAPS)
  const { build } = useGeometryWorker()

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
    angleTop,
    topAngle,
    roundStyle,
    roundLocation: shape === 'ellipse' ? 'top' : roundLocation,
    roundSize,
  }), [shape, width, depth, height, addHole, holeDiameter, holeDepth, angleTop, topAngle, roundStyle, roundLocation, roundSize])

  const buildPlinthFilename = useCallback((p: PlinthParams, resMM: number) => {
    const roundPart = p.roundStyle === 'none' ? '' : `_${p.roundStyle}-${p.roundSize}_`
    const holePart = p.addHole ? `hole-${p.holeDiameter}mm` : 'hole-none'
    const anglePart = p.angleTop ? `angled-${p.topAngle}°` : 'flat'
    const um = Math.round(resMM * 1000)
    return `plinth_${p.shape}_${p.width}x${p.depth}x${p.height}_${anglePart}${roundPart}${holePart}_${um}um.stl`
  }, [])

  const buildJigFilename = useCallback((p: PlinthParams, j: DrillJigParams) => {
    const anglePart = p.angleTop ? `${p.topAngle}°` : 'flat'
    const flattenPart = j.flattenTop ? 'flat' : 'angled'
    const holePart = p.addHole ? `hole-${p.holeDiameter}mm` : 'hole-none'
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
  }), [addDrillJig, jigWallSize, jigHeight, jigOverlap, jigTolerance, jigLift, jigFlattenTop])

  const supportParams: SupportParams = useMemo(() => ({
    enabled: addSupports,
    plinthAngle,
    raiseBy,
    supportSize,
    supportTipSize,
    supportSpacing,
    supportCaps,
  }), [addSupports, plinthAngle, raiseBy, supportSize, supportTipSize, supportSpacing, supportCaps])

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar variant="dense">
          <Typography variant="h6" component="h1" noWrap>
            mostlymaking.plinths
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
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>
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

            <Typography variant="overline" sx={{ color: 'text.secondary' }}>
              Dimensions
            </Typography>
            <LabeledSlider label="Width" value={width} onChange={handleWidth} min={20} max={60} />
            {!lockedAspect ? (
              <LabeledSlider
                label="Depth"
                value={depth}
                onChange={setDepth}
                min={20}
                max={60}
              />
            ) : null}
            <FormControlLabel
              control={
                <Checkbox
                  checked={lockedAspect}
                  onChange={(e) => handleLocked(e.target.checked)}
                  size="small"
                />
              }
              label="Locked Aspect Ratio"
              sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
            />

            <LabeledSlider label="Height" value={height} onChange={setHeight} min={20} max={60} />

            <FormControlLabel
              control={
                <Checkbox
                  checked={angleTop}
                  onChange={(e) => setAngleTop(e.target.checked)}
                  size="small"
                />
              }
              label="Angle Top"
              sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
            />
            {angleTop ? (
              <LabeledSlider
                label="Top Angle"
                value={topAngle}
                onChange={setTopAngle}
                min={1}
                max={45}
                step={1}
                unit="°"
              />
            ) : null}

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="overline" sx={{ color: 'text.secondary' }}>
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

            <LabeledSlider label="Hole Diameter" value={holeDiameter} onChange={setHoleDiameter} min={2} max={8} step={0.5} />

            <FormControlLabel
              control={
                <Checkbox
                  checked={addHole}
                  onChange={(e) => setAddHole(e.target.checked)}
                  size="small"
                />
              }
              label="Add Hole to Plinth"
              sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
            />
            {addHole ? (
              <LabeledSlider
                label="Hole Depth"
                value={holeDepth}
                onChange={setHoleDepth}
                min={1}
                max={50}
              />
            ) : null}

            <Divider sx={{ my: 1.5 }} />

            <FormControlLabel
              control={
                <Checkbox
                  checked={addDrillJig}
                  onChange={(e) => setAddDrillJig(e.target.checked)}
                  size="small"
                />
              }
              label="Add Drill Jig"
              sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
            />
            {addDrillJig ? (
              <>
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

            <FormControlLabel
              control={
                <Checkbox
                  checked={addSupports}
                  onChange={(e) => setAddSupports(e.target.checked)}
                  size="small"
                />
              }
              label="Add Supports"
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
                  min={0}
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
                  label="Support Spacing"
                  value={supportSpacing}
                  onChange={setSupportSpacing}
                  min={2}
                  max={5}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={supportCaps}
                      onChange={(e) => setSupportCaps(e.target.checked)}
                      size="small"
                    />
                  }
                  label="Support Caps"
                  sx={{ display: 'flex', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
                />
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
                      const supportGeo = buildSupportMeshGeometry(shape, plinthParams, supportParams, 16)
                      const transformedPlinth = applySupportTransform(geo, supportParams)
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
          baseSegMM={1}
          filletSegMM={1}
        />
        <BuildingIndicator />
      </Box>
    </Box>
  )
}

export default App