import { sectionIconPath, type TrimSectionType } from './trimSections.ts'

interface TrimSectionIconProps {
  type: TrimSectionType
  flipped: boolean
  size?: number
}

export default function TrimSectionIcon({ type, flipped, size = 18 }: TrimSectionIconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" style={{ display: 'block', flex: 'none' }}>
      <path d={sectionIconPath(type, flipped)} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  )
}
