import { useState, useEffect } from 'react'
import { Box, TextField, Typography, InputAdornment } from '@mui/material'

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
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
      <Typography variant="body2" sx={{ color: disabled ? 'text.disabled' : 'text.secondary', width: 96, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box
        component="input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => handleSliderChange(e, parseFloat(e.target.value))}
        style={{
          flex: 1,
          accentColor: '#1976d2',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <TextField
        value={text}
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        size="small"
        variant="outlined"
        disabled={disabled}
        sx={{ width: 110, flexShrink: 0 }}
        slotProps={{
          htmlInput: {
            inputMode: 'decimal',
            step,
            sx: { py: 0.75, px: 1 },
          },
          input: unit
            ? {
                endAdornment: (
                  <InputAdornment position="end" sx={{ mr: -0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                      {unit}
                    </Typography>
                  </InputAdornment>
                ),
              }
            : undefined,
        }}
      />
    </Box>
  )
}