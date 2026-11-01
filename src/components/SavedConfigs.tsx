import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Alert,
  Button,
  ConfirmDialog,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@jamiehales/ui-kit/mostlymaking'
import { DropdownMenu as MenuPrimitive } from 'radix-ui'
import { ArrowDownIcon, CheckIcon, CopyIcon, DownloadIcon, MoreIcon, TrashIcon, UploadIcon } from './icons.tsx'
import { SectionTitle } from './FormParts.tsx'
import { downloadBlob } from './download.ts'
import {
  configFilename,
  loadSavedConfigs,
  parseConfigStore,
  plinthConfigsEqual,
  serializeConfigStore,
  storeSavedConfigs,
  type PlinthConfig,
  type SavedConfig,
} from './savedConfigs.ts'

interface SavedConfigsProps {
  current: PlinthConfig
  onLoad: (config: PlinthConfig) => void
}

const SAVED_CONFIRMATION_MS = 1500

export default function SavedConfigs({ current, onLoad }: SavedConfigsProps) {
  const [configs, setConfigs] = useState<SavedConfig[]>(loadSavedConfigs)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const active = configs.find((saved) => saved.id === activeId)
  const pendingDelete = configs.find((saved) => saved.id === pendingDeleteId)
  const modified = active ? !plinthConfigsEqual(current, active.config) : false

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), SAVED_CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [justSaved])

  const updateConfigs = (next: SavedConfig[]) => {
    setConfigs(next)
    storeSavedConfigs(next)
  }

  const handleLoad = (id: string) => {
    const saved = configs.find((candidate) => candidate.id === id)
    if (!saved) return
    setActiveId(id)
    onLoad(saved.config)
  }

  const handleSaveAsOpenChange = (open: boolean) => {
    setSaveAsOpen(open)
    if (open) setNameDraft(active ? `${active.name} copy` : '')
  }

  const handleSaveAs = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = nameDraft.trim()
    if (!name) return
    const id = `config-${Date.now().toString(36)}`
    updateConfigs([...configs, { id, name, savedAt: Date.now(), config: current }])
    setActiveId(id)
    setSaveAsOpen(false)
    setJustSaved(true)
  }

  const handleSave = () => {
    if (!active) {
      handleSaveAsOpenChange(true)
      return
    }
    if (justSaved) return
    updateConfigs(configs.map((saved) => (saved.id === active.id ? { ...saved, savedAt: Date.now(), config: current } : saved)))
    setJustSaved(true)
  }

  const handleExport = () => {
    const name = active?.name ?? 'Plinth config'
    const exported: SavedConfig = { id: active?.id ?? `config-${Date.now().toString(36)}`, name, savedAt: Date.now(), config: current }
    downloadBlob(new Blob([serializeConfigStore([exported])], { type: 'application/json' }), configFilename(name))
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const importedAt = Date.now()
      const imported = parseConfigStore(await file.text()).map((saved, index) => ({ ...saved, id: `config-${importedAt.toString(36)}-${index}` }))
      updateConfigs([...configs, ...imported])
      setActiveId(imported[0].id)
      setImportError(null)
      onLoad(imported[0].config)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'This file could not be imported.')
    }
  }

  const handleClone = (original: SavedConfig) => {
    const clone: SavedConfig = { ...original, id: `config-${Date.now().toString(36)}`, name: `${original.name} copy`, savedAt: Date.now() }
    const index = configs.indexOf(original)
    updateConfigs([...configs.slice(0, index + 1), clone, ...configs.slice(index + 1)])
  }

  const handleDelete = () => {
    if (!pendingDelete) return
    updateConfigs(configs.filter((saved) => saved.id !== pendingDelete.id))
    if (activeId === pendingDelete.id) setActiveId(null)
    setPendingDeleteId(null)
  }

  return (
    <>
      <SectionTitle actions={<span className="saved-configs-title mm-type-small">{active?.name ?? 'Unsaved Plinth Profile'}</span>}>Save and Load</SectionTitle>
      <div className="saved-configs-row">
        <Menu>
          <MenuTrigger asChild>
            <Button className="saved-configs-menu-button">
              Load <ArrowDownIcon />
            </Button>
          </MenuTrigger>
          <MenuContent align="start" className="saved-configs-menu">
            <MenuLabel>Saved configs</MenuLabel>
            {configs.length > 0 ? (
              <MenuRadioGroup value={activeId ?? ''} onValueChange={handleLoad}>
                {configs.map((saved) => (
                  <div key={saved.id} className="saved-configs-entry">
                    <MenuRadioItem value={saved.id} className="saved-configs-load">
                      <span className="saved-configs-name">{saved.name}</span>
                    </MenuRadioItem>
                    <MenuPrimitive.Sub>
                      <MenuPrimitive.SubTrigger className="mm-mi saved-configs-more" aria-label={`More actions for ${saved.name}`}>
                        <MoreIcon />
                      </MenuPrimitive.SubTrigger>
                      <MenuPrimitive.Portal>
                        <MenuPrimitive.SubContent className="mm-menu" sideOffset={6} collisionPadding={8}>
                          <MenuItem onSelect={() => handleClone(saved)}>
                            <CopyIcon />
                            <span className="saved-configs-name">Clone</span>
                          </MenuItem>
                          <MenuItem destructive onSelect={() => setPendingDeleteId(saved.id)}>
                            <TrashIcon />
                            <span className="saved-configs-name">Delete</span>
                          </MenuItem>
                        </MenuPrimitive.SubContent>
                      </MenuPrimitive.Portal>
                    </MenuPrimitive.Sub>
                  </div>
                ))}
              </MenuRadioGroup>
            ) : (
              <p className="saved-configs-empty">No saved configs yet</p>
            )}
          </MenuContent>
        </Menu>

        <Button
          variant="primary"
          className="saved-configs-save"
          disabled={active !== undefined && !modified && !justSaved}
          aria-label={justSaved ? 'Saved' : undefined}
          onClick={handleSave}
        >
          {justSaved ? <CheckIcon /> : 'Save'}
        </Button>

        <Menu open={saveAsOpen} onOpenChange={handleSaveAsOpenChange}>
          <MenuTrigger asChild>
            <Button className="saved-configs-menu-button">
              Save As <ArrowDownIcon />
            </Button>
          </MenuTrigger>
          <MenuContent align="end" className="saved-configs-menu">
            <MenuLabel>Save as new config</MenuLabel>
            <form
              className="saved-configs-name-form"
              onSubmit={handleSaveAs}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') event.stopPropagation()
              }}
            >
              <Input
                size="sm"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Config name"
                aria-label="Name for the new config"
                autoComplete="off"
                autoFocus
              />
              <Button size="sm" variant="primary" type="submit" disabled={nameDraft.trim() === ''}>Save</Button>
            </form>
          </MenuContent>
        </Menu>

        <Menu>
          <MenuTrigger asChild>
            <Button className="saved-configs-menu-button">
              Backup <ArrowDownIcon />
            </Button>
          </MenuTrigger>
          <MenuContent align="end" className="saved-configs-menu">
            <MenuLabel>Backup</MenuLabel>
            <MenuItem onSelect={() => importInputRef.current?.click()}>
              <UploadIcon />
              <span className="saved-configs-name">Import from file</span>
            </MenuItem>
            <MenuItem onSelect={handleExport}>
              <DownloadIcon />
              <span className="saved-configs-name">Export to file</span>
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="saved-configs-file"
        aria-label="Import config file"
        onChange={handleImport}
      />

      {importError ? <Alert tone="error">{importError}</Alert> : null}

      <ConfirmDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null)
        }}
        title={`Delete "${pendingDelete?.name ?? ''}"?`}
        description={<>Are you sure you want to remove <span className="confirm-highlight">'{pendingDelete?.name}'</span>?</>}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </>
  )
}
