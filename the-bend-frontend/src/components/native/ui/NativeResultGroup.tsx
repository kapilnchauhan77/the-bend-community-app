import type { ReactNode } from 'react'

export interface NativeResultGroupProps { heading: string; status: 'loading' | 'success' | 'empty' | 'error'; count?: number; onRetry(): void; onSeeAll?(): void; children: ReactNode }

export function NativeResultGroup({ heading, status, count, onRetry, onSeeAll, children }: NativeResultGroupProps) {
  return <section className="native-result-group"><div className="native-section-header"><h2>{heading}{typeof count === 'number' && <small> ({count})</small>}</h2>{onSeeAll && <button type="button" className="native-control" onClick={onSeeAll}>See all</button>}</div>{status === 'loading' && <p role="status">Loading…</p>}{status === 'empty' && <p>No results found.</p>}{status === 'error' && <><p role="alert">Something went wrong.</p><button type="button" className="native-control" onClick={onRetry}>Retry</button></>}{status === 'success' && children}</section>
}
