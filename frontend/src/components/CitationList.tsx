import { type Citation } from '../types/care'

interface CitationListProps {
  citations: Citation[]
}

export function CitationList({ citations }: CitationListProps) {
  if (citations.length === 0) {
    return <p className="text-sm text-slate-500">此回覆沒有可顯示的來源引用。</p>
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <summary className="cursor-pointer font-semibold text-slate-800">
        查看來源引用（{citations.length}）
      </summary>
      <ol className="mt-3 space-y-3">
        {citations.map((citation) => (
          <li key={citation.id} className="rounded-lg bg-white p-3 text-sm text-slate-700 shadow-sm">
            <p className="leading-6">{citation.excerpt}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
              {citation.score === undefined ? null : <span>相關度：{Math.round(citation.score * 100)}%</span>}
              {citation.uri === undefined ? null : (
                <a
                  className="font-medium text-teal-700 underline underline-offset-2"
                  href={citation.uri}
                  rel="noreferrer"
                  target="_blank"
                >
                  開啟來源
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </details>
  )
}
