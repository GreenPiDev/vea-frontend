import { useTranslation } from 'react-i18next';
import { useArtistStats } from '../../lib/api/domains/artworks';

// The artist's own view-count analytics — flat, no collapsible needed (one
// row per artwork, nothing nested to hide). Only ever shows this artist's
// own numbers, even for the exhibition's total visitor count (that's
// public/aggregate, not another artist's private data) — but never another
// artist's artwork-level view counts, matching the same visibility
// boundary as the offers feature (ArtistOfferTable.tsx).
export default function ArtistStatsTable() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useArtistStats();

  if (isLoading) return null;

  if (!stats || stats.length === 0) {
    return <p className="text-sm text-brand-200">{t('statsEmpty')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-brand-50 shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-brand-200 text-xs uppercase tracking-wide text-brand-600">
            <th className="px-4 py-3 font-medium">{t('artistStatsArtwork')}</th>
            <th className="px-4 py-3 font-medium">{t('artistStatsViews')}</th>
            <th className="px-4 py-3 font-medium">{t('artistStatsExhibition')}</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((row) => (
            <tr key={row.artworkId} className="border-b border-brand-100 last:border-0">
              <td className="px-4 py-3 font-medium text-brand-900">{row.title}</td>
              <td className="px-4 py-3 text-brand-900">{row.viewCount}</td>
              <td className="px-4 py-3 text-brand-700">
                {row.exhibition ? (
                  <>
                    {row.exhibition.title}
                    <span className="ml-1 text-xs text-brand-500">
                      ({t('statsTotalVisitors', { count: row.exhibition.totalVisitors })})
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-brand-500">{t('artistStatsNoExhibition')}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
