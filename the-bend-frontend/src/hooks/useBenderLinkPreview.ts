import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractFirstHttpUrl } from '@/lib/benderLinks';
import { benderApi } from '@/services/benderApi';
import type { BenderLinkPreview } from '@/types';

export type BenderLinkPreviewStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'dismissed'
  | 'unavailable';

export interface UseBenderLinkPreviewResult {
  detectedUrl: string | null;
  status: BenderLinkPreviewStatus;
  preview: BenderLinkPreview | null;
  previewToken: string | null;
  dismiss: () => void;
  waitForPreviewToken: (sourceUrl: string | null, timeoutMs?: number) => Promise<string | null>;
  reset: () => void;
}

type ActiveRequest = {
  generation: number;
  sourceUrl: string;
  controller: AbortController;
  promise: Promise<string | null>;
  settle: (token: string | null) => void;
};

export function useBenderLinkPreview(caption: string, enabled: boolean): UseBenderLinkPreviewResult {
  const detectedUrl = useMemo(() => extractFirstHttpUrl(caption), [caption]);
  const [status, setStatus] = useState<BenderLinkPreviewStatus>('idle');
  const [preview, setPreview] = useState<BenderLinkPreview | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestRef = useRef<ActiveRequest | null>(null);
  const dismissedUrlRef = useRef<string | null>(null);

  const invalidate = useCallback(() => {
    generationRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
    activeRequestRef.current?.settle(null);
    activeRequestRef.current = null;
  }, []);

  const reset = useCallback(() => {
    invalidate();
    dismissedUrlRef.current = null;
    setStatus('idle');
    setPreview(null);
    setPreviewToken(null);
  }, [invalidate]);

  useEffect(() => {
    invalidate();
    dismissedUrlRef.current = null;
    setPreview(null);
    setPreviewToken(null);
    if (!enabled || !detectedUrl) {
      setStatus('idle');
      return;
    }

    const generation = generationRef.current;
    setStatus('loading');
    const controller = new AbortController();
    controllerRef.current = controller;
    let settlePromise!: (token: string | null) => void;
    const promise = new Promise<string | null>((resolve) => {
      settlePromise = resolve;
    });
    const request: ActiveRequest = {
      generation,
      sourceUrl: detectedUrl,
      controller,
      promise,
      settle: settlePromise,
    };
    activeRequestRef.current = request;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (activeRequestRef.current !== request || generationRef.current !== generation) {
        request.settle(null);
        return;
      }
      void benderApi.generateLinkPreview(detectedUrl, controller.signal)
        .then((response) => {
          if (activeRequestRef.current !== request || generationRef.current !== generation || controller.signal.aborted) return;
          setPreview(response.data.preview);
          setPreviewToken(response.data.preview_token);
          setStatus('success');
          request.settle(response.data.preview_token);
        })
        .catch((error: unknown) => {
          if (activeRequestRef.current !== request || generationRef.current !== generation) return;
          if (!controller.signal.aborted && !axios.isCancel(error)) setStatus('unavailable');
          request.settle(null);
        })
        .finally(() => {
          if (activeRequestRef.current === request) activeRequestRef.current = null;
        });
    }, 400);

    return invalidate;
  }, [detectedUrl, enabled, invalidate]);

  const dismiss = useCallback(() => {
    if (!detectedUrl || status !== 'success') return;
    dismissedUrlRef.current = detectedUrl;
    setStatus('dismissed');
    setPreview(null);
    setPreviewToken(null);
  }, [detectedUrl, status]);

  const waitForPreviewToken = useCallback(
    async (sourceUrl: string | null, timeoutMs = 5000): Promise<string | null> => {
      try {
        if (!sourceUrl || sourceUrl !== detectedUrl || dismissedUrlRef.current === sourceUrl || status === 'unavailable' || status === 'dismissed') return null;
        if (status === 'success' && previewToken) return previewToken;
        const request = activeRequestRef.current;
        if (!request || request.sourceUrl !== sourceUrl) return null;
        if (timeoutMs <= 0) return null;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        });
        try {
          return await Promise.race([request.promise, timeout]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch {
        return null;
      }
    },
    [detectedUrl, previewToken, status],
  );

  return { detectedUrl, status, preview, previewToken, dismiss, waitForPreviewToken, reset };
}
