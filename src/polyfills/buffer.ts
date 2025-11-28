// Polyfill para Buffer no navegador
// Necessário para socket.io-client e outras bibliotecas Node.js
import { Buffer } from 'buffer';

// Disponibilizar Buffer globalmente
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = Buffer;
  if (!(globalThis as any).global) {
    (globalThis as any).global = globalThis;
  }
}

if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
  if (!(window as any).global) {
    (window as any).global = window;
  }
  if (!(window as any).globalThis) {
    (window as any).globalThis = window;
  }
}

export {};
