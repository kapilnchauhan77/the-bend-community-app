import { useMemo, useState } from 'react';
import { removeFirstExactUrl, tokenizeBenderCaption } from '@/lib/benderLinks';

export function BenderCaption({ caption, sourceUrl }: { caption: string; sourceUrl?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const visible = useMemo(() => sourceUrl ? removeFirstExactUrl(caption, sourceUrl) : caption, [caption, sourceUrl]);
  const tokens = useMemo(() => tokenizeBenderCaption(visible), [visible]);
  if (!visible.trim()) return null;
  const long = visible.length > 140;
  return <div className="min-w-0 break-words [overflow-wrap:anywhere]">
    <span className={!expanded && long ? 'line-clamp-2' : 'whitespace-pre-wrap'}>
      {tokens.map((token, index) => token.type === 'text' ? <span key={index}>{token.value}</span> : <a key={index} href={token.value} target="_blank" rel="noopener noreferrer" className="underline break-all">{token.value.replace(/^https?:\/\//i, '')}</a>)}
    </span>
    {long && !expanded && <button type="button" onClick={() => setExpanded(true)} className="ml-1 text-[hsl(30,10%,55%)] hover:underline">more</button>}
  </div>;
}
