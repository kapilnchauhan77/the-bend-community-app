export function UploadProgress({ value }: { value: number }) {
  const percent = Math.max(0, Math.min(100, value))
  return <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 w-full overflow-hidden rounded bg-white/20"><div className="h-full bg-white transition-[width]" style={{ width: `${percent}%` }} /></div>
}
