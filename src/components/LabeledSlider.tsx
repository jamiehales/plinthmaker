import { useState, useEffect } from 'react'
import { Box, TextField, Typography } from '@mui/material'

interface LabeledSliderProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
}

export default function LabeledSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  unit = 'mm',
}: LabeledSliderProps) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  const handleSliderChange = (_e: unknown, v: number | number[]) => {
    onChange(v as number)
  }

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
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5, gap: 1 }}>
        <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>
          {label}
        </Typography>
        <TextField
          value={text}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          size="small"
          variant="outlined"
          sx={{ width: 90 }}
          slotProps={{
            htmlInput: {
              inputMode: 'decimal',
              step,
            },
          }}
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', width: 28 }}>
          {min}
        </Typography>
        <Box
          component="input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => handleSliderChange(e, parseFloat(e.target.value))}
          style={{
            flex: 1,
            accentColor: '#1976d2',
            cursor: 'pointer',
          }}
        />
        <Typography variant="caption" sx={{ color: 'text.disabled', width: 28, textAlign: 'right' }}>
          {max}
        </Typography>
      </Box>
      {unit && (
        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.25 }}>
          {unit}
        </Typography>
      )}
    </Box>
  )
}