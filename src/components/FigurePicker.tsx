import { useEffect, useMemo, useState } from 'react'
import { Select as SelectPrimitive } from 'radix-ui'
import { Button, SearchField, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Spinner, TextLink } from '@jamiehales/ui-kit/mostlymaking'
import {
  type FigureCatalog, type FigureEntry, type FigureFilters,
  loadFigureCatalog, matchesFilters, searchFigures, uniqueValues,
} from './figureCatalog.ts'

interface FigurePickerProps {
  selected: FigureEntry | null
  onSelect: (figure: FigureEntry) => void
  onDone: () => void
}

type CatalogState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; catalog: FigureCatalog }

const ALL_VALUE = '__all__'
const NO_FILTERS: FigureFilters = { group: null, faction: null, unit: null }

interface FilterSelectProps {
  label: string
  value: string | null
  options: { value: string; label: string }[]
  onChange: (value: string | null) => void
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <Select value={value ?? ALL_VALUE} onValueChange={(next) => onChange(next === ALL_VALUE ? null : next)}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="figure-filter-menu">
        <SelectItem value={ALL_VALUE}>Any</SelectItem>
        <SelectPrimitive.Separator className="mm-menu-sep" />
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const toOptions = (values: string[]) => values.map((value) => ({ value, label: value }))

export default function FigurePicker({ selected, onSelect, onDone }: FigurePickerProps) {
  const [catalogState, setCatalogState] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<FigureFilters>(NO_FILTERS)

  useEffect(() => {
    let cancelled = false
    loadFigureCatalog()
      .then((catalog) => { if (!cancelled) setCatalogState({ status: 'ready', catalog }) })
      .catch((error: unknown) => {
        console.error('figure catalog error:', error)
        if (!cancelled) setCatalogState({ status: 'error' })
      })
    return () => { cancelled = true }
  }, [attempt])

  const catalog = catalogState.status === 'ready' ? catalogState.catalog : null

  const factionOptions = useMemo(() => {
    if (!catalog || !filters.group) return []
    return toOptions(uniqueValues(catalog.figures.filter((figure) => matchesFilters(figure, { ...NO_FILTERS, group: filters.group })), 'faction'))
  }, [catalog, filters.group])

  const unitOptions = useMemo(() => {
    if (!catalog || !filters.group || !filters.faction) return []
    return toOptions(uniqueValues(catalog.figures.filter((figure) => matchesFilters(figure, { ...NO_FILTERS, group: filters.group, faction: filters.faction })), 'unit'))
  }, [catalog, filters.group, filters.faction])

  const results = useMemo(() => (catalog ? searchFigures(catalog, query, filters) : null), [catalog, query, filters])

  const hasFilters = query !== '' || filters.group !== null
  const clearFilters = () => {
    setQuery('')
    setFilters(NO_FILTERS)
  }

  return (
    <div className="figure-picker">
      <div className="figure-filters">
        <div className="figure-filters-header">
          <span className="figure-filters-title mm-type-label">Find a figure</span>
          <div className="figure-filters-actions">
            {hasFilters ? <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button> : null}
            <Button variant="secondary" size="sm" onClick={onDone}>Done</Button>
          </div>
        </div>
        {catalogState.status === 'loading' ? (
          <div className="figure-status mm-type-small">
            <Spinner label="Loading figures" width={16} height={16} />
            Loading figures…
          </div>
        ) : null}
        {catalogState.status === 'error' ? (
          <div className="figure-status mm-type-small">
            Couldn't load the figure list.
            <Button size="sm" onClick={() => { setCatalogState({ status: 'loading' }); setAttempt((count) => count + 1) }}>Retry</Button>
          </div>
        ) : null}
        {catalog ? (
          <>
            <SearchField aria-label="Search figures" placeholder="Search figures" value={query} onChange={(event) => setQuery(event.target.value)} />
            <FilterSelect
              label="Range"
              value={filters.group}
              options={catalog.groups.map((group) => ({ value: group.id, label: group.name }))}
              onChange={(group) => setFilters({ group, faction: null, unit: null })}
            />
            {filters.group ? (
              <FilterSelect
                label="Faction"
                value={filters.faction}
                options={factionOptions}
                onChange={(faction) => setFilters((current) => ({ ...current, faction, unit: null }))}
              />
            ) : null}
            {filters.group && filters.faction ? (
              <FilterSelect
                label="Unit"
                value={filters.unit}
                options={unitOptions}
                onChange={(unit) => setFilters((current) => ({ ...current, unit }))}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {results ? (
        <>
          {results.matches.length > 0 ? (
            <div className="figure-results" role="group" aria-label="Figures">
              {results.matches.map((figure) => (
                <button
                  key={figure.id}
                  type="button"
                  className="figure-result"
                  aria-pressed={selected?.id === figure.id}
                  data-selected={selected?.id === figure.id ? '' : undefined}
                  onClick={() => onSelect(figure)}
                >
                  <span>{figure.name}</span>
                  <span className="figure-category">{figure.category}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="figure-note mm-type-small">No figures match. Try a broader range or a shorter search.</p>
          )}
          <p className="figure-note mm-type-small">
            {results.total > results.matches.length
              ? `Showing ${results.matches.length} of ${results.total.toLocaleString()} figures; refine the search to narrow it down. `
              : `${results.total.toLocaleString()} ${results.total === 1 ? 'figure' : 'figures'}. `}
            Figure data from <TextLink href="https://minicompare.info" target="_blank" rel="noopener noreferrer">minicompare.info</TextLink>.
          </p>
        </>
      ) : null}
    </div>
  )
}
