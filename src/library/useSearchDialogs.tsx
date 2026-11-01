/** The saved searches' dialogs as state, for the rail and the phone's view sheet. */
import { useState } from 'react'
import type { LibraryModel } from './LibraryPage'
import type { SavedSearch } from './saved-searches'
import { DeleteSearchDialog, RenameDialog } from './SearchDialogs'

/** The saved searches' rename and delete dialogs, shared by the rail and the phone's view sheet. */
export function useSearchDialogs(model: LibraryModel) {
  const [renaming, setRenaming] = useState<SavedSearch | null>(null)
  const [deleting, setDeleting] = useState<SavedSearch | null>(null)
  const dialogs = (
    <>
      {renaming && <RenameDialog search={renaming} onRename={(name) => model.renameSearch(renaming, name)} onClose={() => setRenaming(null)} />}
      {deleting && <DeleteSearchDialog search={deleting} onDelete={() => model.deleteSearch(deleting)} onClose={() => setDeleting(null)} />}
    </>
  )
  return { dialogs, rename: setRenaming, remove: setDeleting }
}
