/** The Keyboard shortcuts dialog (scrpg-aid-designs/help/spec.md, section 5), built from ./shortcuts.ts. */
import { Fragment, useId } from 'react'
import { Modal } from '../components/Modal'
import { SHORTCUT_GROUPS, SHORTCUTS, type Shortcut } from './shortcuts'

function Keys({ shortcut }: { shortcut: Shortcut }) {
  const caps = shortcut.keys.map((k, i) => (
    <Fragment key={k}>
      {i > 0 && (shortcut.range ? '–' : ' ')}
      <kbd>{k}</kbd>
    </Fragment>
  ))
  if (!shortcut.spoken) return <>{caps}</>
  return (
    <>
      <span aria-hidden="true">{caps}</span>
      <span className="visually-hidden">{shortcut.spoken}</span>
    </>
  )
}

function Group({ name, list }: { name: string; list: readonly Shortcut[] }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="shortcuts__group">
      <h3 id={id}>{name}</h3>
      <dl>
        {list.map((s) => (
          <Fragment key={`${s.keys.join(' ')}:${s.action}`}>
            <dt>
              <Keys shortcut={s} />
            </dt>
            <dd>{s.action}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  )
}

export function ShortcutsDialog({ onClose, shortcuts = SHORTCUTS }: { onClose: () => void; shortcuts?: readonly Shortcut[] }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="shortcuts">
        {SHORTCUT_GROUPS.map((group) => {
          const list = shortcuts.filter((s) => s.group === group)
          return list.length ? <Group key={group} name={group} list={list} /> : null
        })}
      </div>
      <p className="muted shortcuts__note">Shortcuts never fire while you're typing in a field. This list is built from the app's shortcut table, so it stays current.</p>
    </Modal>
  )
}
