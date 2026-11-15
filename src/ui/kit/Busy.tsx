import type { ReactNode } from 'react'

/** "Computing…": a quiet inline row with three dots (still under reduced motion). */
export function Busy({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={className ? `busy ${className}` : 'busy'} role="status">
      <span className="busy__dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span>{children}</span>
    </span>
  )
}
