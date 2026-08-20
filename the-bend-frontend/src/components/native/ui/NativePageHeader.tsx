import { Bell, Send } from 'lucide-react'

interface NativePageHeaderProps { title: string; context?: string; isAuthenticated?: boolean; onNotifications?(): void; onMessages?(): void }

export function NativePageHeader({ title, context = 'WESTMORELAND', isAuthenticated = false, onNotifications, onMessages }: NativePageHeaderProps) {
  return <header className="native-page-header native-safe-area"><div className="native-header-top"><div aria-label="The Bend Community" className="native-brand"><strong aria-hidden="true">B</strong><span><b>The Bend</b><small>{context}</small></span></div><div className="native-header-actions">{isAuthenticated && onNotifications && <button type="button" className="native-control native-header-icon" aria-label="Notifications" onClick={onNotifications}><Bell size={20} aria-hidden="true" /></button>}{isAuthenticated && onMessages && <button type="button" className="native-control native-header-icon" aria-label="Messages" onClick={onMessages}><Send size={20} aria-hidden="true" /></button>}</div></div><div className="native-header-title"><span className="native-eyebrow">Around Westmoreland</span><h1>{title}</h1></div></header>
}
