export const SIGNUP_SUCCESS_PATH = '/signup-success';

export type SignupSuccessNavigationState = {
  next?: string;
};

export function buildSignupSuccessNavigation(next = '/dashboard') {
  return {
    pathname: SIGNUP_SUCCESS_PATH,
    state: { next } satisfies SignupSuccessNavigationState,
  };
}
