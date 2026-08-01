import { CARE_EVENT_META, type CareEventCandidate } from '../types/care'

interface CategoryCandidatesProps {
  candidates: CareEventCandidate[]
  onSelect: (candidate: CareEventCandidate) => void
  selectedCategory?: CareEventCandidate['category']
}

export function CategoryCandidates({
  candidates,
  onSelect,
  selectedCategory,
}: CategoryCandidatesProps) {
  if (candidates.length === 0) {
    return <p className="text-sm text-slate-600">模型未提供候選分類，請以回覆內容作為判讀依據。</p>
  }

  return (
    <fieldset className="rounded-xl border border-slate-200 p-4">
      <legend className="px-1 font-semibold text-slate-800">請確認最符合的照護分類</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {candidates.map((candidate) => {
          const meta = CARE_EVENT_META[candidate.category]
          const checked = candidate.category === selectedCategory

          return (
            <label
              key={candidate.category}
              className={`cursor-pointer rounded-lg border p-3 text-sm transition ${
                checked ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white hover:border-teal-300'
              }`}
            >
              <input
                checked={checked}
                className="mr-2 accent-teal-700"
                name="category-candidate"
                onChange={() => onSelect(candidate)}
                type="radio"
                value={candidate.category}
              />
              <span className="font-semibold">{meta.label}</span>
              <span className="ml-1 text-slate-600">{Math.round(candidate.confidence * 100)}%</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
