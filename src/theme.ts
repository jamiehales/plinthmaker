import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0b0d10',
      paper: '#14181d',
    },
  },
  shape: {
    borderRadius: 8,
  },
})

export default theme