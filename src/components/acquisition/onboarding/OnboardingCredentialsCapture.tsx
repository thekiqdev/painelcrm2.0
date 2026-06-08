import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { activationInputClass } from './activationAppStyles';

type Props = {
  email: string;
  password: string;
  confirmPassword: string;
  onChange: (patch: {
    lead_email?: string;
    signup_password?: string;
    signup_password_confirm?: string;
  }) => void;
};

export function OnboardingCredentialsCapture({
  email,
  password,
  confirmPassword,
  onChange,
}: Props) {
  return (
    <div className="space-y-4">
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

      <div className="space-y-2">
        <Label htmlFor="signupPassword" className="text-sm text-muted-foreground">
          Senha de acesso
        </Label>
        <Input
          id="signupPassword"
          type="password"
          className={activationInputClass}
          value={password}
          onChange={(e) => onChange({ signup_password: e.target.value })}
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signupPasswordConfirm" className="text-sm text-muted-foreground">
          Confirmar senha
        </Label>
        <Input
          id="signupPasswordConfirm"
          type="password"
          className={activationInputClass}
          value={confirmPassword}
          onChange={(e) => onChange({ signup_password_confirm: e.target.value })}
          placeholder="Repita a senha"
          autoComplete="new-password"
        />
      </div>
    </div>
  );
}
