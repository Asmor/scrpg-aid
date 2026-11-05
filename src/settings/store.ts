/** Where this device keeps its settings: one record in the database's settings store. */
import { IndexedDbRecords, MemoryRecords } from '../store/records'
import { parseSettings, settingsToSaved, type Settings } from './model'

const RECORD_ID = 'settings'

export interface SettingsStore {
  load(): Promise<Settings>
  save(settings: Settings): Promise<void>
}

export class MemorySettingsStore extends MemoryRecords implements SettingsStore {
  async load(): Promise<Settings> {
    return parseSettings((await this.getRecord(RECORD_ID))?.saved)
  }

  async save(settings: Settings): Promise<void> {
    await this.putRecord({ id: RECORD_ID, saved: settingsToSaved(settings) })
  }
}

class IndexedDbSettingsStore extends IndexedDbRecords implements SettingsStore {
  async load(): Promise<Settings> {
    return parseSettings((await this.getRecord(RECORD_ID))?.saved)
  }

  async save(settings: Settings): Promise<void> {
    await this.putRecord({ id: RECORD_ID, saved: settingsToSaved(settings) })
  }
}

export function createDefaultSettingsStore(): SettingsStore {
  return typeof indexedDB === 'undefined' ? new MemorySettingsStore() : new IndexedDbSettingsStore(indexedDB, 'settings')
}
