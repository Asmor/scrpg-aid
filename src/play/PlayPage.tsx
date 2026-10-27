/**
 * The game aid (Phase 3): a hero's state during play. Current Health and zone (with the scene
 * tracker), the status die, hero points, the reaction, mods, twists, and a timestamped
 * history of every change. It's saved with the hero as it changes (./state.ts has the rules).
 */
import { useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react'
import { editPath, heroPath, listPath, navigate } from '../app/route'
import { DieIcon } from '../components/icons'
import { buildSheet } from '../creation/sheet'
import { useHeroEditor } from '../editor/useHeroEditor'
import { heroDisplayName, newId, type PlayMod, type PlayState } from '../hero/model'
import { addMod, addTwist, currentHealth, describeMod, effectiveZone, emptyPlay, MAX_HERO_POINTS, newIssue, noteGivenMod, removeMod, removeTwist, setDividedForm, setForm, setHealth, setHeroPoints, setReactionUsed, setSceneZone, statusDieFor, type Clock } from './state'
import { currentForm, dividedForm, formAvailable, formDice, formNoun, playAbilities, playForms } from './forms'
import { modeLimits } from '../creation/format'
import { formatFull, formatWhen } from './time'
import { useTick } from './useTick'
import { ActionIcon } from '../components/icons'
import { ABILITY_TYPE_LABEL, PLAY_ZONE_LABEL } from '../hero/labels'
import { confirmRoll } from './roll'
import { RollDialog, type RollSubject } from './RollDialog'
import { ModForm, type ModTarget } from './ModForm'
import { usePlayerSnapshot, useSession } from '../session/context'
import { heroSummary } from '../session/player'
import { memberName } from '../session/gm'
import { PlayerPanel } from '../session/PlayerPanel'


function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sheet-panel play-section" aria-label={title}>
      <h3 className="sheet-panel__title">{title}</h3>
      {children}
    </section>
  )
}

export function PlayPage({ id, clock = () => ({ now: new Date(), newId: () => newId() }), random }: { id: string; clock?: () => Clock; random?: () => number }) {
  const { state, update, saveError, flush } = useHeroEditor(id)
  const formId = useId()
  const tick = useTick()
  const [amount, setAmount] = useState('')
  const [twistKind, setTwistKind] = useState<'minor' | 'major'>('minor')
  const [twistText, setTwistText] = useState('')
  const [confirmIssue, setConfirmIssue] = useState(false)
  const [rolling, setRolling] = useState<RollSubject | null>(null)

  // A game session this hero is playing in (Phase 4).
  const session = useSession()
  const player = session.player?.heroId === id ? session.player : undefined
  const snapshot = usePlayerSnapshot(player)
  const loaded = state.status === 'ready' ? state.hero : undefined
  useEffect(() => {
    if (!player || !loaded) return
    // The session's changes (the GM's scene, mods others gave) go into the hero's play state.
    const next = player.sync(loaded.play ?? emptyPlay())
    if (next) update((h) => void (h.play = next))
    // The table sees the hero, and their history as it happens.
    player.updateHero(heroSummary(loaded, buildSheet(loaded), next ?? loaded.play ?? emptyPlay()))
    if (snapshot?.status === 'connected') player.share((next ?? loaded.play)?.history ?? [])
  }, [player, snapshot, loaded, update])

  if (state.status !== 'ready') {
    return (
      <div className="hero-page">
        <p>
          <a href={listPath}>← All heroes</a>
        </p>
        {state.status === 'loading' && <p>Loading…</p>}
        {state.status === 'missing' && <p role="alert">There's no saved hero with that link. It may have been deleted.</p>}
        {state.status === 'unreadable' && <p role="alert">This hero couldn't be read: {state.error}</p>}
        {state.status === 'error' && <p role="alert">Something went wrong loading this hero: {state.message}</p>}
      </div>
    )
  }

  /** Leaves once the changes made so far are saved, so the next page shows them (as the editor does). */
  const leave = (path: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void flush().then(() => navigate(path))
  }
  const hero = state.hero
  const sheet = buildSheet(hero)
  const play = hero.play ?? emptyPlay()
  const change = (fn: (p: PlayState, c: Clock) => PlayState) =>
    update((h) => {
      h.play = fn(h.play ?? emptyPlay(), clock())
    })
  // In a game, a mod can go to another hero (through the GM).
  const targets: ModTarget[] =
    snapshot?.status === 'connected' && player ? (snapshot.state?.members ?? []).filter((m) => m.clientId !== player.clientId && m.hero).map((m) => ({ id: m.clientId, name: memberName(m) })) : []
  /** Adds a mod to the hero, or gives it to another; false when it couldn't be sent. */
  const giveOrAdd = (mod: Omit<PlayMod, 'id'>, to?: string): boolean => {
    if (!to) {
      change((p, c) => addMod(p, mod, c))
      return true
    }
    const target = targets.find((t) => t.id === to)
    if (!target || !player?.giveMod(target.id, mod)) return false
    change((p, c) => noteGivenMod(p, mod, target.name, c))
    return true
  }
  const health = currentHealth(sheet, play)
  const zone = effectiveZone(sheet, play)
  const forms = playForms(sheet)
  const form = currentForm(forms, play)
  const divided = dividedForm(sheet, play)
  const dice = formDice(hero, sheet, play)
  const die = statusDieFor(dice, zone)
  const noun = formNoun(forms)
  const delta = Number(amount)
  const validAmount = amount.trim() !== '' && Number.isInteger(delta) && delta > 0

  return (
    <div className="play-page">
      <div className="hero-editor__top">
        <a href={heroPath(id)} onClick={leave(heroPath(id))}>
          ← Sheet
        </a>
        <a href={editPath(id)} onClick={leave(editPath(id))}>
          Edit hero
        </a>
      </div>
      <h2 className="hero-editor__name">{heroDisplayName(hero)}</h2>
      {saveError && (
        <p role="alert" className="error">
          Your last change couldn't be saved: {saveError}
        </p>
      )}

      <div className="sheet-grid">
        <Section title="Health">
          {health === undefined ? (
            <p className="sheet-empty">Work out Health in the editor first.</p>
          ) : (
            <>
              <p className={`play-health zone-${zone ?? 'green'}`}>
                <strong>{health}</strong> / {sheet.maxHealth} <span className="play-zone">{zone ? PLAY_ZONE_LABEL[zone] : ''}</span>
              </p>
              <div className="button-row">
                <label className="visually-hidden" htmlFor={`${formId}-amount`}>
                  Amount
                </label>
                <input id={`${formId}-amount`} className="play-amount" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
                <button type="button" className="button" disabled={!validAmount} onClick={() => {
                    change((p, c) => setHealth(p, sheet, (currentHealth(sheet, p) ?? 0) - delta, c))
                    setAmount('')
                  }}>
                  Lose
                </button>
                <button type="button" className="button" disabled={!validAmount} onClick={() => {
                    change((p, c) => setHealth(p, sheet, (currentHealth(sheet, p) ?? 0) + delta, c))
                    setAmount('')
                  }}>
                  Gain
                </button>
              </div>
            </>
          )}
          <fieldset className="play-scene" disabled={Boolean(player)}>
            <legend>Scene</legend>
            {(['green', 'yellow', 'red'] as const).map((z) => (
              <label key={z} className="checkbox">
                <input type="radio" name={`${formId}-scene`} checked={(play.sceneZone ?? 'green') === z} onChange={() => change((p, c) => setSceneZone(p, z, c))} />
                {PLAY_ZONE_LABEL[z]}
              </label>
            ))}
          </fieldset>
          {player && <p className="hint">The GM sets the scene.</p>}
          <p>
            Status die: {die ? <DieIcon die={die} /> : zone === 'out' ? 'none (Out)' : '—'}
          </p>
        </Section>

        <Section title="Hero points and reaction">
          <div className="button-row">
            <button type="button" className="button" aria-label="Spend a hero point" disabled={play.heroPoints <= 0} onClick={() => change((p, c) => setHeroPoints(p, p.heroPoints - 1, c))}>
              −
            </button>
            <span aria-live="polite">
              {play.heroPoints} of {MAX_HERO_POINTS} hero points
            </span>
            <button type="button" className="button" aria-label="Gain a hero point" disabled={play.heroPoints >= MAX_HERO_POINTS} onClick={() => change((p, c) => setHeroPoints(p, p.heroPoints + 1, c))}>
              +
            </button>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={play.reactionUsed} onChange={(e) => change((p, c) => setReactionUsed(p, e.target.checked, c))} />
            Reaction used this round
          </label>
        </Section>

        {(forms.length > 0 || divided) && (
          <Section title={noun === 'mode' ? 'Mode' : 'Form'}>
            {forms.length > 0 && (
              <label className="field" htmlFor={`${formId}-form`}>
                <span>{noun === 'mode' ? 'Current mode' : 'Current form'}</span>
                <select
                  id={`${formId}-form`}
                  value={form?.key ?? ''}
                  onChange={(e) => {
                    const next = forms.find((f) => (f.key ?? '') === e.target.value)
                    if (next) change((p, c) => setForm(p, next.key, next.name, c))
                  }}
                >
                  {forms.map((f) => (
                    <option key={f.key ?? ''} value={f.key ?? ''} disabled={f !== form && !formAvailable(f, zone)}>
                      {f.name}
                      {f.zone === 'yellow' ? ' (Yellow)' : f.zone === 'red' ? ' (Red)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {form && !formAvailable(form, zone) && <p className="hint">{form.zone === 'red' ? 'This needs the Red zone.' : 'This needs the Yellow or Red zone.'}</p>}
            {divided && (
              <fieldset className="play-scene">
                <legend>Divided form</legend>
                {(['civilian', 'heroic'] as const).map((f) => (
                  <label key={f} className="checkbox">
                    <input type="radio" name={`${formId}-divided`} checked={divided === f} onChange={() => change((p, c) => setDividedForm(p, f, c))} />
                    {f === 'civilian' ? 'Civilian' : 'Heroic'}
                  </label>
                ))}
              </fieldset>
            )}
            <dl className="play-traits">
              {(
                [
                  ['Powers', dice.powers],
                  ['Qualities', dice.qualities],
                ] as const
              ).map(([label, list]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {list.length === 0
                      ? 'None'
                      : list.map((t) => (
                          <span key={`${t.trait.kind}:${t.trait.id}`} className="play-trait">
                            {t.name} <DieIcon die={t.die} />
                          </span>
                        ))}
                  </dd>
                </div>
              ))}
            </dl>
            {dice.slots[0] === dice.slots[1] && <p className="hint">Divided Psyche: you roll two {dice.slots[0] === 'power' ? 'powers' : 'qualities'} with your status die.</p>}
            {form && (form.cannot.length > 0 || form.immobile) && <p>{modeLimits(form.cannot, form.immobile)}</p>}
            {form?.powerless && <p>Only principle abilities can be used.</p>}
          </Section>
        )}

        <Section title="Bonuses and penalties">
          {play.mods.length === 0 ? (
            <p className="sheet-empty">None.</p>
          ) : (
            <ul className="play-list">
              {play.mods.map((m) => (
                <li key={m.id} className={m.value > 0 ? 'play-mod play-mod--bonus' : 'play-mod play-mod--penalty'}>
                  <span>{describeMod(m)}</span>
                  <button type="button" className="button" aria-label={`Remove ${describeMod(m)}`} onClick={() => change((p, c) => removeMod(p, m.id, c))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ModForm targets={targets} onSubmit={giveOrAdd} />
        </Section>

        <Section title="Twists">
          {play.twists.length === 0 ? (
            <p className="sheet-empty">None.</p>
          ) : (
            <ul className="play-list">
              {play.twists.map((t) => (
                <li key={t.id}>
                  <span>
                    <strong>{t.kind === 'minor' ? 'Minor' : 'Major'}:</strong> {t.text}
                  </span>
                  <button type="button" className="button" aria-label={`Clear the ${t.kind} twist: ${t.text}`} onClick={() => change((p, c) => removeTwist(p, t.id, c))}>
                    Clear
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="play-add"
            onSubmit={(e) => {
              e.preventDefault()
              change((p, c) => addTwist(p, { kind: twistKind, text: twistText }, c))
              setTwistText('')
            }}
          >
            <label className="field" htmlFor={`${formId}-twist-kind`}>
              <span>Kind</span>
              <select id={`${formId}-twist-kind`} value={twistKind} onChange={(e) => setTwistKind(e.target.value as 'minor' | 'major')}>
                <option value="minor">Minor</option>
                <option value="major">Major</option>
              </select>
            </label>
            <label className="field" htmlFor={`${formId}-twist-text`}>
              <span>Twist</span>
              <input id={`${formId}-twist-text`} type="text" value={twistText} onChange={(e) => setTwistText(e.target.value)} />
            </label>
            <button type="submit" className="button" disabled={!twistText.trim()}>
              Add
            </button>
          </form>
        </Section>
      </div>

      <Section title="Game">
        <PlayerPanel heroId={id} player={session.player} snapshot={snapshot} hosting={Boolean(session.gm)} onLeave={session.leave} />
      </Section>

      <Section title="Abilities">
        <div className="button-row">
          <button type="button" className="button" disabled={zone === 'out'} onClick={() => setRolling({ kind: 'basic' })}>
            Basic action…
          </button>
        </div>
        <ul className="play-abilities">
          {playAbilities(hero, sheet, play, zone).map((a) => {
            const usable = a.type !== 'I'
            return (
              <li key={a.key} className={`play-ability zone-${a.from}`}>
                <span className="play-ability__name">
                  {a.name} <span className="choice__note">({ABILITY_TYPE_LABEL[a.type]})</span>{' '}
                  {a.effects.map((e) => (
                    <ActionIcon key={e} action={e} />
                  ))}
                </span>
                {usable && (
                  <button
                    type="button"
                    className="button"
                    disabled={Boolean(a.blocked)}
                    aria-label={`Use ${a.name}`}
                    onClick={() => setRolling({ kind: 'ability', name: a.name, text: a.text, use: a.use, reaction: a.type === 'R' })}
                  >
                    Use
                  </button>
                )}
                {usable && a.blocked && <span className="hint">{a.blocked}</span>}
                <p className="play-ability__text">{a.text}</p>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title="History">
        {play.history.length === 0 ? (
          <p className="sheet-empty">Nothing yet. Changes you make here are recorded.</p>
        ) : (
          <ol className="play-history" reversed>
            {[...play.history].reverse().map((h) => (
              <li key={h.id}>
                <time dateTime={h.at} title={formatFull(h.at)}>
                  {formatWhen(h.at, tick)}
                </time>{' '}
                {h.text}
                {h.details && (
                  <ul>
                    {h.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {rolling && (
        <RollDialog
          subject={rolling}
          dice={dice}
          zone={zone}
          mods={play.mods}
          onClose={() => setRolling(null)}
          onConfirm={(record) =>
            change((p, c) => {
              const after = confirmRoll(p, record, c)
              return rolling.kind === 'ability' && rolling.reaction ? setReactionUsed(after, true, c) : after
            })
          }
          targets={targets}
          onAddMod={giveOrAdd}
          random={random}
        />
      )}

      <div className="button-row">
        {confirmIssue ? (
          <span className="button-row" role="group" aria-label="Start a new issue?">
            <span>Start a new issue? Health is restored, and mods, twists, and hero points are cleared.</span>
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                change((p, c) => newIssue(p, c))
                setConfirmIssue(false)
              }}
            >
              Yes, new issue
            </button>
            <button type="button" className="button" onClick={() => setConfirmIssue(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="button" onClick={() => setConfirmIssue(true)}>
            New issue…
          </button>
        )}
      </div>
    </div>
  )
}
