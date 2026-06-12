import {
  ONBOARDING_LEAD_ACCESS_HEADLINE,
  ONBOARDING_LEAD_ADMIN_HEADLINE,
  ONBOARDING_LEAD_VERIFICATION_HEADLINE,
} from '../constants';
import { OnboardingIdentityCapture } from '../OnboardingIdentityCapture';
import { OnboardingPrincipalAdminCapture } from '../OnboardingPrincipalAdminCapture';
import {
  OnboardingPhoneVerification,
  type PhoneVerificationUiState,
} from '../OnboardingPhoneVerification';
import { ContactDesktopBackRow, ContactDesktopFooter } from './ContactDesktopFooter';
import { ContactLivePreview } from './ContactLivePreview';
import { ContactTrustIndicators } from './ContactTrustIndicators';
import {
  CONTACT_ACCESS_CTA,
  CONTACT_ADMIN_CTA,
  CONTACT_VERIFICATION_CTA,
} from './contactSetupConstants';
import { cn } from '@/lib/utils';

export type LeadCaptureSubStep = 'identity' | 'verification' | 'admin';

type Props = {
  subStep: LeadCaptureSubStep;
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  avatarUrl: string | null;
  adminFormComplete: boolean;
  onAvatarChange: (url: string | null) => void;
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
  avatarUrl,
  adminFormComplete,
  onAvatarChange,
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
  const isAdmin = subStep === 'admin';
  const headline = isAccessRequest
    ? ONBOARDING_LEAD_ACCESS_HEADLINE
    : isVerification
      ? ONBOARDING_LEAD_VERIFICATION_HEADLINE
      : ONBOARDING_LEAD_ADMIN_HEADLINE;
  const preview = { name, email, phone };
  const cta = isAccessRequest
    ? CONTACT_ACCESS_CTA
    : isVerification
      ? CONTACT_VERIFICATION_CTA
      : CONTACT_ADMIN_CTA;

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
    <OnboardingPrincipalAdminCapture
      name={name}
      email={email}
      password={password}
      confirmPassword={confirmPassword}
      avatarUrl={avatarUrl}
      onAvatarChange={onAvatarChange}
      onChange={onChange}
    />
  );

  return (
    <>
      <div
        className={cn(
          'lg:hidden',
          isAdmin ? 'flex flex-col gap-5 px-5 pb-2 pt-6' : 'space-y-4 pb-2',
        )}
      >
        <header className={cn(isAdmin ? 'flex flex-col gap-2' : 'space-y-2')}>
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
        {!isAdmin ? (
          <ContactLivePreview
            preview={preview}
            subStep={subStep}
            timelineStage="contact"
            phoneVerified={phoneVerified}
            avatarUrl={avatarUrl}
            adminFormComplete={adminFormComplete}
            compact
          />
        ) : null}
      </div>

      <div className="hidden min-h-0 flex-1 flex-col overflow-hidden lg:flex">
        <header className={cn('shrink-0', isAdmin ? 'mb-3 space-y-1' : 'mb-4 space-y-2')}>
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

        <div
          className={cn(
            'grid min-h-0 flex-1 overflow-hidden',
            isAdmin ? 'grid-cols-[1.2fr_0.8fr] gap-5' : 'grid-cols-[1.15fr_0.85fr] gap-6',
          )}
        >
          <div
            className={cn(
              'flex min-h-0 flex-col overflow-hidden',
              isAdmin ? 'min-h-0' : 'gap-3',
            )}
          >
            <ContactDesktopBackRow onBack={onBack} />
            <div className={cn(isAdmin ? 'min-h-0 min-w-0 flex-1' : 'shrink-0 space-y-4')}>
              {fields}
              {isAccessRequest ? <ContactTrustIndicators /> : null}
            </div>
            <ContactDesktopFooter
              onContinue={onContinue}
              loading={loading}
              label={cta.label}
              subtitle={cta.subtitle}
              dense={isAdmin}
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
              avatarUrl={avatarUrl}
              adminFormComplete={adminFormComplete}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
