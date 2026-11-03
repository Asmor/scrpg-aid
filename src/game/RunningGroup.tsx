/**
 * Running a group in the GM screen (docs/design/npcs/spec.md, section 4, and
 * group-rolling.dc.html): who has acted, the Action select and Roll all ready, and a row per
 * member with its die, mods, Acted or Ready, Roll and ⋯. Rolling opens the group roll dialog,
 * where targets are picked after the dice are rolled.
 */
import { useId, useRef, useState } from 'react'
import { DieIcon } from '../components/icons'
import { Modal } from '../components/Modal'
import { useMediaQuery } from '../components/useMediaQuery'
import { PopoverMenu } from '../library/Popover'
import { usePopover } from '../library/popover-state'
import type { PlayMod } from '../hero/model'
import { ModForm } from '../play/ModForm'
import { describeMod, modName } from '../play/state'
import type { BasicAction } from '../rules/types'
import type { Game, NpcGroup, NpcMember } from './model'
import { ACTION_NAME, actionsText, groupActionList, npcTargets, parseNpcTarget, rollMath, rollMembers, rollSaves, verdictText, type GroupRollRow, type MemberSave, type Random } from './npc'
import { actedText, memberLabel, memberName, readyMembers } from './table'

export interface GroupActions {
  shrink: (memberId: string) => void
  remove: (memberId: string) => void
  addMod: (memberId: string, mod: Omit<PlayMod, 'id'>) => void
  removeMod: (memberId: string, modId: string) => void
  setActed: (memberId: string, acted: boolean) => void
  /** Applies a group roll: each row's result to its target, and the rolled members marked acted. */
  applyRoll: (action: BasicAction, rows: GroupRollRow[]) => void
  /** Applies saves the Damage dialog rolled. */
  applySaves: (saves: MemberSave[]) => void
}

/** The choice for a result that goes to nobody. */
const NO_TARGET = 'none'

const KIND_LABEL = { minions: 'Minions', lieutenants: 'Lieutenants' } as const

const modText = (m: PlayMod) => `${m.value > 0 ? `+${m.value}` : `−${-m.value}`} ${modName(m)}`

function MemberMenu({ group, member, actions, onMod }: { group: NpcGroup; member: NpcMember; actions: GroupActions; onMod: () => void }) {
  const [popover, bindPopover] = usePopover()
  const name = memberName(group, member.n)
  const label = `More actions for ${name}`
  return (
    <span className="popover-anchor">
      <button ref={bindPopover} type="button" className="icon-button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={popover.open} onClick={popover.toggle}>
        ⋯
      </button>
      {popover.open && (
        <PopoverMenu
          popover={popover}
          label={label}
          className="popover--end"
          items={[
            { label: '+ Mod', onSelect: onMod },
            ...(member.die !== 'd4' ? [{ label: 'Shrink', onSelect: () => actions.shrink(member.id) }] : []),
            { label: 'Remove', danger: true, onSelect: () => actions.remove(member.id) },
            member.acted ? { label: 'Mark as not acted', onSelect: () => actions.setActed(member.id, false) } : { label: 'Mark as acted', onSelect: () => actions.setActed(member.id, true) },
          ]}
        />
      )}
    </span>
  )
}

export function RunningGroup({ game, group, actions, random }: { game: Game; group: NpcGroup; actions: GroupActions; random?: Random }) {
  const id = useId()
  const choices = groupActionList(group)
  const [action, setAction] = useState<BasicAction>(choices[0] ?? 'attack')
  const chosen = choices.includes(action) ? action : (choices[0] ?? 'attack')
  const [modding, setModding] = useState<string | null>(null)
  const [rolled, setRolled] = useState<GroupRollRow[] | null>(null)
  // The Damage dialog: the members it starts with checked (one member's Damage, or everyone).
  const [damaging, setDamaging] = useState<string[] | null>(null)
  const ready = readyMembers(group)
  const everyone = ready.length === 0 && group.members.length > 0
  const roll = (memberIds: string[]) => setRolled(rollMembers(group, memberIds, random ?? Math.random))
  return (
    <div className="gt-group-run">
      <p className="gt-sub">
        {KIND_LABEL[group.kind]} · {actionsText(group)}
      </p>
      <p className="gt-row">
        <strong>{actedText(group)}</strong>
        {everyone && <span className="gt-sub">Everyone has acted. Hand off when ready.</span>}
      </p>
      <div className="gt-row gt-group-bar">
        <label className="gt-row" htmlFor={`${id}-action`}>
          <span className="gt-sub">Action</span>
          <select id={`${id}-action`} value={chosen} onChange={(e) => setAction(e.target.value as BasicAction)}>
            {choices.map((a) => (
              <option key={a} value={a}>
                {ACTION_NAME[a]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="button button--small" onClick={() => setDamaging(group.members.map((m) => m.id))}>
          Damage…
        </button>
        <span className="gt-grow" />
        <button type="button" className="button button--primary button--small" disabled={ready.length === 0} onClick={() => roll(ready.map((m) => m.id))}>
          {ready.length === 0 ? 'All have acted' : `Roll all ready (${ready.length})`}
        </button>
      </div>
      <ul className="gt-members gt-members--running" aria-label={`Members of ${group.name}`}>
        {group.members.map((m) => {
          const name = memberName(group, m.n)
          return (
            <li key={m.id} className={m.acted ? 'gt-member--acted' : undefined}>
              <div className="gt-row">
                <DieIcon die={m.die} />
                <strong>{memberLabel(group, m.n)}</strong>
                <span className="gt-grow" />
                <span className={m.acted ? 'gt-pill' : 'gt-pill gt-pill--live'}>{m.acted ? 'Acted' : 'Ready'}</span>
                <button type="button" className="button button--small" aria-label={`Roll ${name}`} disabled={m.acted} onClick={() => roll([m.id])}>
                  Roll
                </button>
                <button type="button" className="button button--small" aria-label={`Damage ${name}`} onClick={() => setDamaging([m.id])}>
                  Damage
                </button>
                <MemberMenu group={group} member={m} actions={actions} onMod={() => setModding(m.id)} />
              </div>
              {m.mods.length > 0 && (
                <ul className="gt-chips" aria-label={`${name}'s mods`}>
                  {m.mods.map((x) => (
                    <li key={x.id} className="gt-mod">
                      {modText(x)}
                      <button type="button" className="gt-chip-x" aria-label={`Remove ${describeMod(x)} from ${name}`} onClick={() => actions.removeMod(m.id, x.id)}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {modding === m.id && <ModForm onSubmit={(mod) => (actions.addMod(m.id, mod), setModding(null))} />}
            </li>
          )
        })}
      </ul>
      {damaging && (
        <DamageDialog
          group={group}
          start={damaging}
          random={random ?? Math.random}
          onCancel={() => setDamaging(null)}
          onApply={(saves) => {
            actions.applySaves(saves)
            setDamaging(null)
          }}
        />
      )}
      {rolled && (
        <GroupRollDialog
          game={game}
          group={group}
          action={chosen}
          rows={rolled}
          onCancel={() => setRolled(null)}
          onApply={(rows) => {
            actions.applyRoll(chosen, rows)
            setRolled(null)
          }}
        />
      )}
    </div>
  )
}

/** The group roll dialog: results first, then a target for each (section 4). */
export function GroupRollDialog({ game, group, action, rows, onCancel, onApply }: { game: Game; group: NpcGroup; action: BasicAction; rows: GroupRollRow[]; onCancel: () => void; onApply: (rows: GroupRollRow[]) => void }) {
  const id = useId()
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [all, setAll] = useState('')
  const options = npcTargets(game, action)
  const hasTargets = action !== 'overcome'
  const first = useRef<HTMLSelectElement>(null)
  // A full-screen sheet on phones (section 7).
  const phone = useMediaQuery('(max-width: 759px)', false)
  const member = (memberId: string) => group.members.find((m) => m.id === memberId)
  const name = (memberId: string) => {
    const m = member(memberId)
    return m ? memberName(group, m.n) : 'A member'
  }
  const title = rows.length === 1 ? `${name(rows[0]!.memberId)} rolls ${ACTION_NAME[action]}` : `${rows.length} ${group.name} roll ${ACTION_NAME[action]}`
  const verb = { attack: 'deals each result as damage to its target', hinder: 'gives each target a penalty sized by its result', boost: 'gives each target a bonus sized by its result', defend: 'records each Defend for its target', overcome: 'logs each result' }[action]
  return (
    <Modal title={title} variant={phone ? 'sheet' : 'dialog'} onClose={onCancel} {...(hasTargets ? { initialFocus: first } : {})}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onApply(
            rows.map((r) => {
              const target = parseNpcTarget(targets[r.memberId] ?? '')
              return { ...r, ...(target ? { target } : {}) }
            }),
          )
        }}
      >
        <p role="status" className="visually-hidden">
          {rows.map((r) => `${name(r.memberId)}: ${r.roll.total}.`).join(' ')}
        </p>
        {hasTargets && (
          <div className="gt-row">
            <span className="gt-sub gt-grow">Now choose targets.</span>
            <label className="gt-row" htmlFor={`${id}-all`}>
              <span className="gt-sub">Same target for all</span>
              <select
                id={`${id}-all`}
                ref={first}
                value={all}
                onChange={(e) => {
                  setAll(e.target.value)
                  setTargets(Object.fromEntries(rows.map((r) => [r.memberId, e.target.value])))
                }}
              >
                <option value="">Choose…</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
                <option value={NO_TARGET}>No target</option>
              </select>
            </label>
          </div>
        )}
        <table className="gt-results">
          <thead>
            <tr>
              <th scope="col">Who</th>
              <th scope="col">Die</th>
              <th scope="col">Result</th>
              {hasTargets && <th scope="col">Target</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const m = member(r.memberId)
              const who = name(r.memberId)
              return (
                <tr key={r.memberId}>
                  <th scope="row">{who}</th>
                  <td data-label="Die">{m && <DieIcon die={m.die} />}</td>
                  <td data-label="Result">
                    <span className="gt-total">{r.roll.total}</span> <span className="gt-sub">{rollMath(r.roll)}</span>
                  </td>
                  {hasTargets && (
                    <td data-label="Target">
                      <select aria-label={`Target for ${who}`} value={targets[r.memberId] ?? ''} onChange={(e) => setTargets((t) => ({ ...t, [r.memberId]: e.target.value }))}>
                        <option value="">Choose…</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                        <option value={NO_TARGET}>No target</option>
                      </select>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="hint">
          Applying {verb}, logs every one, and marks {rows.length === 1 ? 'it' : 'these'} as acted. You can change each target until you apply.
        </p>
        <div className="button-row gt-dialog-actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button button--primary">
            Apply
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Damage (section 5): how much each member takes and who takes it, then Roll saves; the results
 * table shows each save against the damage and what it does. Apply changes the dice and removes
 * anyone KO'd; Cancel discards the rolls.
 */
export function DamageDialog({ group, start, random, onCancel, onApply }: { group: NpcGroup; start: readonly string[]; random: Random; onCancel: () => void; onApply: (saves: MemberSave[]) => void }) {
  const id = useId()
  const phone = useMediaQuery('(max-width: 759px)', false)
  const [damage, setDamage] = useState('')
  const [who, setWho] = useState<string[]>([...start])
  const [saves, setSaves] = useState<MemberSave[] | null>(null)
  const amount = Number(damage)
  const valid = damage.trim() !== '' && Number.isInteger(amount) && amount >= 0 && who.length > 0
  const member = (memberId: string) => group.members.find((m) => m.id === memberId)
  const single = start.length === 1 ? member(start[0]!) : undefined
  const title = single ? `Damage to ${memberName(group, single.n)}` : `Damage to ${group.name}`
  const summary = (s: MemberSave) => {
    const m = member(s.memberId)
    return m ? `${memberName(group, m.n)}: ${verdictText(group.kind, m.die, s.result, Boolean(s.roll && s.roll.total >= s.damage))}.` : ''
  }
  return (
    <Modal title={title} variant={phone ? 'sheet' : 'dialog'} onClose={onCancel}>
      {!saves ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) setSaves(rollSaves(group, group.members.filter((m) => who.includes(m.id)).map((m) => m.id), amount, random))
          }}
        >
          <label className="field" htmlFor={`${id}-damage`}>
            <span>Damage to each</span>
            <input id={`${id}-damage`} type="number" inputMode="numeric" min={0} value={damage} onChange={(e) => setDamage(e.target.value)} />
          </label>
          {!single && (
            <fieldset className="gt-keep">
              <legend className="gt-label">Who takes it</legend>
              {group.members.map((m) => (
                <label key={m.id} className="gt-row" htmlFor={`${id}-${m.id}`}>
                  <input id={`${id}-${m.id}`} type="checkbox" checked={who.includes(m.id)} onChange={(e) => setWho((w) => (e.target.checked ? [...w, m.id] : w.filter((x) => x !== m.id)))} />
                  <DieIcon die={m.die} />
                  {memberName(group, m.n)}
                  {m.mods.map((x) => (
                    <span key={x.id} className="gt-mod">
                      {modText(x)}
                    </span>
                  ))}
                </label>
              ))}
            </fieldset>
          )}
          <div className="button-row gt-dialog-actions">
            <button type="button" className="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="button button--primary" disabled={!valid}>
              Roll saves
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onApply(saves)
          }}
        >
          <p role="status" className="visually-hidden">
            {saves.map(summary).join(' ')}
          </p>
          <table className="gt-results">
            <thead>
              <tr>
                <th scope="col">Who</th>
                <th scope="col">Die</th>
                <th scope="col">Save</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {saves.map((s) => {
                const m = member(s.memberId)
                if (!m) return null
                const saved = Boolean(s.roll && s.roll.total >= s.damage)
                return (
                  <tr key={s.memberId}>
                    <th scope="row">{memberName(group, m.n)}</th>
                    <td data-label="Die">
                      <DieIcon die={m.die} />
                    </td>
                    <td data-label="Save">
                      {s.roll ? (
                        <>
                          <span className="gt-total">{s.roll.total}</span> <span className="gt-sub">{rollMath(s.roll)} against {s.damage}</span>
                        </>
                      ) : (
                        <span className="gt-sub">No save</span>
                      )}
                    </td>
                    <td data-label="Outcome">{verdictText(group.kind, m.die, s.result, saved)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="button-row gt-dialog-actions">
            <button type="button" className="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="button button--primary">
              Apply
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
