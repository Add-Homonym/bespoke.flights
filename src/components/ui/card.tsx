import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ hover, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-hairline bg-surface-raised p-6 shadow-raised ${hover ? 'transition-colors duration-200 ease-out hover:border-border-control cursor-pointer' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
