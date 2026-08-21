/* eslint-disable react-refresh/only-export-components */
import { createElement, useState, type ChangeEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useBenderLinkPreview } from '@/hooks/useBenderLinkPreview';
import { benderApi, type BenderLinkPreviewResponse } from '@/services/benderApi';

type ControlledResponse = { data: BenderLinkPreviewResponse };

export interface BenderLinkPreviewHookHarnessOptions {
  ignoreAbort?: boolean;
}

export interface BenderLinkPreviewHookHarnessController {
  cleanup: () => void;
  requests: () => string[];
  resolve: (sourceUrl: string) => void;
}

function controlledResponse(sourceUrl: string): ControlledResponse {
  return {
    data: {
      preview_token: `token:${sourceUrl}`,
      preview: {
        source_url: sourceUrl,
        url: `${sourceUrl}/canonical`,
        title: sourceUrl.endsWith('/a') ? 'A' : sourceUrl.endsWith('/b') ? 'B' : sourceUrl,
        description: null,
        site_name: null,
        image_url: null,
      },
    },
  };
}

function HookHarness() {
  const [caption, setCaption] = useState('');
  const [source, setSource] = useState('');
  const [timeout, setTimeoutValue] = useState('5000');
  const [waitResult, setWaitResult] = useState('');
  const [enabled, setEnabled] = useState(true);
  const result = useBenderLinkPreview(caption, enabled);

  return createElement(
    'div',
    null,
    createElement('input', {
      'data-testid': 'hook-caption',
      value: caption,
      onChange: (event: ChangeEvent<HTMLInputElement>) => setCaption(event.target.value),
    }),
    createElement('input', {
      'data-testid': 'hook-source',
      value: source,
      onChange: (event: ChangeEvent<HTMLInputElement>) => setSource(event.target.value),
    }),
    createElement('input', {
      'data-testid': 'hook-timeout',
      value: timeout,
      onChange: (event: ChangeEvent<HTMLInputElement>) => setTimeoutValue(event.target.value),
    }),
    createElement(
      'button',
      {
        'data-testid': 'hook-wait',
        onClick: () =>
          void result
            .waitForPreviewToken(source || null, Number(timeout))
            .then((value) => setWaitResult(value ?? 'null')),
      },
      'Wait',
    ),
    createElement('button', { 'data-testid': 'hook-reset', onClick: result.reset }, 'Reset'),
    createElement('button', { 'data-testid': 'hook-close', onClick: () => setEnabled(false) }, 'Close'),
    createElement(
      'output',
      { 'data-testid': 'hook-state' },
      JSON.stringify({
        detectedUrl: result.detectedUrl,
        status: result.status,
        token: result.previewToken,
        previewTitle: result.preview?.title ?? null,
        waitResult,
      }),
    ),
  );
}

export function mountBenderLinkPreviewHookHarness(
  host: HTMLElement,
  options: BenderLinkPreviewHookHarnessOptions = {},
): BenderLinkPreviewHookHarnessController {
  const root: Root = createRoot(host);
  const requestLog: string[] = [];
  const pending = new Map<string, (response: ControlledResponse) => void>();
  const originalGenerateLinkPreview = benderApi.generateLinkPreview;
  let cleaned = false;

  if (options.ignoreAbort) {
    benderApi.generateLinkPreview = ((sourceUrl: string, signal?: AbortSignal) => {
      void signal;
      requestLog.push(sourceUrl);
      return new Promise<ControlledResponse>((resolve) => {
        pending.set(sourceUrl, resolve);
      });
    }) as typeof benderApi.generateLinkPreview;
  }

  root.render(createElement(HookHarness));

  return {
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      root.unmount();
      if (options.ignoreAbort) benderApi.generateLinkPreview = originalGenerateLinkPreview;
      pending.clear();
      host.remove();
    },
    requests: () => [...requestLog],
    resolve: (sourceUrl: string) => {
      pending.get(sourceUrl)?.(controlledResponse(sourceUrl));
      pending.delete(sourceUrl);
    },
  };
}
