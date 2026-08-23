import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useRequestCode, useVerifyCode } from '../../lib/api/domains/auth';
import { useAuth } from '../../lib/auth/AuthContext';
import { ApiError } from '../../lib/api/client';

type Step = 'email' | 'code';

interface LoginProps {
  onSuccess?: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const requestCode = useRequestCode();
  const verifyCode = useVerifyCode();
  const { login } = useAuth();

  // The backend's raw ApiError.message is normally fine to surface as-is
  // (it's already a short, specific sentence — see e.g. offer creation
  // errors in ArtworkDetailCard.tsx), but a 429 from Nest's ThrottlerGuard
  // comes back as the framework's internal exception name ("ThrottlerException:
  // Too Many Requests"), which isn't something a visitor should ever see.
  function getErrorMessage(err: unknown, fallbackKey: string): string {
    if (err instanceof ApiError) {
      if (err.status === 429) return t('authErrorTooManyRequests');
      return err.message;
    }
    return t(fallbackKey);
  }

  function handleRequestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    requestCode.mutate(email, {
      onSuccess: () => setStep('code'),
      onError: (err) => setError(getErrorMessage(err, 'authErrorSendFailed')),
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
        onError: (err) => setError(getErrorMessage(err, 'authErrorVerifyFailed')),
      },
    );
  }

  return (
    <div className="w-full max-w-sm rounded-lg bg-brand-50 p-8 shadow-sm">
      <h1 className="mb-1 text-xl font-semibold text-brand-900">{t('authTitle')}</h1>
      <p className="mb-6 text-sm text-brand-600">
        {step === 'email' ? t('authSubtitleEmail') : t('authSubtitleCode', { email })}
      </p>

      {step === 'email' ? (
        <form onSubmit={handleRequestCode} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoFocus
            placeholder={t('authEmailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={requestCode.isPending}
            className="rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {requestCode.isPending ? t('authSendingCode') : t('authSendCode')}
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
            placeholder={t('authCodePlaceholder')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-center text-lg tracking-widest text-brand-900 outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={verifyCode.isPending || code.length !== 6}
            className="rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {verifyCode.isPending ? t('authVerifyingCode') : t('authLogin')}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
            className="text-xs text-brand-600 underline"
          >
            {t('authUseDifferentEmail')}
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
