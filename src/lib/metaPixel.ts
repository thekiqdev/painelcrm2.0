type FbqFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  loaded?: boolean;
  version?: string;
  push?: FbqFn;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

let initializedPixelId: string | null = null;
let scriptInjected = false;

function ensureFbqBootstrap(): FbqFn | null {
  if (typeof window === 'undefined') return null;
  const w = window;
  if (w.fbq) return w.fbq;
  const n: FbqFn = function (...args: unknown[]) {
    if (n.callMethod) {
      n.callMethod(...args);
    } else {
      n.queue?.push(args);
    }
  };
  if (!w._fbq) w._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  w.fbq = n;
  return n;
}

export function initMetaPixel(pixelId: string): void {
  if (typeof window === 'undefined' || !pixelId) return;
  if (initializedPixelId === pixelId && window.fbq) return;

  const fbq = ensureFbqBootstrap();
  if (!fbq) return;

  if (!scriptInjected) {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
    scriptInjected = true;
  }

  fbq('init', pixelId);
  initializedPixelId = pixelId;
}

export function isMetaPixelReady(): boolean {
  return typeof window !== 'undefined' && Boolean(window.fbq) && Boolean(initializedPixelId);
}

export function trackMetaPageView(): void {
  if (!isMetaPixelReady()) return;
  window.fbq?.('track', 'PageView');
}

export function trackMetaLead(params?: Record<string, string>): void {
  if (!isMetaPixelReady()) return;
  if (params && Object.keys(params).length > 0) {
    window.fbq?.('track', 'Lead', params);
  } else {
    window.fbq?.('track', 'Lead');
  }
}

export function trackMetaCompleteRegistration(params?: Record<string, string>): void {
  if (!isMetaPixelReady()) return;
  if (params && Object.keys(params).length > 0) {
    window.fbq?.('track', 'CompleteRegistration', params);
  } else {
    window.fbq?.('track', 'CompleteRegistration');
  }
}
