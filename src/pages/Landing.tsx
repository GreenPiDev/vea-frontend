import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Site'ye ilk giren ziyaretçinin gördüğü karşılama ekranı — doğrudan
// header+sergi kartları ekranına (/home) düşmek yerine, önce marka/vizyonu
// anlatan tek bir CTA ile o ekrana yönlendiriyor.
// landing-hero.jpg: Louvre Grande Galerie (Cheng-en Cheng, Wikimedia Commons,
// CC BY-SA 2.0) — alt köşedeki atıf bu lisansın gerektirdiği tek koşul.
export default function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div
      className="fixed inset-0 flex flex-col items-start justify-center gap-6 bg-cover bg-center px-10 text-left sm:px-16 lg:px-24"
      style={{
        backgroundImage:
          // Metnin oturduğu sol taraf sağdan daha koyu/kapalı olsun diye yatay bir
          // karartma eklendi — düz üst/alt gradyan tek başına sola yaslı başlığın
          // kontrastını garanti etmiyordu.
          "linear-gradient(90deg, rgba(10, 7, 5, 0.9) 0%, rgba(15, 10, 6, 0.55) 55%, rgba(15, 10, 6, 0.35) 100%), url('/landing-hero.jpg')",
      }}
    >
      <span className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-200">
        {t("headerBrandTitle")}
      </span>
      <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] text-white sm:text-6xl lg:text-7xl">
        {t("landingTitle")}
      </h1>
      <p className="max-w-lg text-base text-brand-100/80 sm:text-lg">{t("landingSubtitle")}</p>
      <button
        onClick={() => navigate("/home")}
        className="mt-4 rounded-full bg-brand-600 px-8 py-3 text-base font-semibold text-white shadow-lg transition-colors hover:bg-brand-500"
      >
        {t("landingEnterCta")}
      </button>
      <a
        href="https://commons.wikimedia.org/wiki/File:Grande_Galerie,_Louvre_Museum,_25_September_2019_01.jpg"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-2 right-3 text-[10px] text-white/40 hover:text-white/70"
      >
        {t("landingPhotoCredit")}
      </a>
    </div>
  );
}
