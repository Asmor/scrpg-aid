import { describe, expect, it } from 'vitest'
import { parseTopic } from './markdown'
import { highlight, searchHelp } from './search'

const topics = [
  parseTopic('running-a-game', '# Running a game\n\nFor the GM: scenes and issues.\n\n## Scenes\n\nPlan ahead.\n\n## Issues\n\nFinishing ends the current scene and pauses the table.'),
  parseTopic('glossary', '# Glossary\n\nWords.\n\n## Set aside\n\nOpposition moved off the table at the end of a scene, kept for later.'),
]

const text = (parts: { text: string; match: boolean }[]) => parts.map((p) => (p.match ? `[${p.text}]` : p.text)).join('')

describe('help search', () => {
  it('finds headings and glossary terms before text, in topic order', () => {
    const results = searchHelp('scene', topics)
    expect(results.map((r) => [r.title, r.where])).toEqual([
      ['Scenes', 'Running a game'],
      ['Issues', 'Running a game'],
      ['Set aside', 'Glossary'],
    ])
    expect(results[0]).toMatchObject({ topicId: 'running-a-game', sectionId: 'scenes' })
    expect(text(results[1]!.snippet)).toBe('Finishing ends the current [scene] and pauses the table.')
  })

  it('finds topic titles, with the intro as the snippet', () => {
    const [first] = searchHelp('  GLOSSARY ', topics)
    expect(first).toEqual({ topicId: 'glossary', title: 'Glossary', where: 'Help', snippet: [{ text: 'Words.', match: false }] })
  })

  it('finds nothing for an empty query or no match', () => {
    expect(searchHelp('', topics)).toEqual([])
    expect(searchHelp('   ', topics)).toEqual([])
    expect(searchHelp('zzz', topics)).toEqual([])
  })

  it('marks every match, ignoring case', () => {
    expect(text(highlight('Scenes and a scene', 'SCENE'))).toBe('[Scene]s and a [scene]')
    expect(highlight('plain', '')).toEqual([{ text: 'plain', match: false }])
  })

  it('cuts long text around the first match', () => {
    const long = parseTopic('t', `# T\n\nIntro.\n\n## Part\n\n${'word '.repeat(40)}needle ${'more '.repeat(40)}`)
    const snippet = text(searchHelp('needle', [long])[0]!.snippet)
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
    expect(snippet).toContain('[needle]')
    expect(snippet.length).toBeLessThan(160)
  })

  it('searches the real topics', () => {
    expect(searchHelp('status die').map((r) => r.title)).toContain('Status die')
  })
})
