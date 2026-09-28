import { ACTIVATION_WELCOME_GREETING, ACTIVATION_WELCOME_HEADLINE } from './constants';

type Props = {
  userName: string;
};

export function ActivationWelcomeSection({ userName }: Props) {
  const firstName = userName.trim().split(/\s+/)[0] ?? '';

  return (
    <header className="mb-4 hidden space-y-1 lg:mb-5 lg:block">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/90">
        {ACTIVATION_WELCOME_GREETING.eyebrow}
      </p>
      <h1 className="font-display text-xl font-semibold tracking-tight text-foreground lg:text-[1.6rem]">
        {ACTIVATION_WELCOME_GREETING.title(firstName)}
      </h1>
      <p className="text-sm text-muted-foreground">{ACTIVATION_WELCOME_HEADLINE.title}</p>
    </header>
  );
}
