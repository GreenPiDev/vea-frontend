import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import toast, { Toaster } from 'react-hot-toast'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import './index.css'
import i18n from './lib/i18n'
import App from './App.tsx'
import Dashboard from './pages/Dashboard.tsx'
import { AuthProvider } from './lib/auth/AuthContext'
import { ApiError } from './lib/api/client'
import type { ToastMeta } from './lib/api/factory'

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
          <Toaster position="top-center" />
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<App />} />
            <Route path="/exhibition/:id" element={<App />} />
            <Route path="/dashboard/*" element={<Dashboard />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
