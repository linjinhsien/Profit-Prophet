interface AudioPlayerProps {
  audioUrl: string
}

export function AudioPlayer({ audioUrl }: AudioPlayerProps) {
  return (
    <section aria-label="語音回覆播放控制" className="rounded-xl border border-teal-200 bg-teal-50 p-4">
      <p className="mb-2 text-sm font-semibold text-teal-900">語音回覆</p>
      <audio className="w-full" controls preload="metadata" src={audioUrl}>
        此瀏覽器不支援音訊播放。您仍可閱讀文字回覆。
      </audio>
    </section>
  )
}
