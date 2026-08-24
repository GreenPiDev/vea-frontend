import type { ReactNode } from 'react';

interface TooltipProps {
  label: string;
  children: ReactNode;
}

// Small custom tooltip (not the native `title` attribute — that one is
// browser-styled, slow to appear, and can't be positioned/animated) for
// icon-only controls that need a text hint on hover. Named group
// (`group/tooltip`) so it doesn't collide with other `group`/`group-hover`
// usages already nested inside the trigger (e.g. HeaderTextLink's own
// underline-on-hover group).
export default function Tooltip({ label, children }: TooltipProps) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-brand-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-all duration-150 group-hover/tooltip:translate-y-0 group-hover/tooltip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
