import type { ReactNode } from 'react'
import { Checkbox } from '@jamiehales/ui-kit/mostlymaking'

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="section-title mm-type-label">{children}</h2>
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
