interface NativePageHeaderProps { title: string; context?: string }

export function NativePageHeader({ title, context = 'WESTMORELAND' }: NativePageHeaderProps) {
  return <header className="native-page-header"><div aria-label="The Bend Community" className="native-brand"><strong aria-hidden="true">B</strong><span>THE BEND<br /><small>COMMUNITY</small></span></div><div><span className="native-context">{context}</span><h1>{title}</h1></div></header>
}
