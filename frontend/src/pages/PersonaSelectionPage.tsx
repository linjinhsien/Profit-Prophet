interface PersonaSelectionPageProps {
  onContinue: () => void
}

export function PersonaSelectionPage({ onContinue }: PersonaSelectionPageProps) {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center px-4 py-10">
      <section aria-labelledby="welcome-title" className="w-full rounded-3xl bg-white p-8 shadow-xl shadow-slate-200/70 sm:p-12">
        <p className="text-sm font-bold tracking-[0.2em] text-teal-700">PROFIT-PROPHET</p>
        <h1 id="welcome-title" className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          照護人員智慧助理
        </h1>
        <p className="mt-5 max-w-2xl leading-7 text-slate-600">
          使用即時知識庫查詢、語音轉文字與語音回覆，協助您快速整理合成示範個案的照護資訊。
        </p>
        <aside className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          AI 回覆僅供資訊整理與輔助判讀，不能取代專業醫療或照護決策。請勿輸入真實個人或健康資料。
        </aside>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
            <h2 className="font-bold text-teal-950">文字與語音查詢</h2>
            <p className="mt-2 text-sm leading-6 text-teal-900">支援繁體中文文字問題，以及可選擇的麥克風逐字轉錄。</p>
          </article>
          <article className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
            <h2 className="font-bold text-sky-950">可追溯的回答</h2>
            <p className="mt-2 text-sm leading-6 text-sky-900">顯示照護分類、信心分數與知識庫引用來源。</p>
          </article>
        </div>
        <button
          className="mt-8 rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white transition hover:bg-teal-800"
          onClick={onContinue}
          type="button"
        >
          開始使用
        </button>
      </section>
    </main>
  )
}
