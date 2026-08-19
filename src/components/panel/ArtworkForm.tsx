import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../../lib/currencies';
import { useArtworkMutations, type ApiArtwork, type ArtworkCategory, type ArtworkOrientation } from '../../lib/api/domains/artworks';
import { ApiError } from '../../lib/api/client';

const ORIENTATIONS: ArtworkOrientation[] = ['PORTRAIT', 'LANDSCAPE', 'SQUARE'];
const CATEGORIES: ArtworkCategory[] = ['PAINTING', 'SCULPTURE', 'PHOTOGRAPHY', 'OTHER'];

const ORIENTATION_KEYS: Record<ArtworkOrientation, string> = {
  PORTRAIT: 'orientationPortrait',
  LANDSCAPE: 'orientationLandscape',
  SQUARE: 'orientationSquare',
};

const CATEGORY_KEYS: Record<ArtworkCategory, string> = {
  PAINTING: 'categoryPainting',
  SCULPTURE: 'categorySculpture',
  PHOTOGRAPHY: 'categoryPhotography',
  OTHER: 'categoryOther',
};

interface ArtworkFormProps {
  editing?: ApiArtwork;
  onDone: () => void;
}

export default function ArtworkForm({ editing, onDone }: ArtworkFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [technique, setTechnique] = useState(editing?.technique ?? '');
  const [yearCreated, setYearCreated] = useState(editing?.yearCreated?.toString() ?? '');
  const [heightCm, setHeightCm] = useState(editing?.heightCm?.toString() ?? '');
  const [widthCm, setWidthCm] = useState(editing?.widthCm?.toString() ?? '');
  const [orientation, setOrientation] = useState<ArtworkOrientation>(editing?.orientation ?? 'LANDSCAPE');
  const [category, setCategory] = useState<ArtworkCategory>(editing?.category ?? 'PAINTING');
  const [priceAmount, setPriceAmount] = useState(editing ? String(editing.priceAmount / 100) : '');
  const [currency, setCurrency] = useState<SupportedCurrency>((editing?.currency as SupportedCurrency) ?? 'TRY');
  const [imageUrl, setImageUrl] = useState(editing?.imageUrl ?? '');
  const [error, setError] = useState<string | null>(null);

  const { create, update } = useArtworkMutations();
  const isPending = create.isPending || update.isPending;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      title,
      technique: technique || undefined,
      yearCreated: yearCreated ? Number(yearCreated) : undefined,
      heightCm: Number(heightCm),
      widthCm: Number(widthCm),
      orientation,
      category,
      priceAmount: Math.round(Number(priceAmount) * 100),
      currency,
      imageUrl,
    };

    const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : t('artworkFormError'));

    if (editing) {
      update.mutate({ id: editing.id, updates: payload }, { onSuccess: onDone, onError });
    } else {
      create.mutate(payload, { onSuccess: onDone, onError });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg bg-brand-50 p-6 shadow-sm">
      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('artworkFormTitle')}
        <input
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('artworkFormTechnique')}
        <input
          maxLength={200}
          value={technique}
          onChange={(e) => setTechnique(e.target.value)}
          className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('artworkFormYear')}
        <input
          type="number"
          min={1000}
          max={new Date().getFullYear()}
          value={yearCreated}
          onChange={(e) => setYearCreated(e.target.value)}
          className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('artworkFormHeight')}
          <input
            required
            type="number"
            min={1}
            step="0.1"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('artworkFormWidth')}
          <input
            required
            type="number"
            min={1}
            step="0.1"
            value={widthCm}
            onChange={(e) => setWidthCm(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('artworkFormOrientation')}
        <select
          value={orientation}
          onChange={(e) => setOrientation(e.target.value as ArtworkOrientation)}
          className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        >
          {ORIENTATIONS.map((o) => (
            <option key={o} value={o}>
              {t(ORIENTATION_KEYS[o])}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('artworkFormCategory')}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ArtworkCategory)}
          className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(CATEGORY_KEYS[c])}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('artworkFormPrice')}
          <input
            required
            type="number"
            min={0.01}
            step="0.01"
            value={priceAmount}
            onChange={(e) => setPriceAmount(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-800">
          {t('artworkFormCurrency')}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as SupportedCurrency)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('artworkFormImageUrl')}
        <input
          required
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        />
      </label>

      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {isPending ? t('artworkFormSaving') : editing ? t('artworkFormSubmitUpdate') : t('artworkFormSubmitCreate')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-brand-300 px-3 py-2 text-sm text-brand-700 hover:bg-brand-100"
        >
          {t('artworkFormCancel')}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
