/**
 * The display view (scrpg-aid-designs/game-table/spec.md, section 13): the shared center, read-only, at
 * room scale for a TV or a second screen. It's laid out on a 1920×1080 stage and scaled to fit
 * the window, so it never scrolls: a table with more on it than fits at full size scales down
 * as a whole. There's nothing to click.
 *
 * It renders what an observer receives (`project(game, 'observer')`), whether that came over the
 * network (watching a hosted game) or from the GM's own table on the same device.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { DiceText, DieIcon } from '../components/icons'
import { CardBand } from '../components/CharBand'
import { appearanceOf, type Appearance } from '../colors/palette'
import { ActorChip, TurnStrip } from './TurnStrip'
import { heroPointCount, modName } from '../play/state'
import type { PlayMod } from '../hero/model'
import { betweenIssues, gameDisplayName, issueTitle, sceneDisplayName } from './model'
import { heroOnTableName, viewName, type TableView } from './project'
import { boxLabel, groupSummary, sameActor, sceneZone, stepsText, turnStrip } from './table'
import { STAGE_HEIGHT, STAGE_WIDTH, stageScale } from './display'
import { ZoneChip } from './TableCenter'
import { heroView, villainView } from './views'


/** Scales the stage to the window, and keeps it scaled as the window or the content changes. */
function useFit() {
  const ref = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ scale: 1, left: 0, top: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const content = el.scrollHeight
      const scale = stageScale(w, h, content)
      setFit({ scale, left: Math.max(0, (w - STAGE_WIDTH * scale) / 2), top: Math.max(0, (h - Math.max(STAGE_HEIGHT, content) * scale) / 2) })
    }
    update()
    // The headings' font changes their height once it has loaded.
    document.fonts?.ready.then(update, () => {})
    window.addEventListener('resize', update)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : undefined
    observer?.observe(el)
    return () => {
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [])
  return { ref, fit }
}

function Mods({ mods }: { mods: readonly PlayMod[] }) {
  if (!mods.length) return null
  return (
    <ul className="dv-mods" aria-label="Bonuses and penalties">
      {mods.map((m) => (
        <li key={m.id} className="dv-mod">
          {modName(m)}
        </li>
      ))}
    </ul>
  )
}

function Hp({ health, maxHealth }: { health?: number; maxHealth?: number }) {
  if (health === undefined) return null
  return (
    <span className="dv-hp">
      {health}
      {maxHealth !== undefined && <small> / {maxHealth}</small>}
    </span>
  )
}

function Card({ kind, name, acting, appearance, children }: { kind?: string; name: string; acting: boolean; appearance: Appearance; children: ReactNode }) {
  return (
    <article className={acting ? 'dv-card dv-card--acting' : 'dv-card'} aria-label={name}>
      <CardBand appearance={appearance} />
      {kind && <div className="dv-label">{kind}</div>}
      <div className="dv-name">{name}</div>
      {children}
    </article>
  )
}

interface Props {
  table: TableView
  /** "Watching Thursday game · K7QX-2M". */
  watching: string
  /** How the connection is, when it isn't simply live ("Reconnecting to the GM…"). */
  status?: string
}

export function DisplayView({ table, watching, status }: Props) {
  const { ref, fit } = useFit()
  const { scene } = table
  const strip = turnStrip(table)
  const paused = betweenIssues(table)
  const finished = table.issues.at(-1)
  const name = (r: Parameters<typeof viewName>[1]) => viewName(table, r, heroOnTableName)
  const acting = (kind: 'hero' | 'villain' | 'group', id: string) => Boolean(table.turn.current && sameActor(table.turn.current, { kind, id }))
  const heroes = table.heroes.map((h) => heroView(h, table))
  const latest = table.feed.at(-1)
  const footer = (
    <footer className="dv-footer">
      <span className="dv-grow dv-latest">{latest ? <DiceText text={latest.text} /> : ''}</span>
      {status && <span className="dv-status">{status}</span>}
      <span>{watching}</span>
    </footer>
  )
  // Between issues the screen is the end card (scrpg-aid-designs/issues/display-end.dc.html): the title,
  // the summary, the heroes' chips, and the issue's scenes, game and date.
  if (paused && finished) {
    const scenes = `${finished.sceneCount} ${finished.sceneCount === 1 ? 'scene' : 'scenes'}`
    const on = finished.finishedAt ? new Date(finished.finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
    return (
      <div className="dv-window">
        <div ref={ref} className="dv-stage" style={{ transform: `scale(${fit.scale})`, left: fit.left, top: fit.top }}>
          <section className="dv-endcard" aria-labelledby="dv-endcard-title">
            <div className="dv-label dv-end dv-endcard__over">END OF ISSUE {finished.number}</div>
            <h1 id="dv-endcard-title" key={`issue-${finished.id}`} className="dv-scene dv-scene--enter dv-endcard__title">
              {issueTitle(finished)}
            </h1>
            {finished.summary && <div className="dv-endcard__summary">{finished.summary}</div>}
            {heroes.length > 0 && (
              <ul className="dv-endcard__heroes" aria-label="Heroes">
                {heroes.map((h) => (
                  <li key={h.ref.id}>
                    <ActorChip game={table} actor={h.ref} name={h.name} />
                  </li>
                ))}
              </ul>
            )}
            <div className="dv-endcard__meta">{[scenes, gameDisplayName(table), on].filter(Boolean).join(' · ')}</div>
          </section>
          {footer}
        </div>
      </div>
    )
  }
  return (
    <div className="dv-window">
      <div ref={ref} className="dv-stage" style={{ transform: `scale(${fit.scale})`, left: fit.left, top: fit.top }}>
        <header className="dv-top">
          <div className="dv-grow">
            <div className="dv-label">Scene {scene.number}</div>
            {/* Keyed by number, so a new scene's name animates in. */}
            <h1 key={scene.number} className="dv-scene dv-scene--enter">
              {sceneDisplayName(table)}
            </h1>
            {table.environment && <div className="dv-sub">Environment: {table.environment.name}</div>}
          </div>
          <div>
            <div className="dv-label">Scene tracker</div>
            <div className="dv-tracker" role="img" aria-label={`Scene tracker at ${boxLabel(scene.tracker, scene.position)} of ${scene.tracker.length}`}>
              {scene.tracker.map((z, i) => (
                <span key={i} className={`dv-box zone-${z}${i < scene.position ? ' dv-box--past' : ''}${i === scene.position ? ' dv-box--now' : ''}`} aria-hidden="true" />
              ))}
            </div>
          </div>
          <div>
            <div className="dv-label">Scene zone</div>
            <ZoneChip zone={sceneZone(table)} />
          </div>
          <div className="dv-round">{table.round === 0 ? 'Not started' : `Round ${table.round}`}</div>
        </header>

        {strip.length > 0 && (
          <TurnStrip game={table} name={name} room />
        )}

        {heroes.length > 0 && (
          <section aria-labelledby="dv-heroes">
            <div id="dv-heroes" className="dv-label dv-heroes">
              Heroes · {heroPointCount(table.heroPoints)}
            </div>
            <div className="dv-grid">
            {heroes.map((h) => (
              <Card key={h.ref.id} name={h.name} acting={acting('hero', h.ref.id)} appearance={h.appearance}>
                <div className="dv-sub">{h.sub}</div>
                <div className="dv-row">
                  {h.zone && <ZoneChip zone={h.zone} />}
                  <Hp health={h.health} maxHealth={h.maxHealth} />
                  <span className="dv-grow" />
                  {h.statusDie && (
                    <span className="dv-die">
                      <span className="visually-hidden">Status die </span>
                      <DieIcon die={h.statusDie} />
                    </span>
                  )}
                </div>
                {h.health !== undefined && h.maxHealth ? (
                  <div className="dv-bar" aria-hidden="true">
                    <span className={`zone-${h.zone ?? 'green'}`} style={{ width: `${Math.max(0, Math.min(100, Math.round((h.health / h.maxHealth) * 100)))}%` }} />
                  </div>
                ) : null}
                <Mods mods={h.mods} />
                {h.minions.length > 0 && (
                  <ul className="dv-mods" aria-label="Minions">
                    {h.minions.map((m) => (
                      <li key={m.id} className="dv-mod">
                        {m.name} <DieIcon die={m.die} size="inline" />
                      </li>
                    ))}
                  </ul>
                )}
                {h.reactionUsed && <div className="dv-sub">Reaction used</div>}
              </Card>
            ))}
            </div>
          </section>
        )}

        {(table.villains.length > 0 || table.groups.length > 0 || table.challenges.length > 0) && (
          <section aria-label="Opposition" className="dv-grid">
            {table.villains.map(villainView).map((v) => (
              <Card key={v.ref.id} kind={v.kind} name={v.name} acting={acting('villain', v.ref.id)} appearance={v.appearance}>
                {v.playersSee === 'name' ? (
                  <div className="dv-sub">The GM is keeping its condition secret.</div>
                ) : (
                  <>
                    <div className="dv-row">
                      {v.zone && <ZoneChip zone={v.zone} label={v.zone === 'out' ? 'Defeated' : undefined} />}
                      {v.playersSee === 'health' && <Hp health={v.health} maxHealth={v.maxHealth} />}
                    </div>
                    <Mods mods={v.mods} />
                  </>
                )}
              </Card>
            ))}
            {table.groups.map((g) => (
              <Card key={g.id} kind={g.kind === 'minions' ? 'Minions' : 'Lieutenants'} name={g.name} acting={acting('group', g.id)} appearance={appearanceOf({ kind: 'group', environment: g.owner.kind === 'environment', color: g.color })}>
                <ul className="dv-row dv-summary" aria-label="Dice">
                  {groupSummary(g).map((s) => (
                    <li key={s.die}>
                      <DieIcon die={s.die} /> <span className="dv-hp">× {s.count}</span>
                    </li>
                  ))}
                </ul>
                {g.members.some((m) => m.mods.length) && (
                  <ul className="dv-members" aria-label={`Members of ${g.name}`}>
                    {g.members
                      .filter((m) => m.mods.length)
                      .map((m) => (
                        <li key={m.id}>
                          {m.n}: {m.mods.map(modName).join(', ')}
                        </li>
                      ))}
                  </ul>
                )}
              </Card>
            ))}
            {table.challenges.map((c) => (
              <Card key={c.id} kind="Challenge" name={c.name} acting={false} appearance={appearanceOf({ kind: 'challenge', environment: c.owner.kind === 'environment', color: c.color })}>
                <div className="dv-row">
                  {c.steps.map((step, i) => (
                    <span key={i} className={step.done ? 'dv-step dv-step--done' : 'dv-step'} role="img" aria-label={`${step.label}${step.done ? ', done' : ''}`} />
                  ))}
                  <span className="dv-sub">{stepsText(c)}</span>
                </div>
                {c.whenDone && <div className="dv-sub">{c.whenDone}</div>}
              </Card>
            ))}
          </section>
        )}

        <span className="dv-grow" />
        {footer}
      </div>
    </div>
  )
}
