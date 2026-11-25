interface KpiCardProps {
  label: string;
  /** Undefined while loading — renders a placeholder instead of a misleading 0. */
  value: number | undefined;
}

// Single headline number for a panel page's KPI row (e.g. the SUPERADMIN
// organization detail page: admins / exhibitions / artists). Same light card
// surface as GenericTable so a KPI row and the table under it read as one page.
export default function KpiCard({ label, value }: KpiCardProps) {
  return (
    <div className="flex flex-col rounded-lg bg-brand-50 p-4 shadow-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-brand-600">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-brand-900">{value ?? '–'}</span>
    </div>
  );
}
