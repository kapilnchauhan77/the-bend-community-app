/* eslint-disable react-refresh/only-export-components */
import { createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BenderComposer } from '@/pages/BenderPage';
import type { BenderPost } from '@/types';

function ComposerHarness() {
  const [open, setOpen] = useState(true);
  const [created, setCreated] = useState<BenderPost[]>([]);

  return createElement(
    'div',
    null,
    createElement('button', {
      'data-testid': 'composer-harness-force-close',
      onClick: () => setOpen(false),
    }, 'Force close'),
    createElement('button', {
      'data-testid': 'composer-harness-reopen',
      onClick: () => setOpen(true),
    }, 'Reopen'),
    createElement('output', {
      'data-testid': 'composer-harness-state',
    }, JSON.stringify({ open, createdCount: created.length })),
    createElement(BenderComposer, {
      open,
      onClose: () => setOpen(false),
      onCreated: (post: BenderPost) => setCreated((current) => [...current, post]),
    }),
  );
}

export interface BenderComposerHarnessController {
  cleanup: () => void;
}

export function mountBenderComposerHarness(host: HTMLElement): BenderComposerHarnessController {
  const root: Root = createRoot(host);
  root.render(createElement(ComposerHarness));
  return {
    cleanup: () => {
      root.unmount();
      host.remove();
    },
  };
}
