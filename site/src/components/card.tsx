import type { ElementType, HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Renders as something other than a div, e.g. `li` inside a list. */
  as?: ElementType;
  /** Adds a hover border so the card reads as a link target. */
  interactive?: boolean;
  padded?: boolean;
}

export function Card({
  children,
  as: Tag = 'div',
  interactive,
  padded = true,
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={[
        'rounded-xl border border-line bg-surface',
        padded && 'p-6',
        interactive && 'transition-colors duration-150 hover:border-faint',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  );
}
