import { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function isInStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

export function InstallBanner() {
  const { canInstall, install, dismiss } = useInstallPrompt();
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Show iOS instructions if on iOS, mobile, not in standalone, and not dismissed
    if (isIOS() && isMobile() && !isInStandaloneMode()) {
      const iosDismissed = localStorage.getItem('pwa-ios-dismissed') === 'true';
      if (!iosDismissed) {
        setShowIOSBanner(true);
      }
    }
  }, []);

  const dismissIOS = () => {
    localStorage.setItem('pwa-ios-dismissed', 'true');
    setShowIOSBanner(false);
  };

  // Already installed as app
  if (isInStandaloneMode()) return null;

  // Android / Chrome — native install prompt
  if (canInstall && !dismissed) {
    return (
      <div className="fixed bottom-20 md:bottom-4 left-4 right-4 z-40 mx-auto max-w-md">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-[hsl(160, 25%, 24%)] flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Install App</p>
            <p className="text-xs text-gray-500 mt-0.5">Add to your home screen for quick access</p>
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={async () => {
                  const accepted = await install();
                  if (!accepted) setDismissed(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-white rounded-md cursor-pointer transition-colors"
                style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}
              >
                Install App
              </button>
              <button
                onClick={() => { dismiss(); setDismissed(true); }}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 cursor-pointer transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={() => { dismiss(); setDismissed(true); }}
            className="text-gray-400 hover:text-gray-600 cursor-pointer p-1"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // iOS — manual instructions
  if (showIOSBanner) {
    return (
      <div className="fixed bottom-20 md:bottom-4 left-4 right-4 z-40 mx-auto max-w-md">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-[hsl(160, 25%, 24%)] flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Install App</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Tap <Share size={12} className="inline -mt-0.5 mx-0.5" /> <span className="font-medium">Share</span> in Safari, then <span className="font-medium">"Add to Home Screen"</span>
            </p>
          </div>
          <button
            onClick={dismissIOS}
            className="text-gray-400 hover:text-gray-600 cursor-pointer p-1"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
