import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from 'react';
import { buttonStyles, type ButtonSize, type ButtonVariant } from './button-styles';

interface ButtonOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Fill the container's width. */
  block?: boolean;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonOptions {
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant, size, block, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonStyles({ variant, size, block, className })} {...props} />;
}

interface ButtonLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>, ButtonOptions {
  href: string;
}

/** A link that looks like a Button. Use for navigation; use Button for actions. */
export function ButtonLink({ variant, size, block, className, href, ...props }: ButtonLinkProps) {
  return <Link href={href} className={buttonStyles({ variant, size, block, className })} {...props} />;
}
