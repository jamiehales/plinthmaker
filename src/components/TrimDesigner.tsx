import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  ConfirmDialog,
  IconButton,
  Input,
  LinkedPair,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  SegmentedControl,
  SegmentedControlItem,
  Tooltip,
} from '@jamiehales/ui-kit/mostlymaking'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CopyIcon, EditIcon, GripIcon, ResetIcon, PlusIcon, TrashIcon } from './icons.tsx'
import LabeledSlider from './LabeledSlider.tsx'
import TrimProfileIcon from './TrimProfileIcon.tsx'
import TrimSectionIcon from './TrimSectionIcon.tsx'
import TrimSectionView from './TrimSectionView.tsx'
import TrimSplitBar from './TrimSplitBar.tsx'
import { TRIM_PROFILES, type TrimProfile } from './trimProfiles.ts'
import {
  TRIM_SECTION_DIRECTIONS,
  TRIM_SECTION_TYPES,
  TRIM_SECTION_TYPE_NAMES,
  addSectionAtBottom,
  compileTrimSections,
  describeSection,
  duplicateSection,
  removeSection,
  sharesDiffer,
  swapSections,
  type TrimSection,
  type TrimSectionType,
} from './trimSections.ts'
import type { TrimDesign } from './useTrimDesign.ts'

interface TrimDesignerProps {
  design: TrimDesign
  trimHeight: number
  onTrimHeightChange: (value: number) => void
  maxTrimSize: number
  trimSize: number
  onTrimSizeChange: (value: number) => void
  trimLinked: boolean
  onTrimLinkedChange: (linked: boolean) => void
  onEditingSectionChange: (index: number) => void
}

const PRESET_PROFILES = TRIM_PROFILES.filter((profile) => profile.id !== 'custom')
const CUSTOM_VALUE = 'custom'
const MIN_TRIM_SIZE = 0.5
const SAVED_CONFIRMATION_MS = 1500

function profileFromSections(id: string, name: string, sections: TrimSection[]): TrimProfile {
  return { id, name, interpolate: 'bezier', points: compileTrimSections(sections) }
}

function formatMM(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)} mm`
}

function formatShare(value: number): string {
  return `${Math.round(value * 100)}%`
}

export default function TrimDesigner({ design, trimHeight, onTrimHeightChange, maxTrimSize, trimSize, onTrimSizeChange, trimLinked, onTrimLinkedChange, onEditingSectionChange }: TrimDesignerProps) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [linked, setLinked] = useState(() => !sharesDiffer(design.sections))
  const [naming, setNaming] = useState(false)
  const [customMenuOpen, setCustomMenuOpen] = useState(false)
  const [newProfileName, setNewProfileName] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const { source, sections, modified, customProfiles } = design

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), SAVED_CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [justSaved])

  useEffect(() => {
    onEditingSectionChange(editorOpen ? selectedIndex : -1)
  }, [editorOpen, selectedIndex, onEditingSectionChange])
  const isCustom = source.kind === 'custom'

  const customIcons = useMemo(
    () => customProfiles.map((profile) => ({ profile, icon: profileFromSections(profile.id, profile.name, profile.sections) })),
    [customProfiles],
  )
  const selectedCustomIcon = isCustom ? customIcons.find((entry) => entry.profile.id === source.id)?.icon : undefined

  const clearTransientState = () => {
    setSelectedIndex(-1)
    setNaming(false)
  }

  const updateSections = (next: TrimSection[], nextSelected = selectedIndex) => {
    design.setSections(next)
    setSelectedIndex(nextSelected)
  }

  const handlePresetChange = (value: string) => {
    if (value === CUSTOM_VALUE) return
    setLinked(!sharesDiffer(design.selectPreset(value)))
    clearTransientState()
  }

  const handleCustomChange = (id: string) => {
    setLinked(!sharesDiffer(design.selectCustom(id)))
    clearTransientState()
  }

  const startNaming = () => {
    setNameDraft(isCustom ? `${design.sourceName} copy` : '')
    setNaming(true)
  }

  const handleCustomMenuOpenChange = (open: boolean) => {
    setCustomMenuOpen(open)
    if (!open) setNewProfileName(null)
  }

  const handleCreateProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = (newProfileName ?? '').trim()
    if (!name) return
    design.saveAsNew(name)
    clearTransientState()
    handleCustomMenuOpenChange(false)
  }

  const handleSaveNew = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = nameDraft.trim()
    if (!name) return
    design.saveAsNew(name)
    setNaming(false)
    setJustSaved(true)
  }

  const handleSaveExisting = () => {
    if (justSaved) return
    design.saveExisting()
    setJustSaved(true)
  }

  const handleDelete = () => {
    setLinked(!sharesDiffer(design.deleteCustom()))
    clearTransientState()
  }

  const handleReset = () => {
    setLinked(!sharesDiffer(design.reset()))
    setSelectedIndex(-1)
  }

  const handleLinkedChange = (nextLinked: boolean) => {
    setLinked(nextLinked)
    if (nextLinked) updateSections(sections.map((item) => ({ ...item, depth: item.height })))
  }

  const listRef = useRef<HTMLDivElement>(null)
  const reorderRef = useRef<{ pointerId: number; index: number } | null>(null)
  const [draggingIndex, setDraggingIndex] = useState(-1)

  const handleGripDown = (index: number) => (event: PointerEvent<HTMLSpanElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    reorderRef.current = { pointerId: event.pointerId, index }
    setDraggingIndex(index)
    setSelectedIndex(-1)
  }

  const handleGripMove = (event: PointerEvent<HTMLSpanElement>) => {
    const reorder = reorderRef.current
    const list = listRef.current
    if (!reorder || reorder.pointerId !== event.pointerId || !list) return
    const rows = Array.from(list.querySelectorAll<HTMLElement>('.trim-section-row'))
    const position = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect()
      return event.clientY >= rect.top && event.clientY < rect.bottom
    })
    if (position === -1) return
    const target = sections.length - 1 - position
    if (target === reorder.index) return
    const next = sections.slice()
    const [moved] = next.splice(reorder.index, 1)
    next.splice(target, 0, moved)
    reorder.index = target
    setDraggingIndex(target)
    updateSections(next, -1)
  }

  const handleGripUp = (event: PointerEvent<HTMLSpanElement>) => {
    if (reorderRef.current?.pointerId !== event.pointerId) return
    reorderRef.current = null
    setDraggingIndex(-1)
  }

  const toggleSelected = (index: number) => setSelectedIndex((current) => (current === index ? -1 : index))

  const changeType = (index: number, type: TrimSectionType) => {
    updateSections(sections.map((item, position) => (position === index ? { ...item, type } : item)))
  }

  const changeDirection = (index: number, flipped: boolean) => {
    updateSections(sections.map((item, position) => (position === index ? { ...item, flipped } : item)))
  }

  const handleTrimHeightChange = (value: number) => {
    onTrimHeightChange(value)
    if (trimLinked) onTrimSizeChange(value)
  }

  const handleTrimLinkedChange = (nextLinked: boolean) => {
    onTrimLinkedChange(nextLinked)
    if (nextLinked) onTrimSizeChange(trimHeight)
  }

  const rows = sections.map((item, index) => ({ item, index })).reverse()

  return (
    <>
      <SegmentedControl fullWidth value={isCustom ? CUSTOM_VALUE : source.id} onValueChange={handlePresetChange} aria-label="Trim profile">
        {PRESET_PROFILES.map((profile) => (
          <Tooltip key={profile.id} content={profile.name} side="top">
            <SegmentedControlItem value={profile.id} aria-label={profile.name} data-state={!isCustom && source.id === profile.id ? 'on' : 'off'}>
              <TrimProfileIcon profile={profile} selected={!isCustom && source.id === profile.id} />
            </SegmentedControlItem>
          </Tooltip>
        ))}
        <Menu open={customMenuOpen} onOpenChange={handleCustomMenuOpenChange}>
          <MenuTrigger asChild>
            <SegmentedControlItem value={CUSTOM_VALUE} className="trim-custom-segment" aria-label="Custom profiles" data-state={isCustom ? 'on' : 'off'}>
              {selectedCustomIcon ? <TrimProfileIcon profile={selectedCustomIcon} selected /> : <EditIcon />}
              <ArrowDownIcon />
            </SegmentedControlItem>
          </MenuTrigger>
          <MenuContent align="end" className="trim-custom-menu">
            <MenuLabel>Custom profiles</MenuLabel>
            {customIcons.length > 0 ? (
              <MenuRadioGroup value={isCustom ? source.id : ''} onValueChange={handleCustomChange}>
                {customIcons.map(({ profile, icon }) => (
                  <MenuRadioItem key={profile.id} value={profile.id}>
                    <TrimProfileIcon profile={icon} size={22} />
                    <span className="trim-custom-name">{profile.name}</span>
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            ) : (
              <p className="trim-custom-empty">No custom profiles</p>
            )}
            <MenuSeparator />
            {newProfileName === null ? (
              <MenuItem
                onSelect={(event) => {
                  event.preventDefault()
                  setNewProfileName('')
                }}
              >
                <PlusIcon />
                <span className="trim-custom-name">Create Custom Profile</span>
              </MenuItem>
            ) : (
              <form
                className="trim-custom-create"
                onSubmit={handleCreateProfile}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') event.stopPropagation()
                }}
              >
                <Input
                  size="sm"
                  value={newProfileName}
                  onChange={(event) => setNewProfileName(event.target.value)}
                  placeholder="Profile name"
                  aria-label="Name for the new custom profile"
                  autoComplete="off"
                  autoFocus
                />
                <Button size="sm" variant="primary" type="submit" disabled={newProfileName.trim() === ''}>Create</Button>
              </form>
            )}
          </MenuContent>
        </Menu>
      </SegmentedControl>

      <LinkedPair
        linked={trimLinked}
        onLinkedChange={handleTrimLinkedChange}
        label="Link trim depth to height"
        linkedHint="Depth follows height"
        unlinkedHint="Link depth to height"
      >
        <LabeledSlider
          label="Trim Height"
          value={trimHeight}
          onChange={handleTrimHeightChange}
          min={MIN_TRIM_SIZE}
          max={maxTrimSize}
          step={0.5}
        />
        <LabeledSlider
          label="Trim Depth"
          value={trimSize}
          onChange={onTrimSizeChange}
          min={MIN_TRIM_SIZE}
          max={maxTrimSize}
          step={0.5}
          disabled={trimLinked}
        />
      </LinkedPair>

      <Accordion
        type="single"
        collapsible
        variant="minimal"
        trailingDivider={false}
        className="trim-editor"
        value={editorOpen ? 'edit' : ''}
        onValueChange={(value) => setEditorOpen(value === 'edit')}
      >
        <AccordionItem value="edit">
          <AccordionTrigger meta={`${design.sourceName}${modified ? ' · modified' : ''}`}>Edit profile</AccordionTrigger>
          <AccordionContent className="trim-editor-body">
            <TrimSectionView sections={sections} trimHeight={trimHeight} trimSize={trimSize} selectedIndex={selectedIndex} />

            <LinkedPair
              linked={linked}
              onLinkedChange={handleLinkedChange}
              label="Link depth split to height split"
              linkedHint="Depth split follows height split"
              unlinkedHint="Link depth split to height split"
              firstAnchor={46}
              lastAnchor={22}
            >
              <TrimSplitBar
                label="Height"
                detail={formatMM(trimHeight)}
                sections={sections}
                dimension="height"
                linked={linked}
                selectedIndex={selectedIndex}
                onChange={(next) => updateSections(next)}
                onSelect={toggleSelected}
              />
              <TrimSplitBar
                label="Depth"
                detail={formatMM(trimSize)}
                sections={sections}
                dimension="depth"
                linked={false}
                disabled={linked}
                selectedIndex={selectedIndex}
                onChange={(next) => updateSections(next)}
                onSelect={toggleSelected}
              />
            </LinkedPair>

            <p className="trim-list-title mm-type-small">Sections, top to bottom</p>
            <div className="trim-section-list" ref={listRef}>
              {rows.map(({ item, index }) => {
                const open = index === selectedIndex
                const directions = TRIM_SECTION_DIRECTIONS[item.type]
                return (
                  <div
                    key={index}
                    className="trim-section-row"
                    data-selected={open ? '' : undefined}
                    data-dragging={index === draggingIndex ? '' : undefined}
                  >
                    <div className="trim-section-head">
                      <span
                        className="trim-section-grip"
                        aria-hidden="true"
                        title="Drag to reorder"
                        onPointerDown={handleGripDown(index)}
                        onPointerMove={handleGripMove}
                        onPointerUp={handleGripUp}
                        onPointerCancel={handleGripUp}
                      >
                        <GripIcon />
                      </span>
                      <button type="button" className="trim-section-header" aria-expanded={open} onClick={() => toggleSelected(index)}>
                        <TrimSectionIcon type={item.type} flipped={item.flipped} />
                        <span className="trim-section-name">{describeSection(item)}</span>
                        <span className="trim-section-meta">{formatShare(item.height)} · {formatShare(item.depth)}</span>
                      </button>
                    </div>
                    {open ? (
                      <div className="trim-section-body">
                        <SegmentedControl fullWidth value={item.type} onValueChange={(value) => changeType(index, value as TrimSectionType)} aria-label="Section type">
                          {TRIM_SECTION_TYPES.map((type) => (
                            <SegmentedControlItem key={type} value={type}>
                              <TrimSectionIcon type={type} flipped={false} size={16} />
                              {TRIM_SECTION_TYPE_NAMES[type]}
                            </SegmentedControlItem>
                          ))}
                        </SegmentedControl>
                        {directions ? (
                          <SegmentedControl
                            fullWidth
                            value={item.flipped ? 'flipped' : 'normal'}
                            onValueChange={(value) => changeDirection(index, value === 'flipped')}
                            aria-label="Section direction"
                          >
                            <SegmentedControlItem value="normal">
                              <TrimSectionIcon type={item.type} flipped={false} size={16} />
                              {directions[0]}
                            </SegmentedControlItem>
                            <SegmentedControlItem value="flipped">
                              <TrimSectionIcon type={item.type} flipped size={16} />
                              {directions[1]}
                            </SegmentedControlItem>
                          </SegmentedControl>
                        ) : null}
                        <p className="trim-section-readout">
                          {formatMM(item.height * trimHeight)} tall ({formatShare(item.height)}) · {formatMM(item.depth * trimSize)} in ({formatShare(item.depth)})
                        </p>
                        <div className="trim-section-actions">
                          <IconButton size="sm" aria-label="Move up" disabled={index >= sections.length - 1} onClick={() => updateSections(swapSections(sections, index, index + 1), index + 1)}>
                            <ArrowUpIcon />
                          </IconButton>
                          <IconButton size="sm" aria-label="Move down" disabled={index <= 0} onClick={() => updateSections(swapSections(sections, index, index - 1), index - 1)}>
                            <ArrowDownIcon />
                          </IconButton>
                          <IconButton size="sm" aria-label="Duplicate" onClick={() => updateSections(duplicateSection(sections, index), index + 1)}>
                            <CopyIcon />
                          </IconButton>
                          <IconButton size="sm" aria-label="Remove" disabled={sections.length <= 1} onClick={() => updateSections(removeSection(sections, index), Math.max(0, index - 1))}>
                            <TrashIcon />
                          </IconButton>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <Button fullWidth className="trim-add-section" onClick={() => updateSections(addSectionAtBottom(sections), 0)}>
              <PlusIcon /> Add section
            </Button>

            <div className="trim-save">
              {naming ? (
                <form className="trim-save-name" onSubmit={handleSaveNew}>
                  <Input
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    placeholder="Profile name"
                    aria-label="Name for this profile"
                    autoComplete="off"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" type="button" onClick={() => setNaming(false)}>Cancel</Button>
                  <Button size="sm" variant="primary" type="submit" disabled={nameDraft.trim() === ''}>Save</Button>
                </form>
              ) : (
                <div className="trim-save-actions">
                  <Button size="sm" variant="secondary" className="trim-reset" disabled={!modified} onClick={handleReset}>
                    <ResetIcon /> Reset
                  </Button>
                  {isCustom ? (
                    <Button size="sm" variant="ghost" destructive onClick={() => setConfirmingDelete(true)}>Delete</Button>
                  ) : null}
                  <span className="trim-save-spacer" />
                  {isCustom ? (
                    <>
                      <Button size="sm" onClick={startNaming}>Save as new…</Button>
                      <Button
                        size="sm"
                        variant="primary"
                        className="trim-save-button"
                        disabled={!modified && !justSaved}
                        aria-label={justSaved ? 'Saved' : undefined}
                        onClick={handleSaveExisting}
                      >
                        {justSaved ? <CheckIcon /> : 'Save'}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="primary" onClick={startNaming}>Save as custom…</Button>
                  )}
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete "${design.sourceName}"?`}
        description={<>Are you sure you want to remove <span className="confirm-highlight">'{design.sourceName}'</span>?</>}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </>
  )
}
