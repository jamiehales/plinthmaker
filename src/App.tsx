import { useState } from 'react'
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
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import SquareIcon from '@mui/icons-material/Square'
import CircleIcon from '@mui/icons-material/Circle'
import Viewport from './components/Viewport.tsx'
import { type Shape, type PlinthParams, type RoundStyle, type RoundLocation, buildGeometry } from './components/Plinth.tsx'
import {
  type DrillJigParams,
  buildJigGeometry,
} from './components/DrillJig.tsx'
import LabeledSlider from './components/LabeledSlider.tsx'
import { exportSTL } from './components/exportSTL.ts'

const DRAWER_WIDTH = 500

function App() {
  const [shape, setShape] = useState<Shape>('rectangle')
  const [width, setWidth] = useState(20)
  const [depth, setDepth] = useState(20)
  const [height, setHeight] = useState(20)
  const [lockedAspect, setLockedAspect] = useState(true)
  const [addHole, setAddHole] = useState(false)
  const [holeDiameter, setHoleDiameter] = useState(5)
  const [holeDepth, setHoleDepth] = useState(5)
  const [addDrillJig, setAddDrillJig] = useState(false)
  const [jigWallSize, setJigWallSize] = useState(3)
  const [jigHeight, setJigHeight] = useState(10)
  const [jigOverlap, setJigOverlap] = useState(2)
  const [jigTolerance, setJigTolerance] = useState(0.1)
  const [jigLift, setJigLift] = useState(true)
  const [jigFlattenTop, setJigFlattenTop] = useState(true)
  const [angleTop, setAngleTop] = useState(false)
  const [topAngle, setTopAngle] = useState(30)
  const [roundStyle, setRoundStyle] = useState<RoundStyle>('none')
  const [roundLocation, setRoundLocation] = useState<RoundLocation>('none')
  const [roundSize, setRoundSize] = useState(1)
  const [downloadResolution, setDownloadResolution] = useState(0.05)

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

  const plinthParams: PlinthParams = {
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
  }

  const buildPlinthFilename = (p: PlinthParams, resMM: number) => {
    const roundPart = p.roundStyle === 'none' ? '' : `_${p.roundStyle}-${p.roundSize}_`
    const holePart = p.addHole ? `hole-${p.holeDiameter}mm` : 'hole-none'
    const anglePart = p.angleTop ? `angled-${p.topAngle}°` : 'flat'
    const um = Math.round(resMM * 1000)
    return `plinth_${p.shape}_${p.width}x${p.depth}x${p.height}_${anglePart}${roundPart}${holePart}_${um}um.stl`
  }

  const buildJigFilename = (p: PlinthParams, j: DrillJigParams) => {
    const anglePart = p.angleTop ? `${p.topAngle}°` : 'flat'
    const flattenPart = j.flattenTop ? 'flat' : 'angled'
    const holePart = p.addHole ? `hole-${p.holeDiameter}mm` : 'hole-none'
    return `plinth_drilljig_${p.width}x${p.depth}x${p.height}_${anglePart}_${flattenPart}_${holePart}.stl`
  }

  const drillJigParams: DrillJigParams = {
    enabled: addDrillJig,
    wallSize: jigWallSize,
    jigHeight,
    overlap: jigOverlap,
    tolerance: jigTolerance,
    lift: jigLift,
    flattenTop: jigFlattenTop,
  }

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
                  if (v !== 'none' && shape === 'ellipse' && roundLocation === 'none') setRoundLocation('top')
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
                    <ToggleButton value="none">None</ToggleButton>
                    <ToggleButton value="top">Top</ToggleButton>
                    <ToggleButton value="edges">Edges</ToggleButton>
                    <ToggleButton value="both">Both</ToggleButton>
                  </ToggleButtonGroup>
                ) : null}
                {roundLocation !== 'none' ? (
                  <LabeledSlider
                    label="Size"
                    value={roundSize}
                    onChange={setRoundSize}
                    min={0}
                    max={5}
                    step={0.1}
                  />
                ) : null}
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
                  startIcon={<DownloadIcon />}
                  onClick={() => {
                    const { jig: geo, cavity } = buildJigGeometry(shape, plinthParams, drillJigParams, downloadResolution, downloadResolution)
                    exportSTL(geo, buildJigFilename(plinthParams, drillJigParams))
                    geo.dispose()
                    cavity.dispose()
                  }}
                >
                  Download Drill Jig (.stl)
                </Button>
              ) : null}
              <Button
                variant="contained"
                fullWidth
                startIcon={<DownloadIcon />}
                onClick={() => {
                  const geo = buildGeometry(plinthParams, downloadResolution, downloadResolution)
                  exportSTL(geo, buildPlinthFilename(plinthParams, downloadResolution))
                  geo.dispose()
                }}
              >
                Download Plinth (.stl)
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
          height: '100vh',
          mt: '48px',
        }}
      >
        <Viewport
          plinthParams={plinthParams}
          drillJigParams={drillJigParams}
          baseSegMM={0.25}
          filletSegMM={0.25}
        />
      </Box>
    </Box>
  )
}

export default App