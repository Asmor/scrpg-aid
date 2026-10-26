/** Hands the user a file to save, from text or bytes made in the browser (works offline). */
export function downloadFile(name: string, content: string | Uint8Array<ArrayBuffer>, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  // Some browsers read the URL after click() returns, so let go of it a little later.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
