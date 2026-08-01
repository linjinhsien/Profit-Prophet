interface ErrorAlertProps {
  message: string
  title?: string
}

export function ErrorAlert({ message, title = '無法完成此操作' }: ErrorAlertProps) {
  return (
    <section aria-live="assertive" role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-6">{message}</p>
    </section>
  )
}
