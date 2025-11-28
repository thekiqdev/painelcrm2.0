// Polyfill para Buffer no navegador
// Necessário para socket.io-client e outras bibliotecas Node.js
import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
  (window as any).global = window;
  (window as any).globalThis = window;
}

if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = Buffer;
  if (!(globalThis as any).global) {
    (globalThis as any).global = globalThis;
  }
}

export {};
