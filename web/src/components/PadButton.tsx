import type { ButtonHTMLAttributes, PointerEvent, ReactNode } from 'react'
import { useHoldRepeat } from '../hooks/useRemote'

type Variant = 'default' | 'accent' | 'power' | 'ghost'

type PadButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  unlearned?: boolean
}

export function PadButton({
  variant = 'default',
  unlearned = false,
  className = '',
  children,
  ...rest
}: PadButtonProps) {
  return (
    <button
      type="button"
      data-variant={variant}
      data-unlearned={unlearned || undefined}
      className={`key focusable ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

type HoldButtonProps = PadButtonProps & {
  onFire: () => void
  hold?: boolean
}

/** A PadButton that keeps firing while the finger or mouse stays down. */
export function HoldButton({ onFire, hold = true, disabled, ...rest }: HoldButtonProps) {
  const handlers = useHoldRepeat({ onTick: onFire, enabled: hold && !disabled })

  const stopAll = (event: PointerEvent<HTMLButtonElement>) => {
    handlers.onPointerUp()
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <PadButton
      {...rest}
      disabled={disabled}
      onPointerDown={handlers.onPointerDown}
      onPointerUp={stopAll}
      onPointerLeave={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerUp}
      onContextMenu={handlers.onContextMenu}
    />
  )
}

export function IconLabel({ icon, label }: { icon: ReactNode; label: ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-1">
      {icon}
      <span className="text-[11px] font-medium tracking-wide text-mist-400">{label}</span>
    </span>
  )
}
