/**
 * Downloading the files an export needs (icons, fonts). A failure is a DownloadError, which
 * the export menu tells apart by `name` (offline, or files gone after an app update).
 */
export class DownloadError extends Error {
  override name = 'DownloadError'
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (e) {
    throw new DownloadError(`couldn't load ${url} (${e instanceof Error ? e.message : String(e)})`)
  }
  if (!response.ok) throw new DownloadError(`couldn't load ${url} (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}
