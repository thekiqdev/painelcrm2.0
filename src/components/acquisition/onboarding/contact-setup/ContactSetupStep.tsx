import { ONBOARDING_HEADLINES, ONBOARDING_LEAD_CREDENTIALS_HEADLINE } from '../constants';
import { OnboardingIdentityCapture } from '../OnboardingIdentityCapture';
import { OnboardingCredentialsCapture } from '../OnboardingCredentialsCapture';
import { ContactDesktopBackRow, ContactDesktopFooter } from './ContactDesktopFooter';
import { ContactLivePreview } from './ContactLivePreview';
import { ContactTrustIndicators } from './ContactTrustIndicators';

export type LeadCaptureSubStep = 'identity' | 'credentials';

type Props = {
  subStep: LeadCaptureSubStep;
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  onChange: (patch: {
    lead_name?: string;
    lead_email?: string;
    lead_phone?: string;
    signup_password?: string;
    signup_password_confirm?: string;
  }) => void;
  onContinue: () => void;
  onBack?: () => void;
  loading?: boolean;
  contactBanner?: string | null;
};

export function ContactSetupStep({
  subStep,
  name,
  email,
  phone,
  password,
  confirmPassword,
  onChange,
  onContinue,
  onBack,
  loading,
  contactBanner,
}: Props) {
  const headline =
    subStep === 'credentials' ? ONBOARDING_LEAD_CREDENTIALS_HEADLINE : ONBOARDING_HEADLINES.lead;
  const preview = { name, email, phone };

  const fields =
    subStep === 'identity' ? (
      <OnboardingIdentityCapture name={name} phone={phone} onChange={onChange} />
    ) : (
      <OnboardingCredentialsCapture
        email={email}
        password={password}
        confirmPassword={confirmPassword}
        onChange={onChange}
      />
    );

  return (
    <>
      <div className="space-y-4 pb-2 lg:hidden">
        <header className="space-y-1">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
            {headline.title}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{headline.subtitle}</p>
        </header>

        {contactBanner && subStep === 'identity' ? (
          <p className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
            {contactBanner}
          </p>
        ) : null}

        {fields}
        <ContactTrustIndicators compact />
      </div>

      <div className="hidden min-h-0 flex-1 flex-col overflow-hidden lg:flex">
        <header className="mb-4 shrink-0 space-y-2">
          <h1 className="font-display text-[1.75rem] font-semibold tracking-tight text-foreground">
            {headline.title}
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">{headline.subtitle}</p>
        </header>

        {contactBanner && subStep === 'identity' ? (
          <p className="mb-4 shrink-0 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
            {contactBanner}
          </p>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[1.15fr_0.85fr] gap-6 overflow-hidden">
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            <ContactDesktopBackRow onBack={onBack} />
            <div className="shrink-0 space-y-4">
              {fields}
              {subStep === 'identity' ? <ContactTrustIndicators /> : null}
            </div>
            <ContactDesktopFooter onContinue={onContinue} loading={loading} />
          </div>

          <aside className="flex min-h-0 flex-col overflow-hidden" aria-label="Preview do acesso">
            <ContactLivePreview preview={preview} />
          </aside>
        </div>
      </div>
    </>
  );
}
