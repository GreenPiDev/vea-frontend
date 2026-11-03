import { useTranslation } from "react-i18next";
import type { NavigationMode } from "../../lib/navigationMode";

const MODES: { mode: NavigationMode; labelKey: string }[] = [
  { mode: "click", labelKey: "navigationModeClick" },
  { mode: "walk", labelKey: "navigationModeWalk" },
];

/** Bottom-left segmented switch between click-to-go and WASD/pointer-lock navigation. */
export default function NavigationModeSwitch({
  mode,
  onChange,
}: {
  mode: NavigationMode;
  onChange: (mode: NavigationMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="radiogroup"
      aria-label={t("navigationModeLabel")}
      className="fixed bottom-4 left-4 z-40 flex items-center gap-1 rounded-xl border border-brand-50/15 bg-brand-950/60 p-1 text-[13px] text-brand-50 shadow-lg backdrop-blur-md"
    >
      <span className="px-2 text-[11px] uppercase tracking-wider text-brand-100/70">{t("navigationModeLabel")}</span>
      {MODES.map(({ mode: m, labelKey }) => {
        const active = m === mode;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            // Keep keyboard focus off the switch after a click: Space/Enter are the scene's interact keys.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => !active && onChange(m)}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              active ? "bg-brand-100 font-medium text-brand-950" : "text-brand-50/80 hover:bg-brand-50/10"
            }`}
          >
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
}
