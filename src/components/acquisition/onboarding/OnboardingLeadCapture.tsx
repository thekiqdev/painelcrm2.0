import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPhoneBrDigits } from '@/lib/brazilInputMasks';
import { activationInputClass } from './activationAppStyles';

type Props = {
  name: string;
  email: string;
  phone: string;
  onChange: (patch: { lead_name?: string; lead_email?: string; lead_phone?: string }) => void;
};

export function OnboardingLeadCapture({ name, email, phone, onChange }: Props) {
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
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="leadName" className="text-sm text-muted-foreground">
          Seu nome
        </Label>
        <Input
          id="leadName"
          className={activationInputClass}
          value={name}
          onChange={(e) => onChange({ lead_name: e.target.value })}
          placeholder="Como podemos te chamar?"
          autoComplete="name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="leadEmail" className="text-sm text-muted-foreground">
          E-mail
        </Label>
        <Input
          id="leadEmail"
          type="email"
          className={activationInputClass}
          value={email}
          onChange={(e) => onChange({ lead_email: e.target.value })}
          placeholder="voce@empresa.com"
          autoComplete="email"
        />
      </div>
    </div>
  );
}
