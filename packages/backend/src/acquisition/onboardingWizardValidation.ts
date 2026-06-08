import { z } from 'zod';
import { isValidOperationalSlug } from './tenantOperationalSlug.js';

const logoUrlField = z
  .union([z.string().max(2048), z.literal(''), z.null()])
  .optional()
  .refine(
    (v) => {
      if (v == null || v === '') return true;
      if (v.startsWith('data:')) return false;
      return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/api/');
    },
    { message: 'Use o upload de imagem — não cole base64 no formulário.' },
  );

export const wizardCompanyBodySchema = z.object({
  session_token: z.string().min(8),
  company_name: z.string().min(2, 'Informe o nome da operação (mínimo 2 caracteres).'),
  slug: z
    .string()
    .min(2, 'Informe o endereço da operação.')
    .max(64)
    .refine((v) => isValidOperationalSlug(v), {
      message: 'Endereço inválido. Use letras minúsculas, números e hífens.',
    }),
  logo_light_url: logoUrlField,
  logo_dark_url: logoUrlField,
  workspace_name: z.string().max(200).optional(),
});

export const wizardUsersBodySchema = z.object({
  session_token: z.string().min(8),
  members: z
    .array(
      z.object({
        email: z.string().email('E-mail do membro inválido.'),
        full_name: z.string().min(1, 'Nome do membro é obrigatório.'),
        role: z.enum(['admin', 'member', 'viewer']).default('member'),
        phone: z.string().max(20).optional(),
        password: z.string().min(6).optional(),
      }),
    )
    .max(10)
    .default([]),
});

export function formatWizardZodError(err: z.ZodError): { error: string; code: string; details?: unknown } {
  const issue = err.errors[0];
  const path = issue?.path?.join('.') ?? '';
  const msg = issue?.message;

  if (path.includes('logo_light') || path.includes('logo_dark')) {
    return {
      code: 'logo_invalid',
      error:
        msg ??
        'Logo inválido. Envie PNG, JPG ou WebP (até 2 MB) pelo botão de upload.',
    };
  }
  if (path.includes('company_name')) {
    return { code: 'company_name_invalid', error: msg ?? 'Nome da operação inválido.' };
  }
  if (path.includes('slug')) {
    return { code: 'slug_invalid', error: msg ?? 'Endereço da operação inválido.' };
  }
  if (path.includes('email')) {
    return { code: 'member_email_invalid', error: msg ?? 'E-mail de membro inválido.' };
  }
  return { code: 'validation_error', error: msg ?? 'Revise os campos e tente novamente.', details: err.errors };
}
