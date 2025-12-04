// Plugin do Vite para injetar polyfill de url antes de qualquer código
import type { Plugin } from 'vite';

export function urlPolyfillPlugin(): Plugin {
  return {
    name: 'url-polyfill',
    enforce: 'pre', // Executar antes de outros plugins
    transformIndexHtml(html) {
      // Injetar polyfill no HTML antes de qualquer script
      const polyfillScript = `
    <script>
      // Polyfill para Url.parse - DEVE ser executado ANTES de qualquer módulo
      // Este script é executado de forma síncrona antes de qualquer módulo ES ser carregado
      (function() {
        'use strict';
        if (typeof window === 'undefined') return;
        
        // Se já existe, não sobrescrever
        if (window.Url && typeof window.Url.parse === 'function') {
          console.log('[Polyfill] Url.parse already exists');
          return;
        }
        
        // Criar polyfill usando URL nativo do navegador
        const nativeURL = typeof URL !== 'undefined' ? URL : null;
        if (!nativeURL) {
          console.error('[Polyfill] URL not available in this environment');
          return;
        }
        
        // Função parse compatível com Node.js url.parse
        // Declarada como var para evitar problemas de hoisting
        var urlParse = function(urlString, parseQueryString, slashesDenoteHost) {
          if (!urlString || typeof urlString !== 'string') {
            throw new TypeError('Parameter "url" must be a string, not ' + typeof urlString);
          }
          
          try {
            // Se a URL é relativa, criar uma URL absoluta usando location
            let absoluteUrl = urlString;
            if (!urlString.match(/^[a-zA-Z][a-zA-Z\\d+.-]*:/)) {
              // URL relativa - tornar absoluta
              try {
                absoluteUrl = new nativeURL(urlString, window.location.href).href;
              } catch (e) {
                // Se falhar, tentar adicionar protocolo
                absoluteUrl = window.location.protocol + '//' + window.location.host + (urlString.startsWith('/') ? '' : '/') + urlString;
              }
            }
            
            const url = new nativeURL(absoluteUrl);
            const searchParams = url.search ? new URLSearchParams(url.search) : null;
            
            const result = {
              protocol: url.protocol || null,
              slashes: urlString.includes('//') || (url.protocol && url.protocol.endsWith(':')),
              auth: (url.username || url.password) ? ((url.username || '') + (url.password ? ':' + url.password : '')) : null,
              host: url.host || null,
              hostname: url.hostname || null,
              hash: url.hash || null,
              search: url.search || null,
              query: parseQueryString && searchParams ? Object.fromEntries(searchParams) : (url.search || null),
              pathname: url.pathname || '/',
              path: (url.pathname || '/') + (url.search || ''),
              href: url.href,
              port: url.port || null,
            };
            
            return result;
          } catch (e) {
            // Fallback para parsing manual mais robusto
            const protocolMatch = urlString.match(/^([a-zA-Z][a-zA-Z\\d+.-]*:)/);
            const protocol = protocolMatch ? protocolMatch[1] : null;
            const afterProtocol = protocol ? urlString.substring(protocol.length) : urlString;
            const hasSlashes = afterProtocol.startsWith('//');
            const afterSlashes = hasSlashes ? afterProtocol.substring(2) : afterProtocol;
            
            const hashIndex = afterSlashes.indexOf('#');
            const hash = hashIndex >= 0 ? '#' + afterSlashes.substring(hashIndex + 1) : null;
            const beforeHash = hashIndex >= 0 ? afterSlashes.substring(0, hashIndex) : afterSlashes;
            
            const queryIndex = beforeHash.indexOf('?');
            const search = queryIndex >= 0 ? '?' + beforeHash.substring(queryIndex + 1) : null;
            const beforeQuery = queryIndex >= 0 ? beforeHash.substring(0, queryIndex) : beforeHash;
            
            const pathMatch = beforeQuery.match(/^([^\\/]+)(.*)$/);
            const hostPart = pathMatch ? pathMatch[1] : '';
            const pathPart = pathMatch ? pathMatch[2] : (beforeQuery || '/');
            const [hostname, port] = hostPart.split(':');
            
            const searchParams = search ? new URLSearchParams(search.substring(1)) : null;
            
            return {
              protocol: protocol,
              slashes: hasSlashes,
              auth: null,
              host: hostPart || null,
              hostname: hostname || null,
              hash: hash,
              search: search,
              query: parseQueryString && searchParams ? Object.fromEntries(searchParams) : search,
              pathname: pathPart || '/',
              path: pathPart + (search || ''),
              href: urlString,
              port: port || null,
            };
          }
        };
        
        // Criar objeto Url ANTES de qualquer outra coisa
        // Usar var para garantir que está disponível imediatamente
        var UrlObject = {
          parse: urlParse,
          format: function(urlObj) {
            if (!urlObj || typeof urlObj !== 'object') return '';
            var url = '';
            if (urlObj.protocol) url += urlObj.protocol + (urlObj.slashes ? '//' : '');
            if (urlObj.auth) url += urlObj.auth + '@';
            if (urlObj.host) url += urlObj.host;
            else if (urlObj.hostname) {
              url += urlObj.hostname;
              if (urlObj.port) url += ':' + urlObj.port;
            }
            if (urlObj.pathname) url += urlObj.pathname;
            if (urlObj.search) url += urlObj.search;
            if (urlObj.hash) url += urlObj.hash;
            return url;
          },
          resolve: function(from, to) {
            try {
              return new nativeURL(to, from).href;
            } catch (e) {
              return to;
            }
          }
        };
        
        // Atribuir imediatamente para evitar problemas de inicialização
        window.Url = UrlObject;
        globalThis.Url = UrlObject;
        
        // Também expor via require se necessário
        if (typeof window.require === 'undefined') {
          window.require = function(id) {
            if (id === 'url') {
              return {
                parse: urlParse,
                format: UrlObject.format,
                resolve: UrlObject.resolve,
                Url: UrlObject
              };
            }
            throw new Error('Cannot find module \\'' + id + '\\'');
          };
        }
        
        // Garantir que está disponível também como propriedade do módulo url
        window.url = {
          parse: urlParse,
          format: UrlObject.format,
          resolve: UrlObject.resolve,
          Url: UrlObject
        };
        
        console.log('[Polyfill] Url.parse polyfill loaded successfully');
      })();
    </script>
`;
      // Inserir antes do primeiro script tag
      return html.replace('<head>', '<head>' + polyfillScript);
    },
  };
}

