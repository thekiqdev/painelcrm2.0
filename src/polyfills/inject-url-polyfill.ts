// Script para injetar polyfill de Url.parse ANTES de qualquer código ser executado
// Este arquivo será importado no HTML como script inline

(function() {
  'use strict';
  
  // Verificar se já existe Url.parse (não sobrescrever se já estiver definido)
  if (typeof window !== 'undefined' && !(window as any).Url) {
    // Criar função parse simples usando URL nativo do navegador
    const urlParse = function(urlStr: string, parseQueryString?: boolean, slashesDenoteHost?: boolean) {
      try {
        const url = new URL(urlStr, window.location.origin);
        const parsed: any = {
          protocol: url.protocol.replace(':', ''),
          slashes: true,
          auth: url.username && url.password ? `${url.username}:${url.password}` : (url.username || ''),
          host: url.host,
          hostname: url.hostname,
          hash: url.hash.replace('#', ''),
          search: url.search.replace('?', ''),
          query: parseQueryString ? parseQuery(url.search) : url.search.replace('?', ''),
          pathname: url.pathname,
          path: url.pathname + url.search,
          href: url.href,
        };
        
        // Adicionar port se existir
        if (url.port) {
          parsed.port = url.port;
        }
        
        return parsed;
      } catch (e) {
        // Fallback para URLs relativas ou malformadas
        const match = urlStr.match(/^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/);
        if (!match) {
          throw new Error('Invalid URL');
        }
        
        return {
          protocol: match[2] || '',
          slashes: !!match[3],
          auth: '',
          host: match[4] || '',
          hostname: match[4] ? match[4].split(':')[0] : '',
          port: match[4] && match[4].includes(':') ? match[4].split(':')[1] : '',
          hash: match[8] || '',
          search: match[6] || '',
          query: parseQueryString ? parseQuery(match[6]) : (match[6] || ''),
          pathname: match[5] || '/',
          path: (match[5] || '/') + (match[6] || ''),
          href: urlStr,
        };
      }
    };
    
    // Função auxiliar para parse de query string
    function parseQuery(queryStr: string): Record<string, string> {
      const params: Record<string, string> = {};
      if (!queryStr) return params;
      
      queryStr.replace('?', '').split('&').forEach(param => {
        const [key, value] = param.split('=');
        if (key) {
          params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
        }
      });
      
      return params;
    }
    
    // Criar objeto Url com método parse
    const Url = {
      parse: urlParse,
    };
    
    // Expor globalmente
    (window as any).Url = Url;
    (globalThis as any).Url = Url;
    
    // Também criar módulo url compatível
    const urlModule = {
      parse: urlParse,
      Url: Url,
    };
    
    (window as any).url = urlModule;
    (globalThis as any).url = urlModule;
    
    console.log('[Polyfill] Url.parse injected successfully');
  }
})();
