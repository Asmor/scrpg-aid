/**
 * A villain in the game aid (Phase 5), for the GM: Health for this scene's heroes, the status
 * die by the archetype's rule, mods, minor twists, the reaction, the once-per-scene scene
 * advance, its abilities (all usable, no zones), basic actions, and a timestamped history.
 * Saved with the villain as it changes (./play.ts has the rules).
 */
import { useId, useState, type ReactNode } from 'react'
import { listPath, villainPath } from '../app/route'
import { ActionIcon, DieIcon } from '../components/icons'
import { ABILITY_TYPE_LABEL, PLAY_ZONE_LABEL } from '../hero/labels'
import { newId } from '../hero/model'
import { ModForm } from '../play/ModForm'
import { confirmRoll } from '../play/roll'
import { RollDialog, type RollSubject } from '../play/RollDialog'
import { addMod, addTwist, currentHealth, describeMod, removeMod, removeTwist, setHealth, setReactionUsed, type Clock } from '../play/state'
import { formatFull, formatWhen } from '../play/time'
import { useTick } from '../play/useTick'
import { villainDisplayName, type VillainPlayState } from './model'
import { advanceScene, emptyVillainPlay, newScene, resetVillain, setChallengeParts, setSceneHeroes, setStatusCount, setWeaknessTier, villainHealth, villainStatusDie, villainZone } from './play'
import { buildVillainSheet, villainTraits } from './sheet'
import { statusSummary } from './status'
import { useVillainEditor } from './useVillainEditor'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sheet-panel play-section" aria-label={title}>
      <h3 className="sheet-panel__title">{title}</h3>
      {children}
    </section>
  )
}

export function VillainPlayPage({ id, clock = () => ({ now: new Date(), newId: () => newId() }), random }: { id: string; clock?: () => Clock; random?: () => number }) {
  const { state, update, saveError } = useVillainEditor(id)
  const formId = useId()
  const tick = useTick()
  const [amount, setAmount] = useState('')
  const [twistText, setTwistText] = useState('')
  const [rolling, setRolling] = useState<RollSubject | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  // What's typed for the heroes in this scene, so the field can be cleared and retyped.
  const [heroesDraft, setHeroesDraft] = useState<string | null>(null)
  const [countDraft, setCountDraft] = useState<string | null>(null)

  if (state.status !== 'ready') {
    return (
      <div className="hero-page">
        <p>
          <a href={listPath}>← Home</a>
        </p>
        {state.status === 'loading' && <p>Loading…</p>}
        {state.status === 'missing' && <p role="alert">There's no saved villain with that link. It may have been deleted.</p>}
        {state.status === 'unreadable' && <p role="alert">This villain couldn't be read: {state.error}</p>}
        {state.status === 'error' && <p role="alert">Something went wrong loading this villain: {state.message}</p>}
      </div>
    )
  }

  const villain = state.doc
  const sheet = buildVillainSheet(villain)
  const play = villain.play ?? emptyVillainPlay()
  const change = (fn: (p: VillainPlayState, c: Clock) => VillainPlayState) =>
    update((v) => {
      v.play = fn(v.play ?? emptyVillainPlay(), clock())
    })
  const health = villainHealth(villain, play)
  const current = currentHealth(health, play)
  const zone = villainZone(health, play)
  const rule = sheet.status
  const statusDie = rule ? villainStatusDie(rule, { ...play, zone }) : undefined
  const traits = villainTraits(villain).traits
  const dice = {
    powers: traits.filter((t) => t.trait.kind === 'power'),
    qualities: traits.filter((t) => t.trait.kind === 'quality'),
    ...(statusDie ? { statusDice: { green: statusDie, yellow: statusDie, red: statusDie } } : {}),
    slots: ['power', 'quality'] as const,
    cannot: [],
    known: traits,
  }
  const delta = Number(amount)
  const validAmount = amount.trim() !== '' && Number.isInteger(delta) && delta > 0
  const sceneHeroes = play.heroCount ?? villain.heroCount
  const out = zone === 'out'

  return (
    <div className="play-page">
      <div className="hero-editor__top">
        <a href={villainPath(id)}>← Sheet</a>
      </div>
      <h2 className="hero-editor__name">{villainDisplayName(villain)}</h2>
      {saveError && (
        <p role="alert" className="error">
          Your last change couldn't be saved: {saveError}
        </p>
      )}

      <div className="sheet-grid">
        <Section title="Health">
          {current === undefined ? (
            <p className="sheet-empty">Choose an approach and archetype first.</p>
          ) : (
            <>
              <p className={`play-health zone-${zone ?? 'green'}`}>
                <strong>{current}</strong> / {health.maxHealth} <span className="play-zone">{zone ? (out ? 'Defeated' : PLAY_ZONE_LABEL[zone]) : ''}</span>
              </p>
              <div className="button-row">
                <label className="visually-hidden" htmlFor={`${formId}-amount`}>
                  Amount
                </label>
                <input id={`${formId}-amount`} className="play-amount" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
                <button
                  type="button"
                  className="button"
                  disabled={!validAmount}
                  onClick={() => {
                    change((p, c) => setHealth(p, villainHealth(villain, p), (currentHealth(villainHealth(villain, p), p) ?? 0) - delta, c))
                    setAmount('')
                  }}
                >
                  Lose
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={!validAmount}
                  onClick={() => {
                    change((p, c) => setHealth(p, villainHealth(villain, p), (currentHealth(villainHealth(villain, p), p) ?? 0) + delta, c))
                    setAmount('')
                  }}
                >
                  Gain
                </button>
              </div>
            </>
          )}
          <label className="field" htmlFor={`${formId}-heroes`}>
            <span>Heroes in this scene</span>
            <input
              id={`${formId}-heroes`}
              type="number"
              inputMode="numeric"
              min={1}
              value={heroesDraft ?? String(sceneHeroes)}
              onChange={(e) => {
                setHeroesDraft(e.target.value)
                const n = Number(e.target.value)
                if (e.target.value.trim() && Number.isInteger(n) && n >= 1) change((p, c) => setSceneHeroes(p, n === villain.heroCount ? undefined : n, c))
              }}
              onBlur={() => setHeroesDraft(null)}
            />
          </label>
        </Section>

        <Section title="Status die">
          {rule ? (
            <>
              <p>
                {statusDie ? <DieIcon die={statusDie} /> : out ? 'None (defeated)' : '—'} <span className="hint">{statusSummary(rule)}</span>
              </p>
              {rule.basis === 'count' && (
                <label className="field" htmlFor={`${formId}-count`}>
                  <span>How many {rule.counts}</span>
                  <input
                    id={`${formId}-count`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={countDraft ?? String(play.statusCount ?? 0)}
                    onChange={(e) => {
                      setCountDraft(e.target.value)
                      const n = Number(e.target.value)
                      if (e.target.value.trim() && Number.isInteger(n) && n >= 0) change((p, c) => setStatusCount(p, n, c))
                    }}
                    onBlur={() => setCountDraft(null)}
                  />
                </label>
              )}
              {rule.basis === 'weakness' && (
                <fieldset className="choice-list">
                  <legend>Its weakness right now</legend>
                  {rule.tiers.map((t, i) => (
                    <label key={t.condition} className="checkbox">
                      <input type="radio" name={`${formId}-weakness`} checked={(play.weaknessTier ?? rule.tiers.length - 1) === i} onChange={() => change((p, c) => setWeaknessTier(p, i, t.condition, c))} />
                      {t.condition} (<DieIcon die={t.die} />)
                    </label>
                  ))}
                </fieldset>
              )}
              {rule.basis === 'challenge' && (
                <fieldset className="choice-list">
                  <legend>Its challenge</legend>
                  {rule.challenge.map((part, i) => (
                    <label key={part.text} className="checkbox">
                      <input type="checkbox" checked={(play.challengeParts ?? 0) > i} onChange={(e) => change((p, c) => setChallengeParts(p, e.target.checked ? i + 1 : i, c))} />
                      {part.text} ({part.successes} {part.successes === 1 ? 'success' : 'successes'})
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          ) : (
            <p className="sheet-empty">Choose an archetype first.</p>
          )}
        </Section>

        <Section title="This scene">
          <label className="checkbox">
            <input type="checkbox" checked={play.reactionUsed} onChange={(e) => change((p, c) => setReactionUsed(p, e.target.checked, c))} />
            Reaction used this round
          </label>
          <div className="button-row">
            <button type="button" className="button" disabled={Boolean(play.sceneAdvanced)} onClick={() => change((p, c) => advanceScene(p, c))}>
              {play.sceneAdvanced ? 'Scene advanced (once per scene)' : 'Advance the scene tracker'}
            </button>
            <button type="button" className="button" onClick={() => change((p, c) => newScene(p, c))}>
              New scene
            </button>
          </div>
          <p className="hint">Once per scene, a villain can use an Overcome to advance the scene tracker one space.</p>
        </Section>

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
          <ModForm onSubmit={(mod) => change((p, c) => addMod(p, mod, c))} />
        </Section>

        <Section title="Twists">
          <p className="hint">Villains take minor twists, never major ones (their major twist can only end the scene: captured or escaped).</p>
          {play.twists.length === 0 ? (
            <p className="sheet-empty">None.</p>
          ) : (
            <ul className="play-list">
              {play.twists.map((t) => (
                <li key={t.id}>
                  <span>{t.text}</span>
                  <button type="button" className="button" aria-label={`Clear the minor twist: ${t.text}`} onClick={() => change((p, c) => removeTwist(p, t.id, c))}>
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
              change((p, c) => addTwist(p, { kind: 'minor', text: twistText }, c))
              setTwistText('')
            }}
          >
            <label className="field" htmlFor={`${formId}-twist`}>
              <span>Minor twist</span>
              <input id={`${formId}-twist`} type="text" value={twistText} onChange={(e) => setTwistText(e.target.value)} />
            </label>
            <button type="submit" className="button" disabled={!twistText.trim()}>
              Add
            </button>
          </form>
        </Section>
      </div>

      <Section title="Abilities">
        <div className="button-row">
          <button type="button" className="button" disabled={out} onClick={() => setRolling({ kind: 'basic' })}>
            Basic action…
          </button>
        </div>
        <ul className="play-abilities">
          {[...sheet.abilities, ...(sheet.mastery ? [sheet.mastery] : [])].map((a, i) => {
            const usable = a.type !== 'I' || (a.use.pool !== undefined && a.use.effects.length > 0)
            const spent = a.type === 'R' && play.reactionUsed
            const blocked = out ? 'Defeated' : spent ? 'Reaction used this round' : undefined
            return (
              <li key={`${a.source}:${a.baseName}:${i}`} className="play-ability">
                <span className="play-ability__name">
                  {a.upgrade ? `${a.name} (${a.upgrade})` : a.name} <span className="choice__note">({ABILITY_TYPE_LABEL[a.type]})</span>{' '}
                  {a.effects.map((e) => (
                    <ActionIcon key={e} action={e} />
                  ))}
                </span>
                {usable && (
                  <button type="button" className="button" disabled={Boolean(blocked)} aria-label={`Use ${a.name}`} onClick={() => setRolling({ kind: 'ability', name: a.name, text: a.text, use: a.use, reaction: a.type === 'R' })}>
                    Use
                  </button>
                )}
                {usable && blocked && <span className="hint">{blocked}</span>}
                <p className="play-ability__text">{a.text}</p>
              </li>
            )
          })}
        </ul>
        {sheet.vehicle && (
          <>
            <h4>
              Vehicle {sheet.vehicle.die && <DieIcon die={sheet.vehicle.die} />}
            </h4>
            <p className="hint">The vehicle is a lieutenant and rolls its own die; its abilities are here for reference.</p>
            <ul className="play-abilities">
              {sheet.vehicle.abilities.map((a) => (
                <li key={a.baseName} className="play-ability">
                  <span className="play-ability__name">
                    {a.name} <span className="choice__note">({ABILITY_TYPE_LABEL[a.type]})</span>{' '}
                    {a.effects.map((e) => (
                      <ActionIcon key={e} action={e} />
                    ))}
                  </span>
                  <p className="play-ability__text">{a.text}</p>
                </li>
              ))}
            </ul>
          </>
        )}
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
                    {h.details.map((d, j) => (
                      <li key={j}>{d}</li>
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
          zone={zone === 'out' ? undefined : (zone ?? 'green')}
          mods={play.mods}
          statusLabel="Status"
          onClose={() => setRolling(null)}
          onConfirm={(record) =>
            change((p, c) => {
              const after = confirmRoll(p, record, c)
              return rolling.kind === 'ability' && rolling.reaction ? setReactionUsed(after, true, c) : after
            })
          }
          onAddMod={(mod) => change((p, c) => addMod(p, mod, c))}
          random={random}
        />
      )}

      <div className="button-row">
        {confirmReset ? (
          <span className="button-row" role="group" aria-label="Start over?">
            <span>Start over? Health is restored, and mods, twists, and counts are cleared.</span>
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                change((p, c) => resetVillain(p, c))
                setConfirmReset(false)
              }}
            >
              Yes, start over
            </button>
            <button type="button" className="button" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="button" onClick={() => setConfirmReset(true)}>
            Start over…
          </button>
        )}
      </div>
    </div>
  )
}
