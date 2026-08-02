// @ts-nocheck
import { useEffect, useState } from 'react'
import { loadElderProfiles, saveElderProfile, deleteElderProfile, seedDefaultElders, type ElderProfile } from '../api/elderProfiles'
import { ELDER_PROFILES as DEFAULT_ELDERS } from '../data/mockElders'

interface ElderManagementPageProps {
  elders: { id: string; displayName: string }[]
  onAdd: (elder: { id: string; displayName: string }) => void
  onDelete: (id: string) => void
  onSelect: (id: string) => void
  selectedElderId?: string
  onProfilesLoaded?: (profiles: ElderProfile[]) => void
}

export function ElderManagementPage({
  elders,
  onAdd,
  onDelete,
  onSelect,
  selectedElderId,
  onProfilesLoaded,
}: ElderManagementPageProps) {
  const [profiles, setProfiles] = useState<ElderProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [showForm, setShowForm] = useState(false)
  const [editingProfile, setEditingProfile] = useState<ElderProfile | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string>()

  // Form state
  const [form, setForm] = useState({
    elder_id: '',
    name: '',
    age: '',
    gender: '女',
    language: 'zh-TW',
    phone: '',
    address: '',
    emergency_contact: '',
    emergency_phone: '',
    diseases: '',
    medications: '',
    allergies: '',
    favorite_topics: '',
    preferred_language: '中文',
    favorite_food: '',
    wake_time: '06:00',
    sleep_time: '21:00',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setIsLoading(true)
    setError(undefined)
    try {
      let data = await loadElderProfiles()
      // If empty, seed with default elders
      if (data.length === 0) {
        await seedDefaultElders(DEFAULT_ELDERS)
        data = await loadElderProfiles()
      }
      setProfiles(data.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')))
      onProfilesLoaded?.(data)
    } catch (e) {
      setError(`讀取失敗：${e instanceof Error ? e.message : '未知錯誤'}`)
      // Fallback to local data
      setProfiles(DEFAULT_ELDERS)
    } finally {
      setIsLoading(false)
    }
  }

  function resetForm() {
    setForm({ elder_id: '', name: '', age: '', gender: '女', language: 'zh-TW', phone: '', address: '', emergency_contact: '', emergency_phone: '', diseases: '', medications: '', allergies: '', favorite_topics: '', preferred_language: '中文', favorite_food: '', wake_time: '06:00', sleep_time: '21:00' })
    setEditingProfile(null)
  }

  function openEditForm(profile: ElderProfile) {
    setForm({
      elder_id: profile.elder_id,
      name: profile.name,
      age: String(profile.age),
      gender: profile.gender,
      language: profile.language || 'zh-TW',
      phone: profile.phone || '',
      address: profile.address || '',
      emergency_contact: profile.emergency_contact || '',
      emergency_phone: profile.emergency_phone || '',
      diseases: profile.diseases?.join('、') || '',
      medications: profile.medications?.join('、') || '',
      allergies: profile.allergies?.join('、') || '',
      favorite_topics: profile.preferences?.favorite_topics?.join('、') || '',
      preferred_language: profile.preferences?.preferred_language || '中文',
      favorite_food: profile.preferences?.favorite_food || '',
      wake_time: profile.preferences?.wake_time || '06:00',
      sleep_time: profile.preferences?.sleep_time || '21:00',
    })
    setEditingProfile(profile)
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.age) return

    setIsSaving(true)
    const profile: ElderProfile = {
      elder_id: form.elder_id || `elder-${Date.now()}`,
      name: form.name.trim(),
      age: parseInt(form.age),
      gender: form.gender,
      language: form.language,
      phone: form.phone || undefined,
      address: form.address || undefined,
      emergency_contact: form.emergency_contact || undefined,
      emergency_phone: form.emergency_phone || undefined,
      diseases: form.diseases ? form.diseases.split(/[、,]/).map(s => s.trim()).filter(Boolean) : undefined,
      medications: form.medications ? form.medications.split(/[、,]/).map(s => s.trim()).filter(Boolean) : undefined,
      allergies: form.allergies ? form.allergies.split(/[、,]/).map(s => s.trim()).filter(Boolean) : undefined,
      preferences: {
        favorite_topics: form.favorite_topics ? form.favorite_topics.split(/[、,]/).map(s => s.trim()).filter(Boolean) : undefined,
        preferred_language: form.preferred_language || undefined,
        favorite_food: form.favorite_food || undefined,
        wake_time: form.wake_time || undefined,
        sleep_time: form.sleep_time || undefined,
      },
      created_at: editingProfile?.created_at,
    }

    try {
      await saveElderProfile(profile)
      await loadData()
      setShowForm(false)
      resetForm()
      onSelect(profile.elder_id)
    } catch (e) {
      setError(`儲存失敗：${e instanceof Error ? e.message : '未知錯誤'}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(elderId: string) {
    try {
      await deleteElderProfile(elderId)
      await loadData()
      setPendingDeleteId(undefined)
      if (selectedElderId === elderId && profiles.length > 1) {
        const next = profiles.find(p => p.elder_id !== elderId)
        if (next) onSelect(next.elder_id)
      }
    } catch (e) {
      setError(`刪除失敗：${e instanceof Error ? e.message : '未知錯誤'}`)
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold tracking-[0.18em] text-teal-700">個案管理</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">長者資料管理</h1>
          <p className="mt-2 text-slate-600">資料儲存於雲端 DynamoDB，跨裝置同步。</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800"
        >
          + 新增長者
        </button>
      </header>

      {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {/* 新增/編輯表單 */}
      {showForm && (
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-bold text-slate-900">{editingProfile ? '編輯長者資料' : '新增長者'}</h2>
          <form onSubmit={handleSave} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">姓名 *</label>
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">年齡 *</label>
              <input type="number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.age} onChange={e => setForm({...form, age: e.target.value})} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">性別</label>
              <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
                <option value="女">女</option>
                <option value="男">男</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">語言</label>
              <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.language} onChange={e => setForm({...form, language: e.target.value})}>
                <option value="zh-TW">國語</option>
                <option value="nan-TW">台語</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">電話</label>
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">地址</label>
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">緊急聯絡人</label>
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.emergency_contact} onChange={e => setForm({...form, emergency_contact: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">緊急聯絡電話</label>
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.emergency_phone} onChange={e => setForm({...form, emergency_phone: e.target.value})} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">疾病（用「、」分隔）</label>
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.diseases} onChange={e => setForm({...form, diseases: e.target.value})} placeholder="高血壓、糖尿病" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">用藥（用「、」分隔）</label>
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.medications} onChange={e => setForm({...form, medications: e.target.value})} placeholder="降血壓藥（每日一次）、降血糖藥" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">過敏</label>
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.allergies} onChange={e => setForm({...form, allergies: e.target.value})} placeholder="海鮮、花粉" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">喜好話題</label>
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.favorite_topics} onChange={e => setForm({...form, favorite_topics: e.target.value})} placeholder="種花、孫子、老歌" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">喜歡的食物</label>
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.favorite_food} onChange={e => setForm({...form, favorite_food: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">起床時間</label>
              <input type="time" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.wake_time} onChange={e => setForm({...form, wake_time: e.target.value})} />
            </div>

            <div className="sm:col-span-2 flex gap-3 mt-2">
              <button type="submit" disabled={isSaving} className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800 disabled:bg-slate-400">
                {isSaving ? '儲存中...' : (editingProfile ? '更新' : '新增')}
              </button>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50">
                取消
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 長者列表 */}
      <section className="mt-6">
        {isLoading ? (
          <p className="text-slate-500 animate-pulse">讀取長者資料中...</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map(profile => (
              <div
                key={profile.elder_id}
                className={`rounded-2xl bg-white p-5 shadow-sm ring-1 cursor-pointer transition-all ${
                  selectedElderId === profile.elder_id
                    ? 'ring-teal-500 ring-2 shadow-md'
                    : 'ring-slate-200 hover:shadow-md'
                }`}
                onClick={() => onSelect(profile.elder_id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900">{profile.name}</h3>
                    <p className="text-sm text-slate-500">{profile.age}歲・{profile.gender}・{profile.language === 'nan-TW' ? '台語' : '國語'}</p>
                  </div>
                  {selectedElderId === profile.elder_id && (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">目前選取</span>
                  )}
                </div>

                {profile.diseases?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {profile.diseases.map((d, i) => (
                      <span key={i} className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">{d}</span>
                    ))}
                  </div>
                )}

                {profile.preferences?.favorite_topics?.length > 0 && (
                  <p className="mt-2 text-xs text-slate-400">喜好：{profile.preferences.favorite_topics.join('、')}</p>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditForm(profile); }}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50"
                  >
                    編輯
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setPendingDeleteId(profile.elder_id); }}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    刪除
                  </button>
                </div>

                {pendingDeleteId === profile.elder_id && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3" onClick={e => e.stopPropagation()}>
                    <p className="text-sm text-red-900">確定刪除「{profile.name}」？此操作無法復原。</p>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => handleDelete(profile.elder_id)} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white">確定</button>
                      <button onClick={() => setPendingDeleteId(undefined)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">取消</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
