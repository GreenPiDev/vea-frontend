import type { ReactNode } from 'react';

interface TooltipProps {
  label: string;
  children: ReactNode;
  /** Default 'bottom' (existing header/sidebar usage). 'top' is for
   * triggers near the bottom of a clipped container (e.g. GenericTable's
   * action-button column) — a bottom-placed label there pokes past the
   * table's own edge and gets cut off by its overflow-y-clip. */
  placement?: 'top' | 'bottom';
}

const PLACEMENT_CLASSES: Record<NonNullable<TooltipProps['placement']>, string> = {
  bottom: 'top-full mt-2 translate-y-1 group-hover/tooltip:translate-y-0',
  top: 'bottom-full mb-2 -translate-y-1 group-hover/tooltip:translate-y-0',
};

// Small custom tooltip (not the native `title` attribute — that one is
// browser-styled, slow to appear, and can't be positioned/animated) for
// icon-only controls that need a text hint on hover. Named group
// (`group/tooltip`) so it doesn't collide with other `group`/`group-hover`
// usages already nested inside the trigger (e.g. HeaderTextLink's own
// underline-on-hover group).
export default function Tooltip({ label, children, placement = 'bottom' }: TooltipProps) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-[200] -translate-x-1/2 whitespace-nowrap rounded-md bg-brand-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-all duration-150 group-hover/tooltip:opacity-100 ${PLACEMENT_CLASSES[placement]}`}
      >
        {label}
      </span>
    </span>
  );
}
