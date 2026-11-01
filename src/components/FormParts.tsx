import type { ReactNode } from 'react'
import { Checkbox, IconButton } from '@jamiehales/ui-kit/mostlymaking'
import { ResetIcon } from './icons.tsx'

interface SectionTitleProps {
  children: string
  onReset?: (() => void) | null
  actions?: ReactNode
}

export function SectionTitle({ children, onReset, actions }: SectionTitleProps) {
  return (
    <div className="section-header">
      <h2 className="section-title mm-type-label">{children}</h2>
      {onReset || actions ? (
        <div className="section-actions">
          {actions}
          {onReset ? (
            <IconButton variant="ghost" size="sm" aria-label={`Reset ${children} to defaults`} title="Reset to defaults" onClick={onReset}>
              <ResetIcon />
            </IconButton>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface CheckFieldProps {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}

export function CheckField({ checked, onChange, children }: CheckFieldProps) {
  return (
    <Checkbox className="check-field" checked={checked} onCheckedChange={(next) => onChange(next === true)}>
      {children}
    </Checkbox>
  )
}
