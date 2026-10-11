import { useTranslation } from 'react-i18next';

interface LoadingScreenProps {
  /** Varsayılan ("loadingDefaultMessage") yerine gösterilecek özel metin —
   * örn. girişten sonra ("loadingAfterLoginMessage") veya bir eser
   * kaydedilirken ("artworkFormSaving") farklı bir mesaj geçmek için. */
  message?: string;
}

// Her tam ekran bekleme anında (giriş sonrası, sergiye/önizlemeye girişte,
// veri ağırlıklı panel sayfalarında) tek bir görsel dil kullanmak için
// paylaşılan bileşen — App.tsx/Dashboard.tsx/ExhibitionPreviewPage.tsx vb.
// önceden kendi `.loading-indicator` spinner'larını kullanıyordu.
export default function LoadingScreen({ message }: LoadingScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="animate-loading-fade-in fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 bg-brand-950/95 backdrop-blur-sm">
      <img
        src="/loading-state-logo.png"
        alt={t('loadingLogoAlt')}
        className="animate-loading-bounce h-44 w-44 object-contain brightness-0 invert drop-shadow-lg"
      />
      <div className="flex flex-col items-center gap-3">
        <p className="text-xl font-medium tracking-wide text-brand-100">
          {message ?? t('loadingDefaultMessage')}
        </p>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-300 [animation-delay:-0.3s]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-300 [animation-delay:-0.15s]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-300" />
        </div>
      </div>
    </div>
  );
}
