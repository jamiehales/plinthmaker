import { useState, type ReactNode } from 'react'
import { Popover } from 'radix-ui'
import { EyeIcon, EyeOffIcon } from './icons.tsx'

interface VisibilityToggleProps {
  visible: boolean
  onVisibleChange: (visible: boolean) => void
  label: string
  content: ReactNode
  side?: 'top' | 'bottom'
}

export default function VisibilityToggle({ visible, onVisibleChange, label, content, side = 'bottom' }: VisibilityToggleProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="mm-icon-tip visibility-toggle"
          aria-label={label}
          aria-pressed={!visible}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') setOpen(true)
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') setOpen(false)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={(event) => {
            event.preventDefault()
            onVisibleChange(!visible)
            setOpen(true)
          }}
        >
          {visible ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className="mm-help-tip"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {content}
          <Popover.Arrow asChild width={14} height={7}>
            <svg className="mm-help-arrow" viewBox="0 0 14 7" aria-hidden="true">
              <path d="M0 0 7 7 14 0" />
            </svg>
          </Popover.Arrow>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
