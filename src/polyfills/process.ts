// Polyfill para process (necessário para socket.io-client)
export const processPolyfill = {
  env: {},
  browser: true,
  version: '',
  versions: {},
  type: 'browser' as const,
  nextTick: (fn: () => void) => setTimeout(fn, 0),
  cwd: () => '/',
};

// Expor globalmente
if (typeof window !== 'undefined') {
  (window as any).process = processPolyfill;
}
if (typeof globalThis !== 'undefined') {
  (globalThis as any).process = processPolyfill;
}
if (typeof global !== 'undefined') {
  (global as any).process = processPolyfill;
}

export default processPolyfill;

