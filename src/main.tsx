import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import toast, { Toaster, resolveValue, type Toast } from 'react-hot-toast'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import './index.css'
import i18n from './lib/i18n'
import App from './App.tsx'
import Landing from './pages/Landing.tsx'
import Dashboard from './pages/Dashboard.tsx'
import { AuthProvider } from './lib/auth/AuthContext'
import { ApiError } from './lib/api/client'
import type { ToastMeta } from './lib/api/factory'
import { AlertCircleIcon, CheckIcon, CloseIcon, InfoIcon } from './components/layout/icons'

const TOAST_DURATION_MS = 4000

// bi-frontend'deki (ortak referans) components/ui/toast.tsx ile aynı görsel dil:
// kartın köşesinde büyük silik ikon, alt kenarda otomatik-kapanma ilerleme çubuğu,
// sağ üstte kapatma butonu — tek fark, arka planın gradyan yerine düz "sütlü kahve"
// (brand-100) olması. Konum/animasyon tarafı react-hot-toast'ın kendi yerleşimi
// yerine burada elle sürülüyor (sağdan kayarak giriş/çıkış, bkz. index.css).
function renderToast(t: Toast) {
  const Icon = t.type === 'error' ? AlertCircleIcon : t.type === 'success' ? CheckIcon : InfoIcon
  const duration = t.duration ?? TOAST_DURATION_MS
  // İlerleme çubuğu işlemin sonucunu da taşısın diye success/error'da nötr
  // brand rengi yerine yeşil/kırmızı — projenin diğer yerlerinde zaten
  // success/error için kullanılan aynı green-600/red-600 ikilisi.
  const progressColor =
    t.type === 'error' ? 'bg-red-600/70' : t.type === 'success' ? 'bg-green-600/70' : 'bg-brand-700/70'
  return (
    <div
      role="status"
      className={`group pointer-events-auto relative flex min-h-[4.5rem] w-full max-w-sm items-center gap-3 overflow-hidden rounded-md border border-brand-300 bg-brand-100 px-4 py-5 pr-9 text-sm text-brand-900 shadow-xl ${
        t.visible ? 'toast-slide-in-right' : 'toast-slide-out-right'
      }`}
      style={{
        animationDuration: '0.32s',
        animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        animationFillMode: 'forwards',
      }}
    >
      <Icon className="pointer-events-none absolute -left-5 top-1/2 h-24 w-24 -translate-y-1/2 text-brand-400/40" />
      <p className="relative z-10 flex-1 pl-2 font-medium">{resolveValue(t.message, t)}</p>
      <button
        type="button"
        onClick={() => toast.remove(t.id)}
        className="absolute right-2 top-2 shrink-0 cursor-pointer text-brand-700/70 transition-transform hover:scale-125 hover:text-brand-900"
        aria-label={i18n.t('toastClose')}
      >
        <CloseIcon className="h-5 w-5" />
      </button>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-300/50">
        <span
          className={`block h-full origin-left [animation-fill-mode:forwards] group-hover:[animation-play-state:paused] ${progressColor}`}
          style={{
            animationName: t.visible ? 'toast-progress' : 'none',
            animationDuration: `${duration}ms`,
            animationTimingFunction: 'linear',
          }}
        />
      </span>
    </div>
  )
}

// Her mutasyonun başarı/hata toast'ı burada merkezi olarak tetikleniyor —
// tek tek useMutation çağrı yerlerine onSuccess/onError eklemek yerine. Her
// mutasyon kendi `meta.successKey`/`meta.errorKey` i18n anahtarlarını
// tanımlar (bkz. src/lib/api/factory.ts'teki ToastMeta) — "ne yapıldıysa ona
// dair" bir mesaj çıksın diye backend'in (her zaman İngilizce) hata metni
// yerine bu anahtarlar öncelikli; hiçbiri tanımlı değilse genel bir metne
// düşülür. `meta.silentToast` bir üst akışın ara adımı olan mutasyonları
// (ör. eser oluşturmadan önceki görsel yükleme) tamamen sessize alır.
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      const meta = mutation.options.meta as ToastMeta | undefined
      if (meta?.silentToast) return
      toast.success(i18n.t(meta?.successKey ?? 'toastMutationSuccess'))
    },
    onError: (error, _variables, _context, mutation) => {
      const meta = mutation.options.meta as ToastMeta | undefined
      if (meta?.silentToast) return
      if (meta?.errorKey) {
        toast.error(i18n.t(meta.errorKey))
        return
      }
      const message = error instanceof ApiError ? error.message : i18n.t('toastMutationError')
      toast.error(message)
    },
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          {/* bi-frontend'deki referans toast'la aynı görsel: büyük silik ikon, alt kenarda
              otomatik-kapanma ilerleme çubuğu, sağ üstte kapatma butonu — bkz. renderToast
              yukarıda. Konum sağ üst, giriş/çıkış sağdan kayarak (src/index.css). */}
          <Toaster position="top-right" gutter={12} toastOptions={{ duration: TOAST_DURATION_MS }}>
            {renderToast}
          </Toaster>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/home" element={<App />} />
            <Route path="/exhibition/:id" element={<App />} />
            <Route path="/dashboard/*" element={<Dashboard />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
