/** An element's text as it reads, with each image (a die icon, say) replaced by its alt text. */
export function readable(el: Element): string {
  const copy = el.cloneNode(true) as Element
  copy.querySelectorAll('img').forEach((img) => img.replaceWith(img.getAttribute('alt') ?? ''))
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}
