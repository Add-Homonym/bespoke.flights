import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ hover, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-brand-border bg-brand-card p-6 ${hover ? 'hover:border-brand-gold/30 transition-colors cursor-pointer' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
