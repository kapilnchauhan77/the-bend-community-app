export interface NativeViewModeSwitchProps { value: 'list' | 'map'; onChange(value: 'list' | 'map'): void }

export function NativeViewModeSwitch({ value, onChange }: NativeViewModeSwitchProps) {
  return <div className="native-view-mode-switch" role="group" aria-label="Explore view">
    <button className="native-control" type="button" aria-pressed={value === 'list'} onClick={() => onChange('list')}>List</button>
    <button className="native-control" type="button" aria-pressed={value === 'map'} onClick={() => onChange('map')}>Map</button>
  </div>
}

export default NativeViewModeSwitch
