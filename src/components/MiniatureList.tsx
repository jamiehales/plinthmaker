import { Button, IconButton, Spinner } from '@jamiehales/ui-kit/mostlymaking'
import { EditIcon, FigureIcon, PlusIcon, TrashIcon } from './icons.tsx'
import FigurePicker from './FigurePicker.tsx'
import type { FigureEntry } from './figureCatalog.ts'
import type { FigurePosition } from './FigureGuide.tsx'

export interface Miniature {
  id: number
  figure: FigureEntry
  position: FigurePosition
}

interface MiniatureListProps {
  miniatures: Miniature[]
  editingId: number | null
  loadingIds: ReadonlySet<number>
  onEdit: (id: number | null) => void
  onFigureChange: (id: number, figure: FigureEntry) => void
  onDelete: (id: number) => void
  onAdd: () => void
}

export default function MiniatureList({ miniatures, editingId, loadingIds, onEdit, onFigureChange, onDelete, onAdd }: MiniatureListProps) {
  return (
    <div className="miniature-list">
      {miniatures.map((miniature) => {
        const editing = miniature.id === editingId
        return (
          <div key={miniature.id} className="miniature-entry">
            <div className="miniature-card" aria-busy={loadingIds.has(miniature.id)}>
              {loadingIds.has(miniature.id) ? <Spinner label="Loading figure" width={18} height={18} /> : <FigureIcon />}
              <div className="miniature-card-text">
                <span className="miniature-card-name">{miniature.figure.name}</span>
                <span className="figure-category">{miniature.figure.category}</span>
              </div>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`Edit ${miniature.figure.name}`}
                aria-pressed={editing}
                title="Choose a different figure"
                onClick={() => onEdit(editing ? null : miniature.id)}
              >
                <EditIcon />
              </IconButton>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`Remove ${miniature.figure.name}`}
                title="Remove miniature"
                onClick={() => onDelete(miniature.id)}
              >
                <TrashIcon />
              </IconButton>
            </div>
            {editing ? (
              <FigurePicker
                selected={miniature.figure}
                onSelect={(figure) => onFigureChange(miniature.id, figure)}
                onDone={() => onEdit(null)}
              />
            ) : null}
          </div>
        )
      })}
      <Button fullWidth onClick={onAdd}>
        <PlusIcon />
        Add Miniature
      </Button>
    </div>
  )
}
