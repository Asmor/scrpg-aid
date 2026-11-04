/** The app's version and build date, for the About dialog (docs/design/library/spec.md, 8a). */

export const appVersion: string = __APP_VERSION__
export const buildTime: string = __BUILD_TIME__

/** "Nov 4, 2026", in the user's time zone; empty if the time can't be read. */
export function formatBuildDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Version 0.9.3 · built Nov 4, 2026" (just the version if the date can't be read). */
export function versionLine(version: string, iso: string): string {
  const date = formatBuildDate(iso)
  return date ? `Version ${version} · built ${date}` : `Version ${version}`
}
