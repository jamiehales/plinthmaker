import { useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@jamiehales/ui-kit/mostlymaking'
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="help-dialog">
        <DialogTitle>{HELP_TITLE}</DialogTitle>
        <DialogDescription>{HELP_INTRO}</DialogDescription>
        <div className="help-sections">
          {HELP_SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="mm-type-label help-section-title">{s.title}</h3>
              <p className="mm-type-small">{s.body}</p>
            </section>
          ))}
        </div>
        <DialogFooter className="help-footer">
          <Checkbox checked={dontShow} onCheckedChange={(next) => toggleDontShow(next === true)}>
            Don't show this again
          </Checkbox>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

HelpDialog.displayName = 'HelpDialog'

export default HelpDialog
