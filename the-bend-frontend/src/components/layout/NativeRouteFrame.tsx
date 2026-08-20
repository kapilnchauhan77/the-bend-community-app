import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export interface NativeBackButtonProps {
  fallbackPath: string
  label?: string
}

export function NativeBackButton({ fallbackPath, label = 'Back' }: NativeBackButtonProps): React.ReactElement {
  const navigate = useNavigate()
  const onBack = () => {
    const canGoBack = typeof window.history.state?.idx === 'number' && window.history.state.idx > 0
    if (canGoBack) navigate(-1)
    else navigate(fallbackPath, { replace: true })
  }
  return <button type="button" aria-label={label} onClick={onBack} className="native-route-back" style={{ minWidth: 44, minHeight: 44 }}><ArrowLeft aria-hidden="true" size={20} /></button>
}

export interface NativeRouteFrameProps {
  title: string
  fallbackPath: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function NativeRouteFrame({ title, fallbackPath, actions, children }: NativeRouteFrameProps): React.ReactElement {
  return <div className="native-route-frame"><header className="native-route-header"><NativeBackButton fallbackPath={fallbackPath} /><span data-testid="native-route-title">{title}</span><div className="native-route-actions">{actions}</div></header>{children}</div>
}
