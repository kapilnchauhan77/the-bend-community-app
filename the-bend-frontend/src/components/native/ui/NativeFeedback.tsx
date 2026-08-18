interface NativeFeedbackProps { tone?: 'info' | 'success' | 'error'; children: React.ReactNode }

export function NativeSkeleton() { return <div role="status" aria-label="Loading" className="native-skeleton native-pulse" /> }

export function NativeFeedback({ tone = 'info', children }: NativeFeedbackProps) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`native-feedback ${tone}`}>{children}</div>
}
