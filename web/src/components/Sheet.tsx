import { useEffect, type ReactNode } from 'react'
import { XIcon } from '../icons'

type SheetProps = {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
}

export function Sheet({ title, subtitle, onClose, children }: SheetProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="panel relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded-3xl"
      >
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-white/10 bg-ink-900/90 px-5 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-mist-100">{title}</h2>
            {subtitle ? <div className="mt-0.5 text-xs text-mist-500">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="key focusable h-9 w-9 shrink-0 rounded-full"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  )
}
