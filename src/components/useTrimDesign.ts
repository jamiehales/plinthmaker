import { useCallback, useMemo, useState } from 'react'
import { getTrimProfile, type TrimProfilePoint } from './trimProfiles.ts'
import {
  cloneSections,
  compileTrimSections,
  getPresetSections,
  loadCustomTrimProfiles,
  saveCustomTrimProfiles,
  sectionsEqual,
  type CustomTrimProfile,
  type TrimSection,
  type TrimSource,
} from './trimSections.ts'

export interface TrimDesign {
  source: TrimSource
  sourceName: string
  sections: TrimSection[]
  modified: boolean
  customProfiles: CustomTrimProfile[]
  trimProfileId: string
  customTrimPoints: TrimProfilePoint[] | undefined
  selectPreset: (id: string) => TrimSection[]
  selectCustom: (id: string) => TrimSection[]
  setSections: (sections: TrimSection[]) => void
  reset: () => TrimSection[]
  saveAsNew: (name: string) => void
  saveExisting: () => void
  deleteCustom: () => TrimSection[]
}

export function useTrimDesign(defaultPresetId: string): TrimDesign {
  const [source, setSource] = useState<TrimSource>({ kind: 'preset', id: defaultPresetId })
  const [sections, setSections] = useState<TrimSection[]>(() => getPresetSections(defaultPresetId))
  const [customProfiles, setCustomProfiles] = useState<CustomTrimProfile[]>(loadCustomTrimProfiles)

  const activeCustom = source.kind === 'custom' ? customProfiles.find((profile) => profile.id === source.id) : undefined
  const sourceSections = useMemo(
    () => (activeCustom ? activeCustom.sections : getPresetSections(source.id)),
    [activeCustom, source.id],
  )
  const sourceName = activeCustom ? activeCustom.name : getTrimProfile(source.id).name
  const modified = !sectionsEqual(sections, sourceSections)
  const usesPresetPoints = source.kind === 'preset' && !modified
  const compiledPoints = useMemo(() => compileTrimSections(sections), [sections])

  const updateCustomProfiles = useCallback((next: CustomTrimProfile[]) => {
    setCustomProfiles(next)
    saveCustomTrimProfiles(next)
  }, [])

  const selectPreset = useCallback((id: string) => {
    const presetSections = getPresetSections(id)
    setSource({ kind: 'preset', id })
    setSections(presetSections)
    return presetSections
  }, [])

  const selectCustom = useCallback((id: string) => {
    const profile = customProfiles.find((candidate) => candidate.id === id)
    if (!profile) return sections
    const customSections = cloneSections(profile.sections)
    setSource({ kind: 'custom', id })
    setSections(customSections)
    return customSections
  }, [customProfiles, sections])

  const reset = useCallback(() => {
    const resetSections = cloneSections(sourceSections)
    setSections(resetSections)
    return resetSections
  }, [sourceSections])

  const saveAsNew = useCallback((name: string) => {
    const id = `custom-${Date.now().toString(36)}`
    updateCustomProfiles([...customProfiles, { id, name, sections: cloneSections(sections) }])
    setSource({ kind: 'custom', id })
  }, [customProfiles, sections, updateCustomProfiles])

  const saveExisting = useCallback(() => {
    if (source.kind !== 'custom') return
    updateCustomProfiles(customProfiles.map((profile) => (profile.id === source.id ? { ...profile, sections: cloneSections(sections) } : profile)))
  }, [customProfiles, sections, source, updateCustomProfiles])

  const deleteCustom = useCallback(() => {
    if (source.kind !== 'custom') return sections
    updateCustomProfiles(customProfiles.filter((profile) => profile.id !== source.id))
    return selectPreset(defaultPresetId)
  }, [customProfiles, defaultPresetId, sections, selectPreset, source, updateCustomProfiles])

  return {
    source,
    sourceName,
    sections,
    modified,
    customProfiles,
    trimProfileId: usesPresetPoints ? source.id : 'custom',
    customTrimPoints: usesPresetPoints ? undefined : compiledPoints,
    selectPreset,
    selectCustom,
    setSections,
    reset,
    saveAsNew,
    saveExisting,
    deleteCustom,
  }
}
