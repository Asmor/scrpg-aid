import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadFile } from './download'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('downloadFile', () => {
  it('clicks a hidden link to the file, then lets go of it', async () => {
    vi.useFakeTimers()
    const blobs: Blob[] = []
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:test'
    })
    URL.revokeObjectURL = vi.fn()
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
      expect(this.isConnected).toBe(true)
    })

    downloadFile('hero.json', '{"a":1}', 'application/json')
    expect(clicked).toHaveLength(1)
    expect(clicked[0]!.download).toBe('hero.json')
    expect(clicked[0]!.getAttribute('href')).toBe('blob:test')
    expect(clicked[0]!.isConnected).toBe(false)
    expect(blobs[0]!.type).toBe('application/json')
    expect(await blobs[0]!.text()).toBe('{"a":1}')
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})
