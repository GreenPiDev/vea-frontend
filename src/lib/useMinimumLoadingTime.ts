import { useEffect, useRef, useState } from 'react';

// `isLoading` gerçek veri bekleniyor mu diye düşse bile, LoadingScreen'i en
// az `minMs` süre ekranda tutar — Login.tsx sonrası gibi yerlerde kısa bir
// yanıt anında ekranın "çakması" yerine her zaman akıcı/kasıtlı bir geçiş
// hissi versin diye (bkz. AuthBar.tsx'teki kullanım).
export function useMinimumLoadingTime(isLoading: boolean, minMs: number): boolean {
  const [show, setShow] = useState(isLoading);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      startedAtRef.current = Date.now();
      setShow(true);
      return;
    }

    if (startedAtRef.current === null) {
      setShow(false);
      return;
    }

    const remainingMs = minMs - (Date.now() - startedAtRef.current);
    if (remainingMs <= 0) {
      startedAtRef.current = null;
      setShow(false);
      return;
    }

    const timeout = setTimeout(() => {
      startedAtRef.current = null;
      setShow(false);
    }, remainingMs);
    return () => clearTimeout(timeout);
  }, [isLoading, minMs]);

  return show;
}
