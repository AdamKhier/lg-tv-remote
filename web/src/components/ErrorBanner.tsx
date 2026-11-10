import { AlertIcon, RefreshIcon, XIcon } from '../icons'

type Props = {
  message: string
  onRetry?: () => void
  onDismiss?: () => void
}

export function ErrorBanner({ message, onRetry, onDismiss }: Props) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-100"
    >
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      <p className="flex-1 leading-relaxed">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="key focusable h-7 w-7 shrink-0 rounded-full"
          aria-label="Retry"
        >
          <RefreshIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="key focusable h-7 w-7 shrink-0 rounded-full"
          aria-label="Dismiss"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}
