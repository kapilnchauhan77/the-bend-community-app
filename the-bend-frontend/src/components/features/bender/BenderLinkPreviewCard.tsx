import { resolveAssetUrl } from '@/lib/constants';
import { isBendLinkPreviewImageUrl, isSafeHttpUrl } from '@/lib/benderLinks';
import type { BenderLinkPreview } from '@/types';

export function BenderLinkPreviewCard({ preview, mode = 'feed' }: { preview?: BenderLinkPreview | null; mode?: 'feed' | 'loading' | 'ready' | 'composer' }) {
  if (mode === 'loading') return <div data-testid="bender-link-preview-loading" className="h-24 rounded border animate-pulse" />;
  if (!preview || !isSafeHttpUrl(preview.url)) return null;
  const image = isBendLinkPreviewImageUrl(preview.image_url) ? resolveAssetUrl(preview.image_url) : undefined;
  const label = [preview.title, preview.site_name].filter(Boolean).join(' ');
  return <a data-testid="bender-link-preview" href={preview.url} target="_blank" rel="noopener noreferrer" aria-label={label} className="block min-w-0 overflow-hidden rounded border border-[hsl(35,18%,88%)] bg-[hsl(40,20%,98%)] break-words [overflow-wrap:anywhere]">
    {image && <div className="w-full aspect-[1.91] overflow-hidden bg-black"><img src={image} alt="" className="w-full h-full object-cover" /></div>}
    <div className="min-w-0 p-3">
      <p className="font-semibold break-words [overflow-wrap:anywhere]">{preview.title}</p>
      {preview.description && <p className="mt-1 text-sm text-[hsl(30,10%,35%)] break-words [overflow-wrap:anywhere]">{preview.description}</p>}
      {preview.site_name && <p className="mt-2 text-xs text-[hsl(30,10%,55%)] break-words [overflow-wrap:anywhere]">{preview.site_name}</p>}
    </div>
  </a>;
}
