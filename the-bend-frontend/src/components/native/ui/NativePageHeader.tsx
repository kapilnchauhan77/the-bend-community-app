interface NativePageHeaderProps { title: string; context?: string; isAuthenticated?: boolean; onAccount?(): void; onNotifications?(): void }

export function NativePageHeader({ title, context = 'WESTMORELAND', isAuthenticated = false, onAccount, onNotifications }: NativePageHeaderProps) {
  return <header className="native-page-header"><div aria-label="The Bend Community" className="native-brand"><strong aria-hidden="true">B</strong><span>THE BEND<br /><small>COMMUNITY</small></span></div><div><span className="native-context">{context}</span><h1>{title}</h1></div><div className="native-header-actions">{isAuthenticated && onNotifications && <button type="button" className="native-control" aria-label="Notifications" onClick={onNotifications}>Notifications</button>}<button type="button" className="native-control" aria-label="Account" onClick={onAccount}>Account</button></div></header>
}
