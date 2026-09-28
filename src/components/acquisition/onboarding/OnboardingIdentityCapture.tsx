import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPhoneBrDigits } from '@/lib/brazilInputMasks';
import { activationInputClass } from './activationAppStyles';

type Props = {
  phone: string;
  onChange: (patch: { lead_phone?: string }) => void;
};

/** Sprint E1 — etapa inicial: somente WhatsApp (teste fechado). */
export function OnboardingIdentityCapture({ phone, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="leadPhone" className="text-sm text-muted-foreground">
          WhatsApp
        </Label>
        <Input
          id="leadPhone"
          className={activationInputClass}
          value={phone}
          onChange={(e) => onChange({ lead_phone: formatPhoneBrDigits(e.target.value) })}
          placeholder="(00) 00000-0000"
          autoComplete="tel"
          inputMode="tel"
          autoFocus
        />
      </div>
    </div>
  );
}
