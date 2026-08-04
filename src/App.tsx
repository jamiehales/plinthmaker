import { Box, Drawer, Toolbar, Typography, AppBar } from '@mui/material'
import Viewport from './components/Viewport.tsx'

const DRAWER_WIDTH = 340

function App() {
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
          {/* Parameter controls will go here */}
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
        <Viewport />
      </Box>
    </Box>
  )
}

export default App