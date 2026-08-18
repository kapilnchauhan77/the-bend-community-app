import { Search, X } from 'lucide-react'

export interface NativeSearchBarProps { value: string; label: string; placeholder: string; onChange(value: string): void; onSubmit(): void; onClear(): void }

export function NativeSearchBar({ value, label, placeholder, onChange, onSubmit, onClear }: NativeSearchBarProps) {
  return <form role="search" onSubmit={(event) => { event.preventDefault(); onSubmit() }} className="native-search-bar"><Search aria-hidden="true" size={20} /><input className="native-control" type="search" aria-label={label} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />{value && <button className="native-control" type="button" aria-label="Clear search" onClick={onClear}><X size={18} /></button>}</form>
}
