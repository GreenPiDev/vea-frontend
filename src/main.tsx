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

// Her mutasyonun başarı/hata toast'ı burada merkezi olarak tetikleniyor —
// tek tek useMutation çağrı yerlerine onSuccess/onError eklemek yerine.
// Backend'den gelen mesaj varsa (ApiError.message) o gösteriliyor, yoksa
// genel bir metin; ikisi de i18n üzerinden (bu projede sabit UI metni yok).
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      if (mutation.options.meta?.silentToast) return
      toast.success(i18n.t('toastMutationSuccess'))
    },
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.meta?.silentToast) return
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
