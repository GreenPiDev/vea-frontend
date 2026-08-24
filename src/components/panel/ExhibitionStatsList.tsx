import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyExhibitions, useExhibitionStats } from '../../lib/api/domains/exhibitions';

// Curator's org-wide analytics: total (all-time) visitors per exhibition,
// each expandable to that exhibition's per-artwork view breakdown — kept
// collapsed by default and fetched lazily on expand (useExhibitionStats is
// called once here, for whichever single exhibition is currently expanded,
// not per-row — accordion-style, only one open at a time). Collapsible is
// deliberate here (unlike ArtistStatsTable's flat list): a curator can have
// many exhibitions, each with many artworks, and a single un-nested table
// mixing every exhibition's paintings together would be unreadable.
export default function ExhibitionStatsList() {
  const { t } = useTranslation();
  const { data: exhibitions, isLoading } = useMyExhibitions();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: stats, isLoading: statsLoading } = useExhibitionStats(expandedId ?? '');

  if (isLoading) return null;

  if (!exhibitions || exhibitions.length === 0) {
    return <p className="text-sm text-brand-200">{t('statsEmpty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {exhibitions.map((exhibition) => {
        const isExpanded = expandedId === exhibition.id;
        return (
          <li key={exhibition.id} className="rounded-md bg-brand-50 shadow-sm">
            <button
              onClick={() => setExpandedId(isExpanded ? null : exhibition.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm"
            >
              <span className="font-medium text-brand-900">{exhibition.title}</span>
              <span className="text-brand-600">{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
              <div className="border-t border-brand-200 px-4 py-3">
                {statsLoading && <p className="text-xs text-brand-500">…</p>}
                {stats && (
                  <>
                    <p className="mb-2 text-xs font-medium text-brand-700">
                      {t('statsTotalVisitors', { count: stats.totalVisitors })}
                    </p>
                    {stats.artworks.length === 0 ? (
                      <p className="text-xs text-brand-500">{t('statsEmpty')}</p>
                    ) : (
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-xs uppercase tracking-wide text-brand-600">
                            <th className="py-1 font-medium">{t('artistStatsArtwork')}</th>
                            <th className="py-1 font-medium">{t('statsArtworkViews')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.artworks.map((artwork) => (
                            <tr key={artwork.artworkId}>
                              <td className="py-1 text-brand-900">{artwork.title}</td>
                              <td className="py-1 text-brand-900">{artwork.viewCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
