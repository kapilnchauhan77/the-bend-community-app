import { useState, useRef, useEffect } from 'react';
import { Share2, Link2, Mail, MessageCircle, Check, Globe } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { usePlatformServices } from '@/platform/createPlatformServices';
import { publicWestmorelandUrl } from '@/lib/publicUrl';

interface ShareButtonProps {
  url: string;
  title: string;
  description?: string;
  className?: string;
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function ShareButton({ url, title, description, className = '' }: ShareButtonProps) {
  const services = usePlatformServices();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fullUrl = isAbsoluteHttpUrl(url)
    ? url
    : Capacitor.isNativePlatform()
      ? publicWestmorelandUrl(url)
      : `${window.location.origin}${url}`;
  const encodedUrl = encodeURIComponent(fullUrl);
  const encodedTitle = encodeURIComponent(title);
  const encodedDesc = encodeURIComponent(description || title);

  const handleNativeShare = async () => {
    const result = Capacitor.isNativePlatform()
      ? await services.share.share({ title, text: description || title, url: fullUrl })
      : services.share.share({ title, text: description || title, url: fullUrl });
    if (await result === 'shared') setOpen(false);
  };

  const shareText = description ? `${title}\n${description}\n${fullUrl}` : `${title}\n${fullUrl}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('textarea');
      input.value = shareText;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareOptions = [
    {
      label: copied ? 'Copied!' : 'Copy Link',
      icon: copied ? Check : Link2,
      onClick: handleCopyLink,
      color: 'text-[hsl(30,10%,40%)]',
    },
    {
      label: 'WhatsApp',
      icon: MessageCircle,
      href: `https://wa.me/?text=${encodedTitle}%0A${encodedDesc}%0A${encodedUrl}`,
      color: 'text-[hsl(142,70%,35%)]',
    },
    {
      label: 'Facebook',
      icon: Globe,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      color: 'text-[hsl(220,46%,48%)]',
    },
    {
      label: 'Email',
      icon: Mail,
      href: `mailto:?subject=${encodedTitle}&body=${encodedDesc}%0A%0A${encodedUrl}`,
      color: 'text-[hsl(30,10%,40%)]',
    },
  ];

  // On mobile, try native share first
  const handleClick = () => {
    if ((Capacitor.isNativePlatform() || navigator.share) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      handleNativeShare();
    } else {
      setOpen(!open);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[hsl(30,10%,45%)] hover:text-[hsl(35,45%,42%)] border border-[hsl(35,18%,84%)] hover:border-[hsl(35,45%,42%)] rounded transition-colors cursor-pointer"
        aria-label="Share"
      >
        <Share2 size={14} />
        Share
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-[hsl(40,20%,98%)] border border-[hsl(35,18%,84%)] shadow-lg z-50 py-1">
          {shareOptions.map((opt) =>
            opt.href ? (
              <a
                key={opt.label}
                href={opt.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-[hsl(30,10%,35%)] hover:bg-[hsl(35,15%,94%)] transition-colors cursor-pointer"
              >
                <opt.icon size={15} className={opt.color} />
                {opt.label}
              </a>
            ) : (
              <button
                key={opt.label}
                onClick={opt.onClick}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-[hsl(30,10%,35%)] hover:bg-[hsl(35,15%,94%)] transition-colors cursor-pointer text-left"
              >
                <opt.icon size={15} className={opt.color} />
                {opt.label}
              </button>
            )
          )}

          {/* X / Twitter */}
          <a
            href={`https://x.com/intent/tweet?text=${encodedTitle}%20-%20${encodedDesc}&url=${encodedUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-[hsl(30,10%,35%)] hover:bg-[hsl(35,15%,94%)] transition-colors cursor-pointer"
          >
            <Share2 size={15} className="text-[hsl(30,10%,40%)]" />
            X / Twitter
          </a>
        </div>
      )}
    </div>
  );
}
