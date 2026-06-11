import {
  ONBOARDING_LEAD_ACCESS_HEADLINE,
  ONBOARDING_LEAD_CREDENTIALS_HEADLINE,
  ONBOARDING_LEAD_VERIFICATION_HEADLINE,
} from '../constants';
import { OnboardingIdentityCapture } from '../OnboardingIdentityCapture';
import { OnboardingCredentialsCapture } from '../OnboardingCredentialsCapture';
import {
  OnboardingPhoneVerification,
  type PhoneVerificationUiState,
} from '../OnboardingPhoneVerification';
import { ContactDesktopBackRow, ContactDesktopFooter } from './ContactDesktopFooter';
import { ContactLivePreview } from './ContactLivePreview';
import { ContactTrustIndicators } from './ContactTrustIndicators';
import { CONTACT_ACCESS_CTA, CONTACT_CTA, CONTACT_VERIFICATION_CTA } from './contactSetupConstants';

export type LeadCaptureSubStep = 'identity' | 'verification' | 'credentials';

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
  verificationCode?: string;
  onVerificationCodeChange?: (code: string) => void;
  verificationUiState?: PhoneVerificationUiState;
  verificationError?: string | null;
  phoneVerified?: boolean;
  resendCooldownSec?: number;
  onResendCode?: () => void;
  resendLoading?: boolean;
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
  verificationCode = '',
  onVerificationCodeChange,
  verificationUiState = 'idle',
  verificationError,
  phoneVerified = false,
  resendCooldownSec = 0,
  onResendCode,
  resendLoading,
}: Props) {
  const isAccessRequest = subStep === 'identity';
  const isVerification = subStep === 'verification';
  const headline = isAccessRequest
    ? ONBOARDING_LEAD_ACCESS_HEADLINE
    : isVerification
      ? ONBOARDING_LEAD_VERIFICATION_HEADLINE
      : ONBOARDING_LEAD_CREDENTIALS_HEADLINE;
  const preview = { name, email, phone };
  const cta = isAccessRequest
    ? CONTACT_ACCESS_CTA
    : isVerification
      ? CONTACT_VERIFICATION_CTA
      : CONTACT_CTA;

  const fields = isAccessRequest ? (
    <OnboardingIdentityCapture phone={phone} onChange={onChange} />
  ) : isVerification ? (
    <OnboardingPhoneVerification
      code={verificationCode}
      onChange={(code) => onVerificationCodeChange?.(code)}
      uiState={verificationUiState}
      errorMessage={verificationError}
      resendCooldownSec={resendCooldownSec}
      onResend={() => onResendCode?.()}
      resendLoading={resendLoading}
    />
  ) : (
    <OnboardingCredentialsCapture
      name={name}
      email={email}
      password={password}
      confirmPassword={confirmPassword}
      onChange={onChange}
    />
  );

  return (
    <>
      <div className="space-y-4 pb-2 lg:hidden">
        <header className="space-y-2">
          {isAccessRequest ? (
            <>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
                {headline.kicker}
              </p>
              <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
                {headline.title}
              </h1>
            </>
          ) : (
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              {headline.title}
            </h1>
          )}
          <p className="text-sm leading-relaxed text-muted-foreground">{headline.subtitle}</p>
        </header>

        {contactBanner && isAccessRequest ? (
          <p className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
            {contactBanner}
          </p>
        ) : null}

        {fields}
        {isAccessRequest ? <ContactTrustIndicators compact /> : null}
        <ContactLivePreview
          preview={preview}
          subStep={subStep}
          timelineStage="contact"
          phoneVerified={phoneVerified}
          compact
        />
      </div>

      <div className="hidden min-h-0 flex-1 flex-col overflow-hidden lg:flex">
        <header className="mb-4 shrink-0 space-y-2">
          {isAccessRequest ? (
            <>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary/80">
                {ONBOARDING_LEAD_ACCESS_HEADLINE.kicker}
              </p>
              <h1 className="font-display text-[1.75rem] font-semibold tracking-tight text-foreground">
                {ONBOARDING_LEAD_ACCESS_HEADLINE.title}
              </h1>
              <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                {ONBOARDING_LEAD_ACCESS_HEADLINE.subtitle}
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-[1.75rem] font-semibold tracking-tight text-foreground">
                {headline.title}
              </h1>
              <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">{headline.subtitle}</p>
            </>
          )}
        </header>

        {contactBanner && isAccessRequest ? (
          <p className="mb-4 shrink-0 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
            {contactBanner}
          </p>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[1.15fr_0.85fr] gap-6 overflow-hidden">
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            <ContactDesktopBackRow onBack={onBack} />
            <div className="shrink-0 space-y-4">
              {fields}
              {isAccessRequest ? <ContactTrustIndicators /> : null}
            </div>
            <ContactDesktopFooter
              onContinue={onContinue}
              loading={loading}
              label={cta.label}
              subtitle={cta.subtitle}
            />
          </div>

          <aside
            className="flex min-h-0 flex-col overflow-y-auto lg:max-h-[calc(100dvh-8rem)]"
            aria-label="Status da ativação"
          >
            <ContactLivePreview
              preview={preview}
              subStep={subStep}
              timelineStage="contact"
              phoneVerified={phoneVerified}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
