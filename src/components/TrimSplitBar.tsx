import { SplitBar } from '@jamiehales/ui-kit/mostlymaking'
import { describeSection, type TrimDimension, type TrimSection } from './trimSections.ts'
import TrimSectionIcon from './TrimSectionIcon.tsx'

interface TrimSplitBarProps {
  label: string
  detail: string
  sections: TrimSection[]
  dimension: TrimDimension
  linked: boolean
  selectedIndex: number
  disabled?: boolean
  onChange: (sections: TrimSection[]) => void
  onSelect: (index: number) => void
}

export default function TrimSplitBar({ label, detail, sections, dimension, linked, selectedIndex, disabled = false, onChange, onSelect }: TrimSplitBarProps) {
  const handleValueChange = (values: number[]) => {
    onChange(sections.map((item, index) => {
      const next = { ...item, [dimension]: values[index] }
      return linked ? { ...next, depth: next.height } : next
    }))
  }

  return (
    <SplitBar
      label={label}
      detail={detail}
      values={sections.map((item) => item[dimension])}
      onValueChange={handleValueChange}
      selectedIndex={selectedIndex}
      onSelect={onSelect}
      disabled={disabled}
      reversed
      renderSegment={(index, share) => (
        <>
          {share >= 0.07 ? <TrimSectionIcon type={sections[index].type} flipped={sections[index].flipped} size={14} /> : null}
          {share >= 0.14 ? <span>{Math.round(share * 100)}%</span> : null}
        </>
      )}
      segmentTitle={(index, share) => `${describeSection(sections[index])} · ${Math.round(share * 100)}%`}
      dividerLabel={(index) => `Divider between ${describeSection(sections[index + 1])} and ${describeSection(sections[index])}`}
    />
  )
}
