import type { NextFunction, Request, Response } from 'express';
import { resolveRequestLocale, type AppLocale } from '../i18n/appLocale.js';

const LOCALE_PROP = 'appLocale';

type RequestWithLocale = Request & { [LOCALE_PROP]?: AppLocale };

export function getRequestLocale(req: Request): AppLocale {
  return (req as RequestWithLocale)[LOCALE_PROP] ?? resolveRequestLocale({});
}

/**
 * IX1 — anexa o locale do pedido. Não traduz o restante das respostas.
 * Ordem: ?lang, cookie painelcrm_locale, header X-App-Locale, Accept-Language, pt-BR.
 * O perfil do usuário entra na resolução do frontend (cookie e /api/auth/me).
 */
export function localeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const query = typeof req.query.lang === 'string' ? req.query.lang : null;
  const header = req.get('x-app-locale');
  (req as RequestWithLocale)[LOCALE_PROP] = resolveRequestLocale({
    query,
    cookieHeader: req.headers.cookie,
    appLocaleHeader: header,
    acceptLanguage: req.get('accept-language'),
  });
  next();
}
