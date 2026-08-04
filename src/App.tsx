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
} from '@mui/material'
import SquareIcon from '@mui/icons-material/Square'
import CircleIcon from '@mui/icons-material/Circle'
import Viewport from './components/Viewport.tsx'
import { type Shape, type PlinthParams } from './components/Plinth.tsx'
import LabeledSlider from './components/LabeledSlider.tsx'

const DRAWER_WIDTH = 340

function App() {
  const [shape, setShape] = useState<Shape>('rectangle')
  const [width, setWidth] = useState(20)
  const [depth, setDepth] = useState(20)
  const [height, setHeight] = useState(10)
  const [lockedAspect, setLockedAspect] = useState(true)
  const [addHole, setAddHole] = useState(false)
  const [holeDiameter, setHoleDiameter] = useState(5)
  const [holeDepth, setHoleDepth] = useState(5)

  const handleShape = (_e: unknown, v: Shape | null) => {
    if (v !== null) setShape(v)
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
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar variant="dense">
          <Typography variant="h6" component="h1" noWrap>
            Plinth Maker
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
        <Box sx={{ p: 2, overflowY: 'auto', height: '100%' }}>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>
            Shape
          </Typography>
          <ToggleButtonGroup
            value={shape}
            exclusive
            onChange={handleShape}
            size="small"
            fullWidth
            sx={{ mb: 2 }}
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
          <LabeledSlider label="Width" value={width} onChange={handleWidth} min={10} max={200} />
          {!lockedAspect ? (
            <LabeledSlider
              label="Depth"
              value={depth}
              onChange={setDepth}
              min={10}
              max={200}
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
            sx={{ display: 'flex', mb: 1, '& .MuiFormControlLabel-label': { fontSize: 14 } }}
          />

          <LabeledSlider label="Height" value={height} onChange={setHeight} min={10} max={200} />

          <Divider sx={{ my: 2 }} />

          <FormControlLabel
            control={
              <Checkbox
                checked={addHole}
                onChange={(e) => setAddHole(e.target.checked)}
                size="small"
              />
            }
            label="Add Hole"
            sx={{ display: 'flex', mb: 1, '& .MuiFormControlLabel-label': { fontSize: 14 } }}
          />
          {addHole ? (
            <>
              <LabeledSlider
                label="Hole Diameter"
                value={holeDiameter}
                onChange={setHoleDiameter}
                min={1}
                max={10}
                step={0.5}
              />
              <LabeledSlider
                label="Hole Depth"
                value={holeDepth}
                onChange={setHoleDepth}
                min={1}
                max={50}
              />
            </>
          ) : null}
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
        <Viewport plinthParams={plinthParams} />
      </Box>
    </Box>
  )
}

export default App