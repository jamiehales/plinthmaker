import { useState, forwardRef, useImperativeHandle } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@jamiehales/ui-kit/mostlymaking'
import { HELP_TITLE, HELP_INTRO, HELP_SECTIONS } from '../helpContent.ts'

export interface HelpDialogHandle {
  open: () => void
}

const HelpDialog = forwardRef<HelpDialogHandle>((_props, ref) => {
  const [open, setOpen] = useState(false)

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
  }))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="md" className="help-dialog">
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
        <DialogFooter>
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
