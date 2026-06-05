import { useState } from 'react';
import { Copy, Check, Tag, Clock, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseServerDate } from '@/lib/utils';
import { discountCodeApi } from '@/services/discountCodeApi';
import type { DiscountCode } from '@/types';
import { AxiosError } from 'axios';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

interface DiscountCodesListProps {
  codes: DiscountCode[];
  emptyHint?: string;
  onUsed?: (id: string) => void;
}

function formatValue(c: DiscountCode): string {
  if (c.discount_type === 'percentage') {
    return `${c.discount_value}% off`;
  }
  // flat: discount_value is in CENTS
  return `$${(c.discount_value / 100).toFixed(2)} off`;
}

function formatExpiry(iso: string): string {
  return parseServerDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function CodeRow({ code, onUsed }: { code: DiscountCode; onUsed?: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [usageCount, setUsageCount] = useState(code.usage_count);
  const [used, setUsed] = useState(false);
  const [gone, setGone] = useState(false);
  const [usingNow, setUsingNow] = useState(false);

  const remaining =
    code.max_uses != null ? Math.max(0, code.max_uses - usageCount) : null;

  function handleCopy() {
    try {
      navigator.clipboard.writeText(code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be blocked in some contexts — fail silently.
    }
  }

  async function handleUse() {
    if (usingNow || gone) return;
    setUsingNow(true);
    // Optimistic increment
    const prevCount = usageCount;
    setUsageCount((c) => c + 1);
    try {
      await discountCodeApi.markUsed(code.id);
      setUsed(true);
      setTimeout(() => setUsed(false), 2500);
      onUsed?.(code.id);
    } catch (err) {
      // Roll back optimistic update
      setUsageCount(prevCount);
      const status = (err as AxiosError)?.response?.status;
      if (status === 410) {
        setGone(true);
      }
    } finally {
      setUsingNow(false);
    }
  }

  return (
    <div className="border border-[hsl(35,18%,84%)] bg-[hsl(40,20%,98%)] p-4 flex flex-col sm:flex-row sm:items-center gap-4">
      {/* Code chip + value */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div
          className="font-mono font-bold text-sm sm:text-base px-3 py-2 rounded text-white tracking-wider whitespace-nowrap"
          style={{ backgroundColor: BRONZE }}
        >
          {code.code}
        </div>
        <div
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-sm border whitespace-nowrap"
          style={{
            borderColor: 'hsl(35,18%,84%)',
            backgroundColor: 'hsl(35,15%,94%)',
            color: PRIMARY,
          }}
        >
          <Tag className="w-3 h-3" />
          {formatValue(code)}
        </div>
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="font-serif font-semibold text-sm text-[hsl(30,15%,18%)] leading-tight">
          {code.name}
        </p>
        {code.description && (
          <p className="text-xs text-[hsl(30,10%,48%)] mt-0.5 leading-snug line-clamp-2">
            {code.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-[hsl(30,10%,55%)]">
          {code.expiry_date && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Expires {formatExpiry(code.expiry_date)}
            </span>
          )}
          {code.max_uses != null && (
            <span className="inline-flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {remaining} of {code.max_uses} left
            </span>
          )}
        </div>
        {gone && (
          <p className="text-[11px] text-[hsl(0,55%,45%)] font-medium mt-1.5">
            This code is no longer available.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopy}
          className="text-xs tracking-wider uppercase border-[hsl(35,18%,84%)] text-[hsl(30,15%,30%)] hover:border-[hsl(35,45%,42%)] cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 mr-1.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              Copy code
            </>
          )}
        </Button>
        <Button
          size="sm"
          onClick={handleUse}
          disabled={usingNow || gone}
          className="text-xs tracking-wider uppercase text-white cursor-pointer"
          style={{ backgroundColor: PRIMARY }}
        >
          {used ? 'Thanks!' : usingNow ? 'Saving…' : 'I used this'}
        </Button>
      </div>
    </div>
  );
}

export function DiscountCodesList({ codes, emptyHint, onUsed }: DiscountCodesListProps) {
  if (codes.length === 0) {
    if (!emptyHint) return null;
    return (
      <p className="text-sm italic text-[hsl(30,10%,55%)] py-3">{emptyHint}</p>
    );
  }
  return (
    <div className="space-y-3">
      {codes.map((c) => (
        <CodeRow key={c.id} code={c} onUsed={onUsed} />
      ))}
    </div>
  );
}

export default DiscountCodesList;
