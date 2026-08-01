import { useState, type FormEvent } from 'react'
import { type ElderSubject } from '../types/care'

interface ElderManagementPageProps {
  elders: ElderSubject[]
  onAdd: (elder: ElderSubject) => void
  onDelete: (elderId: string) => void
  onSelect: (elderId: string) => void
  selectedElderId?: string
}

interface FormErrors {
  displayName?: string
  id?: string
}

export function ElderManagementPage({
  elders,
  onAdd,
  onDelete,
  onSelect,
  selectedElderId,
}: ElderManagementPageProps) {
  const [displayName, setDisplayName] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: FormErrors = {}
    const normalizedId = subjectId.trim()
    const normalizedName = displayName.trim()

    if (normalizedId.length === 0 || normalizedId.length > 128) {
      nextErrors.id = '個案識別碼必須為 1 至 128 個字元。'
    } else if (elders.some((elder) => elder.id === normalizedId)) {
      nextErrors.id = '此個案識別碼已存在。'
    }

    if (normalizedName.length === 0 || normalizedName.length > 80) {
      nextErrors.displayName = '顯示名稱必須為 1 至 80 個字元。'
    }

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    onAdd({ id: normalizedId, displayName: normalizedName })
    onSelect(normalizedId)
    setSubjectId('')
    setDisplayName('')
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header>
        <p className="text-sm font-bold tracking-[0.18em] text-teal-700">個案管理</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">選擇照護個案</h1>
        <p className="mt-2 text-slate-600">此頁僅保留目前瀏覽器工作階段的合成示範個案，不會上傳或記錄個案資料。</p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section aria-labelledby="subject-list-title" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 id="subject-list-title" className="text-xl font-bold text-slate-900">現有個案</h2>
          {elders.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-slate-600">尚未新增個案。</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {elders.map((elder) => {
                const isSelected = elder.id === selectedElderId
                const isPendingDelete = elder.id === pendingDeleteId

                return (
                  <li key={elder.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex min-w-0 cursor-pointer items-center gap-3">
                        <input
                          checked={isSelected}
                          name="selected-elder"
                          onChange={() => onSelect(elder.id)}
                          type="radio"
                          value={elder.id}
                        />
                        <span>
                          <span className="block font-semibold text-slate-900">{elder.displayName}</span>
                          <span className="block text-sm text-slate-500">識別碼：{elder.id}</span>
                        </span>
                      </label>
                      <button
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                        onClick={() => setPendingDeleteId(elder.id)}
                        type="button"
                      >
                        刪除
                      </button>
                    </div>
                    {isPendingDelete ? (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
                        <p className="text-sm text-red-950">確定要刪除「{elder.displayName}」嗎？此操作僅影響目前工作階段。</p>
                        <div className="mt-3 flex gap-2">
                          <button
                            className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800"
                            onClick={() => {
                              onDelete(elder.id)
                              setPendingDeleteId(undefined)
                            }}
                            type="button"
                          >
                            確定刪除
                          </button>
                          <button
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
                            onClick={() => setPendingDeleteId(undefined)}
                            type="button"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="add-subject-title" className="h-fit rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 id="add-subject-title" className="text-xl font-bold text-slate-900">新增合成示範個案</h2>
          <form className="mt-5 space-y-5" onSubmit={submit} noValidate>
            <div>
              <label className="block font-medium text-slate-800" htmlFor="elder-id">個案識別碼</label>
              <p id="elder-id-help" className="mt-1 text-sm text-slate-500">1 至 128 字元，請勿使用真實個人資料。</p>
              <input
                aria-describedby={errors.id === undefined ? 'elder-id-help' : 'elder-id-help elder-id-error'}
                aria-invalid={errors.id === undefined ? undefined : true}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="elder-id"
                maxLength={128}
                onChange={(event) => setSubjectId(event.target.value)}
                value={subjectId}
              />
              {errors.id === undefined ? null : <p id="elder-id-error" className="mt-1 text-sm text-red-700">{errors.id}</p>}
            </div>
            <div>
              <label className="block font-medium text-slate-800" htmlFor="elder-display-name">顯示名稱</label>
              <p id="elder-display-name-help" className="mt-1 text-sm text-slate-500">1 至 80 字元，建議使用合成代號。</p>
              <input
                aria-describedby={errors.displayName === undefined ? 'elder-display-name-help' : 'elder-display-name-help elder-display-name-error'}
                aria-invalid={errors.displayName === undefined ? undefined : true}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="elder-display-name"
                maxLength={80}
                onChange={(event) => setDisplayName(event.target.value)}
                value={displayName}
              />
              {errors.displayName === undefined ? null : <p id="elder-display-name-error" className="mt-1 text-sm text-red-700">{errors.displayName}</p>}
            </div>
            <button className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800" type="submit">
              新增個案
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
