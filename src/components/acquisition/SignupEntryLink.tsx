import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { useSignupEntry } from '@/hooks/useSignupEntry';
import { cn } from '@/lib/utils';

type Props = Omit<LinkProps, 'to'> & {
  planId?: string;
  className?: string;
  children: ReactNode;
};

/** CTA público que respeita platform.signup_entry_mode. */
export function SignupEntryLink({ planId, className, children, ...rest }: Props) {
  const { signupPath } = useSignupEntry({ planId });
  if (import.meta.env.VITE_LANDING_STANDALONE === '1') {
    return (
      <a href={signupPath} className={cn(className)} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }
  return (
    <Link to={signupPath} className={cn(className)} {...rest}>
      {children}
    </Link>
  );
}
