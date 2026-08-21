import { useMemo, useState } from 'react';
import { removeFirstExactUrl, tokenizeBenderCaption } from '@/lib/benderLinks';

export interface BenderCaptionProps {
  caption: string | null;
  authorName: string;
  omittedSourceUrl?: string | null;
}

export function BenderCaption({ caption, authorName, omittedSourceUrl }: BenderCaptionProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleCaption = useMemo(
    () => (caption && omittedSourceUrl ? removeFirstExactUrl(caption, omittedSourceUrl) : caption ?? ''),
    [caption, omittedSourceUrl],
  );
  const tokens = useMemo(() => tokenizeBenderCaption(visibleCaption), [visibleCaption]);

  if (!visibleCaption.trim()) return null;
  const isLong = visibleCaption.length > 140;

  return (
    <div data-testid="bender-caption" className="min-w-0 px-3 pt-1 pb-1 text-[13px] leading-snug break-words [overflow-wrap:anywhere]">
      <span className="font-semibold text-[hsl(30,15%,18%)] mr-1">{authorName}</span>
      <span className={`whitespace-pre-wrap ${!expanded && isLong ? 'line-clamp-2' : ''}`}>
        {tokens.map((token, index) =>
          token.type === 'text' ? (
            <span key={index}>{token.text}</span>
          ) : (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline break-all"
            >
              {token.text}
            </a>
          ),
        )}
      </span>
      {isLong && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="ml-1 text-[hsl(30,10%,55%)] hover:underline"
        >
          more
        </button>
      )}
    </div>
  );
}
