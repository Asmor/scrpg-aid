/**
 * What everyone at the table sees in a game session (Phase 4): the party (each hero's Health,
 * zone, mods, and twists, and whether their player is connected) and the shared feed.
 */
import type { ReactNode } from 'react'
import { formatFull, formatWhen } from '../play/time'
import { PLAY_ZONE_LABEL } from '../hero/labels'
import { describeMod } from '../play/state'
import { memberName } from './gm'
import { DiceText, DieIcon } from '../components/icons'
import type { FeedEntry, Member, SceneVillain } from './types'

/** The party, one card per player; `actions` adds controls to a member's card (the GM's). */
export function Party({ members, me, actions }: { members: readonly Member[]; me?: string; actions?: (member: Member) => ReactNode }) {
  if (!members.length) return <p className="sheet-empty">No players yet.</p>
  return (
    <ul className="party">
      {members.map((m) => {
        const hero = m.hero
        return (
          <li key={m.clientId} className={`party-member zone-${hero?.zone ?? 'green'}`} aria-label={memberName(m)}>
            <div className="party-member__top">
              <strong>{memberName(m)}</strong>
              {m.clientId === me && <span className="choice__note"> (you)</span>}
              <span className={m.connected ? 'party-status party-status--on' : 'party-status'}>{m.connected ? 'Connected' : 'Away'}</span>
            </div>
            {hero && (
              <>
                <p className="party-member__health">
                  {hero.health !== undefined && hero.maxHealth !== undefined ? `${hero.health} / ${hero.maxHealth}` : 'Health not set'}
                  {hero.zone && <> · {PLAY_ZONE_LABEL[hero.zone]}</>}
                </p>
                {hero.mods.length > 0 && (
                  <ul className="party-member__list" aria-label="Bonuses and penalties">
                    {hero.mods.map((mod) => (
                      <li key={mod.id}>{describeMod(mod)}</li>
                    ))}
                  </ul>
                )}
                {hero.twists.length > 0 && (
                  <ul className="party-member__list" aria-label="Twists">
                    {hero.twists.map((t) => (
                      <li key={t.id}>
                        {t.kind === 'minor' ? 'Minor' : 'Major'} twist: {t.text}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {actions?.(m)}
          </li>
        )
      })}
    </ul>
  )
}

/** The villains in the game (Phase 5), as everyone sees them; `actions` adds the GM's controls. */
export function Villains({ villains, actions }: { villains: readonly SceneVillain[]; actions?: (villain: SceneVillain) => ReactNode }) {
  if (!villains.length) return null
  return (
    <ul className="party">
      {villains.map((v) => (
        <li key={v.id} className={`party-member zone-${v.zone === 'out' ? 'out' : (v.zone ?? 'green')}`} aria-label={v.name}>
          <div className="party-member__top">
            <strong>{v.name}</strong>
            {v.statusDie && (
              <span className="party-status">
                Status <DieIcon die={v.statusDie} />
              </span>
            )}
          </div>
          <p className="party-member__health">
            {v.health !== undefined && v.maxHealth !== undefined ? `${v.health} / ${v.maxHealth}` : 'Health not set'}
            {v.zone && <> · {v.zone === 'out' ? 'Defeated' : PLAY_ZONE_LABEL[v.zone]}</>}
          </p>
          {v.mods.length > 0 && (
            <ul className="party-member__list" aria-label="Bonuses and penalties">
              {v.mods.map((mod) => (
                <li key={mod.id}>{describeMod(mod)}</li>
              ))}
            </ul>
          )}
          {v.twists.length > 0 && (
            <ul className="party-member__list" aria-label="Twists">
              {v.twists.map((t) => (
                <li key={t.id}>
                  {t.kind === 'minor' ? 'Minor' : 'Major'} twist: {t.text}
                </li>
              ))}
            </ul>
          )}
          {actions?.(v)}
        </li>
      ))}
    </ul>
  )
}

/** The shared feed, newest first. */
export function Feed({ entries, now }: { entries: readonly FeedEntry[]; now: Date }) {
  if (!entries.length) return <p className="sheet-empty">Nothing yet.</p>
  return (
    <ol className="play-history" reversed>
      {[...entries].reverse().map((e) => (
        <li key={e.id}>
          <time dateTime={e.at} title={formatFull(e.at)}>
            {formatWhen(e.at, now)}
          </time>{' '}
          <strong>{e.by}:</strong> <DiceText text={e.text} />
          {e.details && (
            <ul>
              {e.details.map((d, i) => (
                <li key={i}>
                  <DiceText text={d} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  )
}
