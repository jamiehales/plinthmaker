import { useState, useEffect } from 'react'
import { Input, Slider } from '@jamiehales/next-kit/ui/mostlymaking'

interface LabeledSliderProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  disabled?: boolean
}

export default function LabeledSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  unit = 'mm',
  disabled = false,
}: LabeledSliderProps) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value)
    const parsed = parseFloat(e.target.value)
    if (!Number.isNaN(parsed)) {
      onChange(parsed)
    }
  }

  const handleTextBlur = () => {
    const parsed = parseFloat(text)
    if (Number.isNaN(parsed)) {
      setText(String(value))
    } else {
      setText(String(parsed))
    }
  }

  return (
    <div className="labeled-slider" data-disabled={disabled ? '' : undefined}>
      <span className="labeled-slider-label mm-type-small">{label}</span>
      <Slider
        className="labeled-slider-track"
        aria-label={label}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      />
      <span className="labeled-slider-input">
        <Input
          value={text}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          inputMode="decimal"
          aria-label={`${label} (${unit})`}
          disabled={disabled}
        />
        {unit ? <span className="labeled-slider-unit">{unit}</span> : null}
      </span>
    </div>
  )
}
