// Polyfill para process no navegador
// Necessário para socket.io-client e outras bibliotecas Node.js
if (typeof window !== 'undefined' && typeof process === 'undefined') {
  (window as any).process = {
    env: {
      NODE_ENV: import.meta.env.MODE || 'production',
    },
    browser: true,
    version: '',
    versions: {},
    platform: 'browser',
    nextTick: (fn: Function) => setTimeout(fn, 0),
  };
  
  // Também definir globalmente
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).process = (window as any).process;
  }
}

export {};

