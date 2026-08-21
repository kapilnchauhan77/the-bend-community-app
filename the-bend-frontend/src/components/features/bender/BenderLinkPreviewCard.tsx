import { resolveAssetUrl } from '@/lib/constants';
import { isBendLinkPreviewImageUrl, isSafeHttpUrl } from '@/lib/benderLinks';
import type { BenderLinkPreview } from '@/types';

export type BenderLinkPreviewCardProps =
  | {
      mode: 'composer';
      state: 'loading';
      preview?: never;
      onRemove?: never;
    }
  | {
      mode: 'composer';
      state: 'ready';
      preview: BenderLinkPreview;
      onRemove: () => void;
    }
  | {
      mode: 'feed';
      state: 'ready';
      preview: BenderLinkPreview;
      onRemove?: never;
    };

const benderLinkPreviewTypeProbe = () => {
  type LoadingCard = Extract<BenderLinkPreviewCardProps, { mode: 'composer'; state: 'loading' }>;
  type FeedCard = Extract<BenderLinkPreviewCardProps, { mode: 'feed'; state: 'ready' }>;
  const _loadingPreviewKey: 'preview' extends keyof LoadingCard ? true : never = true;
  const _feedRemoveKey: 'onRemove' extends keyof FeedCard ? true : never = true;
  const probePreview = {} as BenderLinkPreview;
  const probeRemove = () => undefined;
  const invalidLoading = { mode: 'composer' as const, state: 'loading' as const, preview: probePreview };
  const invalidFeed = { mode: 'feed' as const, state: 'ready' as const, preview: probePreview, onRemove: probeRemove };
  // @ts-expect-error composer/loading must reject spread preview props
  const _loadingProbe: BenderLinkPreviewCardProps = invalidLoading;
  // @ts-expect-error feed/ready must reject spread onRemove props
  const _feedProbe: BenderLinkPreviewCardProps = invalidFeed;
  void [_loadingPreviewKey, _feedRemoveKey, _loadingProbe, _feedProbe];
};
void benderLinkPreviewTypeProbe;

function PreviewContents({ preview }: { preview: BenderLinkPreview }) {
  const image = isBendLinkPreviewImageUrl(preview.image_url)
    ? resolveAssetUrl(preview.image_url)
    : undefined;

  return (
    <>
      {image && (
        <div
          data-testid="bender-link-preview-image-wrapper"
          className="w-full min-w-0 aspect-[1.91/1] overflow-hidden bg-black"
        >
          <img
            data-testid="bender-link-preview-image"
            src={image}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="min-w-0 overflow-hidden p-3 break-words [overflow-wrap:anywhere]">
        <p className="min-w-0 break-words [overflow-wrap:anywhere] font-semibold">
          {preview.title}
        </p>
        {preview.description && (
          <p className="min-w-0 break-words [overflow-wrap:anywhere] mt-1 text-sm text-[hsl(30,10%,35%)]">
            {preview.description}
          </p>
        )}
        {preview.site_name && (
          <p className="min-w-0 break-words [overflow-wrap:anywhere] mt-2 text-xs text-[hsl(30,10%,55%)]">
            {preview.site_name}
          </p>
        )}
      </div>
    </>
  );
}

function cardClassName(): string {
  return 'block min-w-0 overflow-hidden rounded border border-[hsl(35,18%,88%)] bg-[hsl(40,20%,98%)] break-words [overflow-wrap:anywhere]';
}

export function BenderLinkPreviewCard(props: BenderLinkPreviewCardProps) {
  if (props.mode === 'composer' && props.state === 'loading') {
    return (
      <div
        data-testid="bender-link-preview-loading"
        role="status"
        className="min-w-0 h-24 rounded border animate-pulse"
      >
        Loading link preview
      </div>
    );
  }

  if (!isSafeHttpUrl(props.preview.url)) return null;
  const label = props.preview.site_name
    ? `${props.preview.title}, ${props.preview.site_name}`
    : props.preview.title;

  if (props.mode === 'composer') {
    return (
      <div data-testid="bender-link-preview" className={cardClassName()}>
        <PreviewContents preview={props.preview} />
        <button
          type="button"
          onClick={props.onRemove}
          aria-label="Remove link preview"
          className="m-3 mt-0 text-xs underline"
        >
          Remove link preview
        </button>
      </div>
    );
  }

  return (
    <a
      data-testid="bender-link-preview"
      href={props.preview.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cardClassName()}
    >
      <PreviewContents preview={props.preview} />
    </a>
  );
}
