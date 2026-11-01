import type { ReactNode } from 'react'

function Icon({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export const DownloadIcon = () => (
  <Icon>
    <path d="M12 3v12m0 0-4-4m4 4 4-4M4 20h16" />
  </Icon>
)

export const SquareIcon = () => (
  <Icon filled>
    <rect x="4" y="4" width="16" height="16" rx="1" />
  </Icon>
)

export const CircleIcon = () => (
  <Icon filled>
    <circle cx="12" cy="12" r="9" />
  </Icon>
)

export const EditIcon = () => (
  <Icon>
    <path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4" />
  </Icon>
)

export const CopyIcon = () => (
  <Icon>
    <rect x="9" y="9" width="11" height="11" rx="1" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </Icon>
)

export const HelpIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5M12 17h.01" />
  </Icon>
)

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const ArrowUpIcon = () => (
  <Icon>
    <path d="m6 15 6-6 6 6" />
  </Icon>
)

export const ArrowDownIcon = () => (
  <Icon>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
)

export const ResetIcon = () => (
  <Icon>
    <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
  </Icon>
)

export const GripIcon = () => (
  <Icon filled>
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </Icon>
)
