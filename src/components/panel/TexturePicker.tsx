import type { SurfaceTexture } from '../3d/surfaceTextures';
import './ExhibitionForm.css';

// Extracted out of ExhibitionForm.tsx so ExhibitionTemplateForm.tsx can
// reuse the same wall/floor/ceiling texture swatch UI instead of duplicating
// it — both forms share ExhibitionForm.css's .exform-texture-* classes.
export default function TexturePicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SurfaceTexture[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm text-brand-800">
      <span>{label}</span>
      <div className="exform-texture-swatches">
        <button
          type="button"
          className={`exform-texture-swatch exform-texture-swatch-none ${value ? '' : 'active'}`}
          onClick={() => onChange(undefined)}
        >
          ✕
        </button>
        {options.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`exform-texture-swatch ${value === t.id ? 'active' : ''}`}
            onClick={() => onChange(t.id)}
            title={t.label}
          >
            <img src={t.thumbnail} alt={t.label} loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
