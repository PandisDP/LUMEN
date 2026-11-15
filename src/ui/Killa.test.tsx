import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Killa, type KillaState } from './Killa.tsx'

const STATES: KillaState[] = ['idle', 'thinking', 'ok', 'alert', 'offline']

describe('Killa', () => {
  it.each(STATES)('renders the %s state', (state) => {
    render(<Killa state={state} />)
    const svg = screen.getByTestId('killa')
    expect(svg).toHaveAttribute('data-state', state)
    expect(svg).toHaveClass('killa', `killa-${state}`)
  })

  it('is idle, 48 px and decorative by default', () => {
    render(<Killa />)
    const svg = screen.getByTestId('killa')
    expect(svg).toHaveAttribute('data-state', 'idle')
    expect(svg).toHaveAttribute('width', '48')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).not.toHaveAttribute('role')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('is a named image when it gets a title', () => {
    render(<Killa title="Killa" size={72} />)
    const svg = screen.getByRole('img', { name: 'Killa' })
    expect(svg).not.toHaveAttribute('aria-hidden')
    expect(svg.querySelector('title')).toHaveTextContent('Killa')
    expect(svg).toHaveAttribute('width', '72')
  })

  it('changes the face with the state, so no state depends on motion', () => {
    const { container, rerender } = render(<Killa state="idle" />)
    const mouth = () => container.querySelector('.killa-mouth')
    const smile = mouth()?.getAttribute('d')
    expect(container.querySelectorAll('.killa-eyes circle')).toHaveLength(2)
    rerender(<Killa state="ok" />)
    expect(container.querySelectorAll('.killa-eyes path')).toHaveLength(2)
    rerender(<Killa state="alert" />)
    expect(mouth()?.tagName.toLowerCase()).toBe('line')
    expect(container.querySelector('.killa-eyes rect')).not.toBeNull()
    rerender(<Killa state="offline" />)
    expect(mouth()?.getAttribute('d')).not.toBe(smile)
  })
})
