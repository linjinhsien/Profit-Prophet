// @ts-nocheck
import { useEffect, useState } from 'react'
import { loadElderProfiles, seedDefaultElders, type ElderProfile } from '../api/elderProfiles'
import { ELDER_PROFILES as DEFAULT_ELDERS } from '../data/mockElders'

interface ElderSelectScreenProps {
  onSelect: (elderId: string) => void
}

export function ElderSelectScreen({ onSelect }: ElderSelectScreenProps) {
  const [elders, setElders] = useState<ElderProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        let data = await loadElderProfiles()
        if (data.length === 0) {
          await seedDefaultElders(DEFAULT_ELDERS)
          data = await loadElderProfiles()
        }
        setElders(data.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')))
      } catch {
        // Fallback to local data
        setElders(DEFAULT_ELDERS)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        {/* 標題 - 大字體 */}
        <div className="text-center mb-10">
          <p className="text-5xl mb-4">👋</p>
          <h1 className="text-4xl font-bold text-slate-900">你好！</h1>
          <p className="mt-4 text-2xl text-slate-600">請點選你的名字</p>
        </div>

        {isLoading ? (
          <p className="text-center text-xl text-slate-400 animate-pulse">讀取中...</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {elders.map((elder) => (
              <button
                key={elder.elder_id}
                onClick={() => onSelect(elder.elder_id)}
                className="group rounded-3xl bg-white px-6 py-8 text-center shadow-sm ring-1 ring-slate-200 transition-all hover:shadow-xl hover:ring-amber-400 hover:-translate-y-1 active:translate-y-0 active:shadow-md focus:outline-none focus:ring-4 focus:ring-amber-300"
              >
                <div className="mx-auto w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center text-4xl group-hover:bg-amber-200 transition-colors">
                  {elder.gender === '男' ? '👴' : '👵'}
                </div>
                <h2 className="mt-5 text-3xl font-bold text-slate-900 group-hover:text-amber-800">
                  {elder.name}
                </h2>
                <p className="mt-2 text-lg text-slate-500">
                  {elder.age} 歲
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
