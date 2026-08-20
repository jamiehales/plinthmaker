import { useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Checkbox,
  Typography,
  Box,
  IconButton,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { HELP_TITLE, HELP_INTRO, HELP_SECTIONS } from '../helpContent.ts'

const STORAGE_KEY = 'plinthmaker.helpDismissed'

export interface HelpDialogHandle {
  open: () => void
}

const HelpDialog = forwardRef<HelpDialogHandle>((_props, ref) => {
  const [open, setOpen] = useState(false)
  const [dontShow, setDontShow] = useState(false)

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY) === '1'
      setDontShow(dismissed)
      if (!dismissed) setOpen(true)
    } catch {
      setOpen(true)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    open: () => {
      try {
        setDontShow(localStorage.getItem(STORAGE_KEY) === '1')
      } catch {
        setDontShow(false)
      }
      setOpen(true)
    },
  }))

  const toggleDontShow = (checked: boolean) => {
    setDontShow(checked)
    try {
      localStorage.setItem(STORAGE_KEY, checked ? '1' : '0')
    } catch {
      // ignore storage errors
    }
  }

  const close = () => setOpen(false)

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>{HELP_TITLE}</DialogTitle>
      <IconButton
        onClick={close}
        aria-label="close"
        sx={{ position: 'absolute', right: 8, top: 8, color: 'grey.500' }}
      >
        <CloseIcon />
      </IconButton>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
          {HELP_INTRO}
        </Typography>
        {HELP_SECTIONS.map((s) => (
          <Box key={s.title} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ color: 'primary.main' }}>
              {s.title}
            </Typography>
            <Typography variant="body2">{s.body}</Typography>
          </Box>
        ))}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={dontShow}
              onChange={(e) => toggleDontShow(e.target.checked)}
              size="small"
            />
          }
          label="Don't show this again"
          sx={{ '& .MuiFormControlLabel-label': { fontSize: 14 } }}
        />
        <Button onClick={close} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
})

HelpDialog.displayName = 'HelpDialog'

export default HelpDialog