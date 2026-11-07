/** Renaming and deleting a saved search (scrpg-aid-designs/library/spec.md, "Left rail"). */
import { useId, useState } from 'react'
import { Modal } from '../components/Modal'
import type { SavedSearch } from './saved-searches'

/** The rename dialog for a saved search, with an inline error for a bad or duplicate name. */
export function RenameDialog({ search, onRename, onClose }: { search: SavedSearch; onRename: (name: string) => Promise<string | undefined>; onClose: () => void }) {
  const [name, setName] = useState(search.name)
  const [error, setError] = useState<string | undefined>()
  const id = useId()
  const submit = async () => {
    const problem = await onRename(name)
    if (problem) setError(problem)
    else onClose()
  }
  return (
    <Modal title={`Rename ${search.name}`} onClose={onClose}>
      <form
        className="rename-search"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label htmlFor={id}>Name</label>
        <input id={id} type="text" value={name} maxLength={80} aria-invalid={error ? true : undefined} onChange={(e) => setName(e.target.value)} />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="button button--primary">
            Rename
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Confirms deleting a saved search. */
export function DeleteSearchDialog({ search, onDelete, onClose }: { search: SavedSearch; onDelete: () => void; onClose: () => void }) {
  return (
    <Modal title={`Delete the saved search ${search.name}?`} onClose={onClose}>
      <p>The items it finds aren't deleted.</p>
      <div className="button-row">
        <button
          type="button"
          className="button button--danger"
          onClick={() => {
            onClose()
            onDelete()
          }}
        >
          Yes, delete
        </button>
        <button type="button" className="button" onClick={onClose}>
          Keep
        </button>
      </div>
    </Modal>
  )
}
