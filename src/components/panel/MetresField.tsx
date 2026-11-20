import { useEffect, useState } from 'react';

/** A metres input that commits on blur/Enter (so clamping doesn't fight the curator mid-typing). */
export default function MetresField({ label, hint, value, onCommit }: { label: string; hint?: string; value: number; onCommit: (v: number) => unknown }) {
  const [draft, setDraft] = useState(value.toFixed(2));
  useEffect(() => setDraft(value.toFixed(2)), [value]);
  const commit = () => {
    const v = Number(draft.replace(',', '.'));
    if (Number.isFinite(v)) onCommit(v);
    setDraft(value.toFixed(2));
  };
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="flex flex-col">
        {label}
        {hint && <span className="text-xs text-brand-500">{hint}</span>}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        className="w-20 rounded-md border border-brand-300 px-2 py-1 text-right"
      />
    </label>
  );
}
