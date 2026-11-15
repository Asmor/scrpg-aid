/**
 * Catches a page that fails to load or render, so the app shows a way out instead of a blank
 * screen (review 2026-11-15, item 7). Pages load on demand, so an old tab still open after an
 * update can ask for code that's no longer there. Once it has failed, a new `resetKey` (the
 * address) tries again, so moving to another page works.
 */
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  resetKey: string
  /** Reloads the app: injectable for tests. */
  reload?: () => void
}

interface State {
  failed: boolean
  /** The `resetKey` last rendered with: a new one clears a failure. */
  key: string
}

export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { failed: false, key: props.resetKey }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key ? null : { failed: false, key: props.resetKey }
  }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    const reload = this.props.reload ?? (() => window.location.reload())
    return (
      <div className="app-loading" role="alert">
        <p>This page couldn't load.</p>
        <button type="button" className="button button--primary" onClick={reload}>
          Reload
        </button>
      </div>
    )
  }
}
