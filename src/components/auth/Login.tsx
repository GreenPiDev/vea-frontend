import { useState, type FormEvent } from 'react';
import { useRequestCode, useVerifyCode } from '../../lib/api/domains/auth';
import { useAuth } from '../../lib/auth/AuthContext';
import { ApiError } from '../../lib/api/client';

type Step = 'email' | 'code';

interface LoginProps {
  onSuccess?: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const requestCode = useRequestCode();
  const verifyCode = useVerifyCode();
  const { login } = useAuth();

  function handleRequestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    requestCode.mutate(email, {
      onSuccess: () => setStep('code'),
      onError: (err) => setError(err instanceof ApiError ? err.message : 'Kod gönderilemedi'),
    });
  }

  function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    verifyCode.mutate(
      { email, code },
      {
        onSuccess: ({ accessToken }) => {
          login(accessToken);
          onSuccess?.();
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : 'Kod doğrulanamadı'),
      },
    );
  }

  return (
    <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-sm">
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Sanal Sergi</h1>
        <p className="mb-6 text-sm text-neutral-500">
          {step === 'email' ? 'E-posta adresinizle giriş yapın' : `${email} adresine gönderilen kodu girin`}
        </p>

        {step === 'email' ? (
          <form onSubmit={handleRequestCode} className="flex flex-col gap-3">
            <input
              type="email"
              required
              autoFocus
              placeholder="ornek@eposta.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
            <button
              type="submit"
              disabled={requestCode.isPending}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {requestCode.isPending ? 'Gönderiliyor…' : 'Kod Gönder'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
            <input
              type="text"
              inputMode="numeric"
              required
              autoFocus
              maxLength={6}
              placeholder="6 haneli kod"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="rounded-md border border-neutral-300 px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-neutral-500"
            />
            <button
              type="submit"
              disabled={verifyCode.isPending || code.length !== 6}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {verifyCode.isPending ? 'Doğrulanıyor…' : 'Giriş Yap'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
              className="text-xs text-neutral-500 underline"
            >
              Farklı e-posta kullan
            </button>
          </form>
        )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
