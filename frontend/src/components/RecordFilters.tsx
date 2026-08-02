import { useEffect, useRef, useState } from 'react'
import {
  CARE_EVENTS,
  CARE_EVENT_META,
  type CareEvent,
} from '../types/care'

export type CategoryFilter = CareEvent | 'all'

export interface RecordFiltersProps {
  selectedCategory: CategoryFilter
  searchQuery: string
  onCategoryChange: (category: CategoryFilter) => void
  onSearchChange: (query: string) => void
}

const DEBOUNCE_MS = 300

export function RecordFilters({
  selectedCategory,
  searchQuery,
  onCategoryChange,
  onSearchChange,
}: RecordFiltersProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (debounceRef.current !== undefined) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  function handleSearchInput(value: string) {
    setLocalSearch(value)

    if (debounceRef.current !== undefined) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      onSearchChange(value)
    }, DEBOUNCE_MS)
  }

  return (
    <section aria-labelledby="filter-title" className="mt-7 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 id="filter-title" className="font-bold text-slate-900">篩選與搜尋</h2>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="照護分類篩選">
        <button
          aria-pressed={selectedCategory === 'all'}
          className={`rounded-full px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${selectedCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          onClick={() => onCategoryChange('all')}
          type="button"
        >
          全部
        </button>
        {CARE_EVENTS.map((category) => (
          <button
            aria-pressed={selectedCategory === category}
            className={`rounded-full px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
              selectedCategory === category ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            key={category}
            onClick={() => onCategoryChange(category)}
            type="button"
          >
            {CARE_EVENT_META[category].label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-slate-700" htmlFor="record-search">
          關鍵字搜尋
        </label>
        <input
          aria-label="搜尋照護紀錄"
          className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          id="record-search"
          onChange={(event) => handleSearchInput(event.target.value)}
          placeholder="輸入關鍵字篩選紀錄…"
          type="search"
          value={localSearch}
        />
      </div>
    </section>
  )
}
