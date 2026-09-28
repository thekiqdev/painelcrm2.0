import { ACTIVATION_MOBILE_GREETING } from './constants';

type Props = {
  userName: string;
};

/** Cabeçalho mobile — saudação humana, sem “Centro de preparação”. */
export function ActivationMobileHeader({ userName }: Props) {
  const firstName = userName.trim().split(/\s+/)[0] ?? '';

  return (
    <header className="mb-5 space-y-1.5 text-center lg:hidden">
      <h1 className="font-display text-[1.35rem] font-semibold tracking-tight text-foreground">
        {ACTIVATION_MOBILE_GREETING.title(firstName)}
      </h1>
      <p className="mx-auto max-w-[280px] text-sm leading-relaxed text-muted-foreground">
        {ACTIVATION_MOBILE_GREETING.subtitle}
      </p>
    </header>
  );
}
