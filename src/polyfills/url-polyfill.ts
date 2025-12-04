// Polyfill customizado para o módulo url que expõe Url.parse corretamente
// Necessário para socket.io-client funcionar no navegador

// Importar funções do módulo url do Node.js
import { parse as urlParse, format as urlFormat, resolve as urlResolve } from 'url';

// Criar um objeto Url que expõe o método parse
// O socket.io-client espera Url.parse (com U maiúsculo) como uma classe/objeto
// IMPORTANTE: O socket.io-client pode tentar acessar como:
// - Url.parse (direto)
// - url.Url.parse
// - require('url').Url.parse
// - require('url').parse
export const Url = {
  parse: urlParse,
  format: urlFormat,
  resolve: urlResolve,
};

// Exportar funções individuais também (compatibilidade com import { parse } from 'url')
export const parse = urlParse;
export const format = urlFormat;
export const resolve = urlResolve;

// Criar módulo completo compatível com require('url') e import * as url from 'url'
const urlModule: any = {
  parse: urlParse,
  format: urlFormat,
  resolve: urlResolve,
  Url, // Expor Url como propriedade também
  default: {
    parse: urlParse,
    format: urlFormat,
    resolve: urlResolve,
    Url,
  },
};

// Garantir que está disponível globalmente ANTES de qualquer import do socket.io-client
// O socket.io-client pode tentar acessar via require('url') ou window.url
if (typeof window !== 'undefined') {
  // Expor Url diretamente (socket.io pode fazer Url.parse)
  (window as any).Url = Url;
  (globalThis as any).Url = Url;
  
  // Expor módulo completo (socket.io pode fazer url.Url.parse ou require('url'))
  (window as any).url = urlModule;
  (globalThis as any).url = urlModule;
  
  // Criar função require simples para compatibilidade
  if (typeof (window as any).require === 'undefined') {
    const requireCache: Record<string, any> = {
      'url': urlModule,
    };
    
    (window as any).require = (id: string) => {
      if (requireCache[id]) {
        return requireCache[id];
      }
      throw new Error(`Cannot find module '${id}'`);
    };
  } else {
    // Se require já existe, adicionar nosso módulo ao cache
    const existingRequire = (window as any).require;
    if (existingRequire.cache) {
      existingRequire.cache['url'] = urlModule;
    }
  }
}

// Exportar como default também
export default urlModule;

