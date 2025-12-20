import type { ReactNode } from 'react'

type CornerFrameProps = {
  children: ReactNode
  className?: string
  cornerClassName?: string
  cornerSizeClassName?: string
}

export default function CornerFrame({
  children,
  className = '',
  cornerClassName = 'border-bp-blue/50',
  cornerSizeClassName = 'w-2 h-2',
}: CornerFrameProps) {
  return (
    <div className={['relative', className].filter(Boolean).join(' ')}>
      <div
        className={[
          'pointer-events-none absolute top-0 left-0 z-10',
          cornerSizeClassName,
          'border-t border-l',
          cornerClassName,
        ].join(' ')}
      />
      <div
        className={[
          'pointer-events-none absolute top-0 right-0 z-10',
          cornerSizeClassName,
          'border-t border-r',
          cornerClassName,
        ].join(' ')}
      />
      <div
        className={[
          'pointer-events-none absolute bottom-0 left-0 z-10',
          cornerSizeClassName,
          'border-b border-l',
          cornerClassName,
        ].join(' ')}
      />
      <div
        className={[
          'pointer-events-none absolute bottom-0 right-0 z-10',
          cornerSizeClassName,
          'border-b border-r',
          cornerClassName,
        ].join(' ')}
      />
      {children}
    </div>
  )
}

