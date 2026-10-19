import { useTranslation } from 'react-i18next';
import type { SurfaceTexture } from '../3d/surfaceTextures';
import './ExhibitionForm.css';

// Extracted out of ExhibitionForm.tsx so ExhibitionTemplateForm.tsx can
// reuse the same wall/floor/ceiling texture swatch UI instead of duplicating
// it — both forms share ExhibitionForm.css's .exform-texture-* classes.
// Each swatch sits inside a .exform-texture-swatch-wrap so the CSS hover
// tooltip (bottom-up, see ExhibitionForm.css) has a stable positioning
// anchor independent of the button's own border/overflow:hidden.
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
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5 text-sm text-brand-800">
      <span>{label}</span>
      <div className="exform-texture-swatches">
        <div className="exform-texture-swatch-wrap" data-tooltip={t('exhibitionFormTextureNone')}>
          <button
            type="button"
            className={`exform-texture-swatch exform-texture-swatch-none ${value ? '' : 'active'}`}
            onClick={() => onChange(undefined)}
          >
            ✕
          </button>
        </div>
        {options.map((texture) => (
          <div className="exform-texture-swatch-wrap" data-tooltip={texture.label} key={texture.id}>
            <button
              type="button"
              className={`exform-texture-swatch ${value === texture.id ? 'active' : ''}`}
              onClick={() => onChange(texture.id)}
            >
              <img src={texture.thumbnail} alt={texture.label} loading="lazy" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
