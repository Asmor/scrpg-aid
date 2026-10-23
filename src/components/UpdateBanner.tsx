interface UpdateBannerProps {
  onReload: () => void
  onDismiss: () => void
}

/** Tells the user a new version is ready. The app never reloads on its own, so edits aren't interrupted. */
export function UpdateBanner({ onReload, onDismiss }: UpdateBannerProps) {
  return (
    <div className="update-banner" role="status">
      <span>A new version is available.</span>
      <button type="button" onClick={onReload}>
        Reload
      </button>
      <button type="button" onClick={onDismiss}>
        Later
      </button>
    </div>
  )
}
