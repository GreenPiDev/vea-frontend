import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../../lib/currencies';
import {
  useArtworkMutations,
  useUploadArtworkImage,
  type ApiArtwork,
  type ArtworkCategory,
  type ArtworkOrientation,
} from '../../lib/api/domains/artworks';
import { ApiError } from '../../lib/api/client';

const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

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
  const [framed, setFramed] = useState(editing?.framed ?? false);
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(
    editing?.maxDiscountPercent != null ? String(editing.maxDiscountPercent) : ''
  );
  const [category, setCategory] = useState<ArtworkCategory>(editing?.category ?? 'PAINTING');
  const [priceAmount, setPriceAmount] = useState(editing ? String(editing.priceAmount / 100) : '');
  const [currency, setCurrency] = useState<SupportedCurrency>((editing?.currency as SupportedCurrency) ?? 'TRY');
  const [imageUrl] = useState(editing?.imageUrl ?? '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState(editing?.imageUrl ?? '');
  const [error, setError] = useState<string | null>(null);

  const { create, update } = useArtworkMutations();
  const uploadImage = useUploadArtworkImage();
  const isPending = create.isPending || update.isPending || uploadImage.isPending;

  // Object URL for the local file preview — must be revoked on change/unmount
  // or the blob it points at leaks for the tab's lifetime.
  useEffect(() => {
    if (!imageFile) return;
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      setError(t('artworkFormImageTypeError'));
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError(t('artworkFormImageSizeError'));
      return;
    }
    setImageFile(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : t('artworkFormError'));

    let finalImageUrl = imageUrl;
    if (imageFile) {
      try {
        const result = await uploadImage.mutateAsync(imageFile);
        finalImageUrl = result.url;
      } catch (err) {
        onError(err);
        return;
      }
    }
    if (!finalImageUrl) {
      setError(t('artworkFormImageRequired'));
      return;
    }

    const payload = {
      title,
      technique: technique || undefined,
      yearCreated: yearCreated ? Number(yearCreated) : undefined,
      heightCm: Number(heightCm),
      widthCm: Number(widthCm),
      orientation,
      framed,
      maxDiscountPercent: maxDiscountPercent ? Number(maxDiscountPercent) : undefined,
      category,
      priceAmount: Math.round(Number(priceAmount) * 100),
      currency,
      imageUrl: finalImageUrl,
    };

    if (editing) {
      update.mutate({ id: editing.id, updates: payload }, { onSuccess: onDone, onError });
    } else {
      create.mutate(payload, { onSuccess: onDone, onError });
    }
  }

  // Same Math.ceil(priceAmount * (1 - pct/100)) minor-unit formula
  // OffersService.create enforces server-side — shown live here so the
  // artist sees what floor they're setting, same idea as
  // ArtworkDetailCard.tsx's buyer-facing minimum-amount warning.
  const priceMajor = Number(priceAmount);
  const discountPct = Number(maxDiscountPercent);
  const minOfferLabel =
    maxDiscountPercent && priceAmount && !Number.isNaN(priceMajor) && !Number.isNaN(discountPct)
      ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(
          Math.ceil(priceMajor * 100 * (1 - discountPct / 100)) / 100
        )
      : null;

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

      <div className="flex flex-col gap-1 text-sm text-brand-800">
        <span>{t('artworkFormFramed')}</span>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={framed} onChange={() => setFramed(true)} />
            {t('artworkFormFramedYes')}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={!framed} onChange={() => setFramed(false)} />
            {t('artworkFormFramedNo')}
          </label>
        </div>
      </div>

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
        {t('artworkFormMaxDiscount')}
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={maxDiscountPercent}
          onChange={(e) => setMaxDiscountPercent(e.target.value)}
          placeholder={t('artworkFormMaxDiscountPlaceholder')}
          className="w-40 rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
        />
        {minOfferLabel && <span className="text-xs text-brand-600">{t('artworkFormMinOfferHint', { amount: minOfferLabel })}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-800">
        {t('artworkFormImage')}
        <input
          type="file"
          accept={ALLOWED_IMAGE_MIME_TYPES.join(',')}
          onChange={handleFileChange}
          className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none file:mr-3 file:rounded file:border-0 file:bg-brand-100 file:px-3 file:py-1 file:text-brand-800 focus:border-brand-500"
        />
        {uploadImage.isPending && <span className="text-xs text-brand-600">{t('artworkFormImageUploading')}</span>}
        {imagePreview && (
          <img src={imagePreview} alt="" className="mt-2 h-32 w-32 rounded-md object-cover" />
        )}
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
