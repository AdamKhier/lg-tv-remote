import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon } from '../icons'
import { PadButton, HoldButton } from './PadButton'

type Props = {
  onSend: (id: string) => void
}

const arrowClass = 'h-[68px] rounded-2xl'

export function Dpad({ onSend }: Props) {
  return (
    <div className="panel p-3">
      <div className="grid grid-cols-3 grid-rows-3 gap-2">
        <div aria-hidden="true" />
        <HoldButton onFire={() => onSend('up')} aria-label="Up" className={arrowClass}>
          <ChevronUpIcon className="h-7 w-7" />
        </HoldButton>
        <div aria-hidden="true" />

        <HoldButton onFire={() => onSend('left')} aria-label="Left" className={arrowClass}>
          <ChevronLeftIcon className="h-7 w-7" />
        </HoldButton>
        <PadButton
          onClick={() => onSend('ok')}
          variant="accent"
          aria-label="OK"
          className="h-[68px] rounded-full text-sm font-bold tracking-wider"
        >
          OK
        </PadButton>
        <HoldButton onFire={() => onSend('right')} aria-label="Right" className={arrowClass}>
          <ChevronRightIcon className="h-7 w-7" />
        </HoldButton>

        <div aria-hidden="true" />
        <HoldButton onFire={() => onSend('down')} aria-label="Down" className={arrowClass}>
          <ChevronDownIcon className="h-7 w-7" />
        </HoldButton>
        <div aria-hidden="true" />
      </div>
    </div>
  )
}
