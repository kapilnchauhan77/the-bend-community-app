interface NativeFeedbackProps { tone?: 'info' | 'success' | 'error'; children: React.ReactNode }

export function NativeFeedback({ tone = 'info', children }: NativeFeedbackProps) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`native-feedback ${tone}`}>{children}</div>
}
