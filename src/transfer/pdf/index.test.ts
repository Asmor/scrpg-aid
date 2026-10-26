import { afterEach, describe, expect, it, vi } from 'vitest'
import { exampleHero } from '../../hero/example'
import { exportPdf } from './index'
import { heroPdf } from './render'

vi.mock('./render', () => ({ heroPdf: vi.fn(async () => new Uint8Array([1, 2, 3])) }))

afterEach(() => vi.unstubAllGlobals())

describe('exportPdf', () => {
  it('loads the three fonts and the die and action icons, then makes the PDF', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        return new Response(new Uint8Array([urls.length]))
      }),
    )
    const hero = exampleHero({ id: 'x' })
    expect(await exportPdf(hero, 'a4')).toEqual(new Uint8Array([1, 2, 3]))
    expect(urls).toHaveLength(3 + 11)
    expect(urls.filter((u) => u.includes('DejaVuSansCondensed'))).toHaveLength(3)
    expect(urls).toContain('/icons/die/d12.png')
    expect(urls).toContain('/icons/action/recover.png')
    const [, size, assets] = vi.mocked(heroPdf).mock.calls[0]!
    expect(size).toBe('a4')
    expect(assets.fonts.regular).toEqual(new Uint8Array([urls.indexOf(urls.find((u) => u.includes('DejaVuSansCondensed.'))!) + 1]))
    expect(assets.icons['die/d12']).toEqual(new Uint8Array([urls.indexOf('/icons/die/d12.png') + 1]))
  })

  it('says which file couldn’t be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(exportPdf(exampleHero({ id: 'x' }), 'letter')).rejects.toMatchObject({ name: 'DownloadError', message: expect.stringMatching(/couldn't load .* \(404\)/) })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(exportPdf(exampleHero({ id: 'x' }), 'letter')).rejects.toMatchObject({ name: 'DownloadError', message: expect.stringContaining('Failed to fetch') })
  })
})
