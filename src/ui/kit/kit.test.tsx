import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BAND_GLYPH, LEVEL_GLYPH, NOTICE_GLYPH } from '../bands.ts'
import { LevelTag } from '../LevelTag.tsx'
import { Busy } from './Busy.tsx'
import { Empty } from './Empty.tsx'
import { Notice } from './Notice.tsx'
import { Stat } from './Stat.tsx'

describe('bands', () => {
  it('every band and every level has its own glyph', () => {
    expect(BAND_GLYPH).toEqual({
      ok: '✓',
      deficit: '▼',
      excess: '▲',
      stopped: '■',
      idle: '○',
      none: '·',
    })
    expect(LEVEL_GLYPH).toEqual({ good: '✓', warn: '▲', bad: '▼' })
    expect(new Set(Object.values(NOTICE_GLYPH)).size).toBe(4)
  })

  it('LevelTag prints the band glyph and says the level to screen readers', () => {
    const { container } = render(
      <>
        <LevelTag level="good" />
        <LevelTag level="warn" />
        <LevelTag level="bad" />
      </>,
    )
    const tags = [...container.querySelectorAll('.lvl')]
    expect(tags.map((el) => el.getAttribute('data-level'))).toEqual(['good', 'warn', 'bad'])
    expect(tags.map((el) => el.querySelector('[aria-hidden]')!.textContent)).toEqual([
      '✓',
      '▲',
      '▼',
    ])
    for (const el of tags) expect(el.querySelector('.sr-only')!.textContent).not.toBe('')
  })
})

describe('Notice', () => {
  it('errors and warnings are alerts; notes and successes are statuses', () => {
    const { rerender } = render(<Notice tone="error">roto</Notice>)
    expect(screen.getByRole('alert')).toHaveTextContent('roto')
    rerender(<Notice tone="warning">cuidado</Notice>)
    expect(screen.getByRole('alert')).toHaveTextContent('cuidado')
    rerender(<Notice tone="note">dato</Notice>)
    expect(screen.getByRole('status')).toHaveTextContent('dato')
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(<Notice tone="success">hecho</Notice>)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    rerender(
      <Notice tone="warning" role="status">
        sin prisa
      </Notice>,
    )
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'warning')
  })

  it('each tone carries a glyph, hidden from screen readers', () => {
    for (const tone of ['warning', 'note', 'success', 'error'] as const) {
      const { container, unmount } = render(<Notice tone={tone}>x</Notice>)
      const glyph = container.querySelector('.notice__glyph')!
      expect(glyph.textContent).toBe(NOTICE_GLYPH[tone])
      expect(glyph).toHaveAttribute('aria-hidden', 'true')
      unmount()
    }
  })

  it('brings the button that fixes the problem, and a title (as a heading on request)', () => {
    const fix = vi.fn()
    render(
      <Notice
        tone="error"
        title="No se pudo calcular"
        headingLevel={4}
        action={{ label: 'Reintentar', onClick: fix }}
      >
        sin red
      </Notice>,
    )
    expect(screen.getByRole('heading', { level: 4, name: 'No se pudo calcular' })).toBeVisible()
    const button = screen.getByRole('button', { name: 'Reintentar' })
    expect(button).toHaveClass('btn', 'btn--small')
    fireEvent.click(button)
    expect(fix).toHaveBeenCalledTimes(1)
  })

  it('takes several fixes; a disabled one does not fire', () => {
    const a = vi.fn()
    const b = vi.fn()
    render(
      <Notice
        tone="warning"
        action={[
          { label: 'Ampliar', onClick: a },
          { label: 'Bajar', onClick: b, disabled: true },
        ]}
      >
        nada
      </Notice>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bajar' }))
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
  })
})

describe('Empty', () => {
  it('shows the title, the hint and the action; a neutral mark without a mascot', () => {
    const go = vi.fn()
    const { container } = render(
      <Empty title="Aún no hay plan" action={{ label: 'Planificar', onClick: go }}>
        Elige un objetivo.
      </Empty>,
    )
    expect(screen.getByText('Aún no hay plan')).toHaveClass('empty__title')
    expect(screen.getByText('Elige un objetivo.')).toBeInTheDocument()
    expect(container.querySelector('.empty__mark')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Planificar' }))
    expect(go).toHaveBeenCalledTimes(1)
  })

  it('the mascot slot replaces the mark', () => {
    const { container } = render(<Empty title="Vacío" mascot={<svg data-testid="mascot" />} />)
    expect(screen.getByTestId('mascot')).toBeInTheDocument()
    expect(container.querySelector('.empty__mark')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('Stat', () => {
  it('prints label, value and unit; a level adds its glyph', () => {
    const { container } = render(<Stat label="Energía" value="72" unit="%" level="warn" />)
    expect(screen.getByText('Energía')).toHaveClass('kstat__label')
    expect(container.querySelector('.kstat')).toHaveAttribute('data-level', 'warn')
    expect(container.querySelector('.kstat__value')).toHaveTextContent('72%')
    expect(container.querySelector('.lvl [aria-hidden]')!.textContent).toBe('▲')
  })

  it('the delta points up or down and knows which way is good', () => {
    const { container, rerender } = render(
      <Stat label="Noche" value="40" delta={{ value: -5, unit: ' h', better: 'down' }} />,
    )
    const delta = () => container.querySelector('.kstat__delta')!
    expect(delta()).toHaveTextContent('▼ −5 h')
    expect(delta()).toHaveAttribute('data-good', 'true')
    rerender(<Stat label="Noche" value="40" delta={{ value: 12, better: 'down' }} />)
    expect(delta()).toHaveTextContent('▲ +12')
    expect(delta()).toHaveAttribute('data-good', 'false')
    rerender(<Stat label="Noche" value="40" delta={{ value: 0 }} />)
    expect(container.querySelector('.kstat__delta')).toBeNull()
    expect(container.querySelector('.lvl')).toBeNull()
  })
})

describe('Busy', () => {
  it('is a status with the text; the dots are decoration', () => {
    render(<Busy>Calculando…</Busy>)
    const row = screen.getByRole('status')
    expect(row).toHaveTextContent('Calculando…')
    expect(row.querySelector('.busy__dots')).toHaveAttribute('aria-hidden', 'true')
  })
})
