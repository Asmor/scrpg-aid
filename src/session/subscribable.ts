/** A value that changes over time, for React's useSyncExternalStore: a snapshot, and who to tell when it changes. */
type Listener = () => void

export class Subscribable<T> {
  private listeners = new Set<Listener>()
  protected snapshot: T
  constructor(snapshot: T) {
    this.snapshot = snapshot
  }
  /** For useSyncExternalStore. */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getSnapshot = (): T => this.snapshot
  protected publish(snapshot: T): void {
    this.snapshot = snapshot
    for (const l of this.listeners) l()
  }
}
