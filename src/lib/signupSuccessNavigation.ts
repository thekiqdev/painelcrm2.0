import type { NavigateFunction } from 'react-router-dom';

export const SIGNUP_SUCCESS_PATH = '/signup-success';

export type SignupSuccessNavigationState = {
  next?: string;
};

function normalizeFinalDestination(finalDestination: string | null | undefined): string {
  const next = finalDestination?.trim();
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/dashboard';
  return next;
}

export function buildSignupSuccessRedirect(finalDestination = '/dashboard'): string {
  const next = normalizeFinalDestination(finalDestination);
  const params = new URLSearchParams({ next });
  return `${SIGNUP_SUCCESS_PATH}?${params.toString()}`;
}

export function readSignupSuccessNext(
  search: string,
  state: SignupSuccessNavigationState | null | undefined,
): string {
  const fromQuery = new URLSearchParams(search).get('next');
  if (fromQuery) return normalizeFinalDestination(fromQuery);
  if (state?.next) return normalizeFinalDestination(state.next);
  return '/dashboard';
}

export function buildSignupSuccessNavigation(next = '/dashboard') {
  const finalDestination = normalizeFinalDestination(next);
  return {
    pathname: buildSignupSuccessRedirect(finalDestination),
    state: { next: finalDestination } satisfies SignupSuccessNavigationState,
  };
}

export function navigateToSignupSuccess(
  navigate: NavigateFunction,
  finalDestination = '/dashboard',
  options?: { replace?: boolean },
): void {
  const next = normalizeFinalDestination(finalDestination);
  navigate(buildSignupSuccessRedirect(next), {
    replace: options?.replace ?? true,
    state: { next } satisfies SignupSuccessNavigationState,
  });
}
