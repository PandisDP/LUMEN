import { useEffect } from 'react'
import {
  type Challenge,
  CHALLENGES,
  HINT_PENALTY,
  MAX_CHALLENGE_SCORE,
  challengeScore,
  findChallenge,
  goalsMet,
  nextChallenge,
  totalScore,
} from '../config/challenges.ts'
import { openChallenges, startChallenge, useChallengeState } from '../hooks/useChallengeState.ts'
import { useT } from '../i18n/index.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { LevelTag } from './LevelTag.tsx'

const numberOf = (c: Challenge) => CHALLENGES.indexOf(c) + 1

/** The five challenges with the best score of each one. */
function ChallengeList() {
  const t = useT()
  const done = useUiStore((s) => s.challengeDone)
  const setOpen = useUiStore((s) => s.setChallengesOpen)
  return (
    <section className="overlay challenges" aria-label={t('challenge.aria')}>
      <header className="overlay__head">
        <h2>{t('challenge.title')}</h2>
        <div>
          <span className="chip challenges__total">
            {t('challenge.total', {
              score: totalScore(done),
              max: CHALLENGES.length * MAX_CHALLENGE_SCORE,
            })}
          </span>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            {t('common.close')}
          </button>
        </div>
      </header>
      <p className="challenges__intro">{t('challenge.intro')}</p>
      <ol className="challenges__grid">
        {CHALLENGES.map((c) => {
          const best = done[c.id]
          return (
            <li key={c.id} className="challenges__card" data-done={best !== undefined}>
              <p className="challenges__kicker">
                {t('challenge.number', { n: numberOf(c) })}
                {best !== undefined && (
                  <span className="challenges__best">
                    <LevelTag level="good" /> {t('challenge.best', { score: best })}
                  </span>
                )}
              </p>
              <h3>{t(c.titleKey)}</h3>
              <p>{t(c.briefKey)}</p>
              <button type="button" className="btn btn--accent" onClick={() => startChallenge(c)}>
                {t(best === undefined ? 'challenge.start' : 'challenge.retry')}
                <span className="sr-only">: {t(c.titleKey)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/**
 * The challenge in progress: it keeps checking the goals while the user works with the normal
 * panels. With the overlay open it shows the brief and the checklist; closed, a compact bar.
 */
function ActiveChallenge({ challenge, open }: { challenge: Challenge; open: boolean }) {
  const t = useT()
  const state = useChallengeState(challenge.needsRover)
  const hints = useUiStore((s) => s.challengeHints)
  const result = useUiStore((s) => s.challengeResult)
  const { setChallengesOpen, setChallenge, revealChallengeHint } = useUiStore.getState()

  const met = goalsMet(challenge, state)
  const count = met.filter(Boolean).length
  const total = challenge.goals.length
  const allMet = count === total
  const solved = result !== null

  // Latch the result the first time every goal is met: later changes do not undo a solved run.
  useEffect(() => {
    if (!allMet) return
    const ui = useUiStore.getState()
    if (ui.challengeId === challenge.id && ui.challengeResult === null)
      ui.completeChallenge(challenge.id, challengeScore(ui.challengeHints.length))
  }, [allMet, challenge.id])

  const n = numberOf(challenge)
  const next = nextChallenge(challenge.id)
  const status = solved
    ? `${t('challenge.success.title')} ${t('challenge.success.score', { score: result, max: MAX_CHALLENGE_SCORE })}`
    : t('challenge.progress', { met: count, total })
  const live = (
    <p className="sr-only" role="status" aria-live="polite">
      {status}
    </p>
  )

  if (!open) {
    const pending = challenge.goals.find((_, i) => !met[i])
    return (
      <aside className="challenge-bar" aria-label={t('challenge.bar.aria')} data-solved={solved}>
        <div className="challenge-bar__text">
          <span className="challenge-bar__kicker">{t('challenge.number', { n })}</span>
          <strong>{t(challenge.titleKey)}</strong>
          {!solved && pending && <span className="challenge-bar__goal">{t(pending.labelKey)}</span>}
        </div>
        <span className="chip" data-level={solved ? 'good' : undefined}>
          {solved ? (
            <>
              <LevelTag level="good" /> {t('challenge.success.title')}
            </>
          ) : (
            <span aria-hidden>
              {count}/{total}
            </span>
          )}
        </span>
        <button type="button" className="btn" onClick={openChallenges}>
          {t(solved ? 'challenge.bar.result' : 'challenge.bar.open')}
        </button>
        {live}
      </aside>
    )
  }

  return (
    <section className="overlay challenges" aria-label={t('challenge.aria')}>
      <header className="overlay__head">
        <h2>
          <span className="challenges__kicker">{t('challenge.number', { n })}</span>{' '}
          {t(challenge.titleKey)}
        </h2>
        <div>
          <button type="button" className="btn" onClick={() => setChallenge(null)}>
            {t('challenge.all')}
          </button>
          <button type="button" className="btn" onClick={() => startChallenge(challenge)}>
            {t('challenge.restart')}
          </button>
          <button
            type="button"
            className="btn btn--accent"
            onClick={() => setChallengesOpen(false)}
          >
            {t(solved ? 'common.close' : 'challenge.go')}
          </button>
        </div>
      </header>
      {live}

      {solved && (
        <article className="challenges__success" aria-labelledby="challenge-success">
          <h3 id="challenge-success">
            <LevelTag level="good" /> {t('challenge.success.title')}
          </h3>
          <p className="challenges__score">
            {t('challenge.success.score', { score: result, max: MAX_CHALLENGE_SCORE })}
            {hints.length > 0 && (
              <span className="hint">
                {' '}
                {t('challenge.success.hints', { n: hints.length, cost: HINT_PENALTY })}
              </span>
            )}
          </p>
          <h4>{t('challenge.success.learned')}</h4>
          <p>{t(challenge.whyKey)}</p>
          <div className="explain__actions">
            {next ? (
              <button
                type="button"
                className="btn btn--accent"
                onClick={() => startChallenge(next)}
              >
                {t('challenge.next')} →
              </button>
            ) : (
              <p className="challenges__finished">{t('challenge.finished')}</p>
            )}
          </div>
        </article>
      )}

      <p className="challenges__brief">{t(challenge.briefKey)}</p>
      <h3 className="challenges__goals-title">
        {t('challenge.goals')}{' '}
        <span className="chip" data-level={allMet ? 'good' : undefined}>
          {count}/{total}
        </span>
      </h3>
      <ul className="challenges__goals">
        {challenge.goals.map((g, i) => {
          const now = g.current?.(state)
          const revealed = hints.includes(g.id)
          return (
            <li key={g.id} data-met={met[i]}>
              {met[i] ? (
                <LevelTag level="good" />
              ) : (
                <span className="challenges__todo">
                  <span aria-hidden>○</span>
                  <span className="sr-only">{t('challenge.goal.todo')}</span>
                </span>
              )}
              <div>
                <span className="challenges__goal">{t(g.labelKey)}</span>
                {now !== undefined && (
                  <span className="challenges__now"> {t('challenge.now', { value: now })}</span>
                )}
                {!met[i] && !solved && g.hintKey && !revealed && (
                  <button
                    type="button"
                    className="btn btn--ghost challenges__hint-btn"
                    onClick={() => revealChallengeHint(g.id)}
                  >
                    {t('challenge.hint', { cost: HINT_PENALTY })}
                    <span className="sr-only">: {t(g.labelKey)}</span>
                  </button>
                )}
                {g.hintKey && revealed && <p className="challenges__hint">{t(g.hintKey)}</p>}
              </div>
            </li>
          )
        })}
      </ul>
      {!solved && <p className="hint">{t('challenge.how')}</p>}
    </section>
  )
}

/** "Retos": an educational game of five guided missions on top of the app's own figures. */
export function Challenges() {
  const open = useUiStore((s) => s.challengesOpen)
  const challenge = findChallenge(useUiStore((s) => s.challengeId))
  if (!challenge) return open ? <ChallengeList /> : null
  return <ActiveChallenge key={challenge.id} challenge={challenge} open={open} />
}
