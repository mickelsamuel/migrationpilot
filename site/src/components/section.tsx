import type { ReactNode } from 'react';

interface SectionProps {
  id?: string;
  children: ReactNode;
  /** Draws the hairline that separates this section from the one above. */
  bordered?: boolean;
  className?: string;
  width?: 'default' | 'narrow';
}

export function Section({ id, children, bordered = true, className, width = 'default' }: SectionProps) {
  return (
    <section
      id={id}
      className={[
        'py-16 md:py-24',
        bordered && 'border-t border-line-soft',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={['mp-container', width === 'narrow' && 'max-w-3xl'].filter(Boolean).join(' ')}>
        {children}
      </div>
    </section>
  );
}

interface HeadingProps {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  className?: string;
}

/** Section heading. Left aligned, always: nothing on this page is centred. */
export function SectionHeading({ eyebrow, title, lead, className }: HeadingProps) {
  return (
    <div className={['max-w-2xl', className].filter(Boolean).join(' ')}>
      {eyebrow && (
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-faint">{eyebrow}</p>
      )}
      <h2 className="text-2xl font-semibold text-fg sm:text-3xl">{title}</h2>
      {lead && <p className="mt-4 text-[15px] leading-relaxed text-muted sm:text-base">{lead}</p>}
    </div>
  );
}
