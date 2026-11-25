import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PanelLayout from '../layout/PanelLayout';
import BackLink from '../layout/BackLink';
import KpiCard from '../common/KpiCard';
import GenericTable, { type GenericTableColumn } from '../common/GenericTable';
import Tabs, { TabPanel, type TabItem } from '../common/Tabs';
import { useCuratorNavItems } from './curatorNavItems';
import ArtistDecisionBadge from './ArtistDecisionBadge';
import OfferDetailsPanel from './OfferDetailsPanel';
import { OFFER_STATUS_KEYS, formatAmount } from './offerDisplay';
import { ARTWORK_STATUS_KEYS, formatDate } from './orgDetailFormat';
import {
  artworkOfferStats,
  flattenOffers,
  offerVsPricePercent,
  summarizeArtist,
  type ArtistOfferRow,
} from './orgArtistDetail';
import {
  useMyOrgArtist,
  type ApiArtistDetail,
  type ApiArtistDetailArtwork,
  type ApiArtistDetailOffer,
} from '../../lib/api/domains/organizations';
import type { ArtworkCategory, ArtworkStatus } from '../../lib/api/domains/artworks';
import type { OfferStatus } from '../../lib/api/domains/offers';
import { ApiError } from '../../lib/api/client';

interface OrgArtistDetailPageProps {
  onBack: () => void;
}

type DetailTab = 'artworks' | 'offers';
const LIST_PATH = '/dashboard/organization/artists';

const CATEGORY_KEYS: Record<ArtworkCategory, string> = {
  PAINTING: 'categoryPainting',
  SCULPTURE: 'categorySculpture',
  PHOTOGRAPHY: 'categoryPhotography',
  OTHER: 'categoryOther',
};

const ARTWORK_STATUS_BADGE: Record<ArtworkStatus, string> = {
  DRAFT: 'bg-brand-100 text-brand-700',
  LISTED: 'bg-sky-100 text-sky-800',
  IN_EXHIBITION: 'bg-green-100 text-green-800',
  SOLD: 'bg-amber-100 text-amber-800',
  ARCHIVED: 'bg-brand-200 text-brand-600',
};

const OFFER_STATUS_BADGE: Record<OfferStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ACCEPTED: 'bg-sky-100 text-sky-800',
  PAYMENT_HELD: 'bg-sky-100 text-sky-800',
  DELIVERED: 'bg-sky-100 text-sky-800',
  RELEASED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-brand-200 text-brand-600',
};

const fieldClass =
  'rounded-md border border-brand-300 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-brand-500';

// /dashboard/organization/artists/:artistId — the curator's full view of one
// artist of their gallery, opened from OrgArtistList's row click: profile
// header, KPI row, then tabs (active tab in ?tab= like OrganizationDetailPage)
// — "Eserler" (every artwork with price, offer stats and exhibitions; a row
// expands to that artwork's offers, an offer to its timeline/payment) and
// "Teklifler" (every offer across the portfolio, newest first). Tabs rather
// than stacked collapsibles: the two lists are long and independent, so
// showing one at a time keeps the page short. Everything comes from one
// request (useMyOrgArtist) and is derived client-side (orgArtistDetail.ts),
// so tab switches and filters never refetch.
export default function OrgArtistDetailPage({ onBack }: OrgArtistDetailPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navItems = useCuratorNavItems();
  const { artistId = '' } = useParams<{ artistId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: artist, error, isLoading } = useMyOrgArtist(artistId);

  const activeTab: DetailTab = searchParams.get('tab') === 'offers' ? 'offers' : 'artworks';
  const setTab = (tab: DetailTab) => setSearchParams(tab === 'artworks' ? {} : { tab }, { replace: true });

  const artworks = useMemo(() => artist?.artistProfile?.artworks ?? [], [artist]);
  const summary = useMemo(() => summarizeArtist(artworks), [artworks]);
  const offers = useMemo(() => flattenOffers(artworks), [artworks]);
  const notFound = error instanceof ApiError && error.status === 404;

  const tabs: TabItem<DetailTab>[] = [
    { id: 'artworks', label: t('orgArtistTabArtworks', { count: summary.artworkCount }) },
    { id: 'offers', label: t('orgArtistTabOffers', { count: summary.offerCount }) },
  ];

  return (
    <PanelLayout
      title={t('curatorPanelTitle')}
      navItems={navItems}
      activeSectionId="artists"
      onSelectSection={(id) => navigate(`/dashboard/organization/${id}`)}
      onBack={onBack}
      fullWidth
    >
      <div className="flex flex-col gap-6">
        <BackLink to={LIST_PATH} />

        {notFound ? (
          <p className="text-sm text-brand-200">{t('orgArtistNotFound')}</p>
        ) : isLoading || !artist ? (
          <p className="text-sm text-brand-200">{t('listLoading')}</p>
        ) : (
          <>
            <ArtistHeader artist={artist} salesByCurrency={summary.salesByCurrency} />

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard label={t('orgArtistKpiArtworks')} value={summary.artworkCount} />
              <KpiCard label={t('orgArtistKpiActiveArtworks')} value={summary.activeArtworkCount} />
              <KpiCard label={t('orgArtistKpiOffers')} value={summary.offerCount} />
              <KpiCard label={t('orgArtistKpiPendingOffers')} value={summary.pendingOfferCount} />
              <KpiCard label={t('orgArtistKpiSold')} value={summary.soldArtworkCount} />
              <KpiCard label={t('orgArtistKpiViews')} value={summary.totalViews} />
            </div>

            {artist.artistProfile ? (
              <div>
                <Tabs tabs={tabs} activeId={activeTab} onChange={setTab} idPrefix="org-artist" />
                <TabPanel idPrefix="org-artist" tabId={activeTab}>
                  {activeTab === 'artworks' && <ArtworksTab artworks={artworks} />}
                  {activeTab === 'offers' && <OffersTab offers={offers} />}
                </TabPanel>
              </div>
            ) : (
              <p className="rounded-lg bg-brand-50 p-4 text-sm text-brand-700 shadow-sm">
                {t('orgDetailArtistNoProfile')}
              </p>
            )}
          </>
        )}
      </div>
    </PanelLayout>
  );
}

function ArtistHeader({
  artist,
  salesByCurrency,
}: {
  artist: ApiArtistDetail;
  salesByCurrency: { currency: string; amount: number }[];
}) {
  const { t, i18n } = useTranslation();
  const profile = artist.artistProfile;
  const displayName = profile?.displayName ?? artist.name ?? artist.email;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex gap-4 rounded-lg bg-brand-50 p-5 shadow-sm lg:col-span-2">
        <div
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xl font-semibold text-white"
        >
          {initials}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-brand-900">{displayName}</h2>
            {profile?.verified && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                {t('orgArtistVerified')}
              </span>
            )}
            {!profile && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {t('artistProfilePending')}
              </span>
            )}
          </div>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <InfoItem label={t('orgArtistEmail')} value={artist.email} />
            <InfoItem label={t('orgArtistPhone')} value={artist.phone ?? '—'} />
            <InfoItem label={t('orgArtistInstitution')} value={profile?.institutionName ?? '—'} />
            <InfoItem label={t('orgArtistJoined')} value={formatDate(artist.createdAt, i18n.language)} />
          </dl>
          {profile?.bio && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{t('orgArtistBio')}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-brand-800">{profile.bio}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg bg-brand-50 p-5 shadow-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-brand-600">{t('orgArtistKpiSales')}</span>
        {salesByCurrency.length === 0 ? (
          <span className="text-2xl font-semibold text-brand-900">–</span>
        ) : (
          salesByCurrency.map((sale) => (
            <span key={sale.currency} className="text-2xl font-semibold tabular-nums text-brand-900">
              {formatAmount(sale.amount, sale.currency)}
            </span>
          ))
        )}
        <span className="text-xs text-brand-500">{t('orgArtistSalesHint')}</span>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-brand-600">{label}:</dt>
      <dd className="truncate text-brand-900" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

function OfferVsPrice({ amount, price }: { amount: number; price: number }) {
  const percent = offerVsPricePercent(amount, price);
  if (percent === null) return null;
  const tone = percent < 0 ? 'text-red-700' : percent > 0 ? 'text-green-700' : 'text-brand-500';
  return <span className={`text-xs tabular-nums ${tone}`}>{percent > 0 ? `+${percent}%` : `${percent}%`}</span>;
}

function ArtworksTab({ artworks }: { artworks: ApiArtistDetailArtwork[] }) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ArtworkStatus | ''>('');
  const [expandedArtworkId, setExpandedArtworkId] = useState<string | null>(null);
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(i18n.language);
    return artworks.filter(
      (artwork) =>
        (!status || artwork.status === status) &&
        (!needle || artwork.title.toLocaleLowerCase(i18n.language).includes(needle)),
    );
  }, [artworks, search, status, i18n.language]);

  const offerColumns: GenericTableColumn<ApiArtistDetailOffer & { priceAmount: number }>[] = [
    {
      key: 'date',
      header: t('orgDetailOfferColDate'),
      render: (offer) => <span className="whitespace-nowrap text-brand-700">{formatDate(offer.createdAt, i18n.language)}</span>,
    },
    {
      key: 'buyer',
      header: t('orgOfferBuyer'),
      render: (offer) => <BuyerCell buyer={offer.buyer} />,
    },
    {
      key: 'amount',
      header: t('orgOfferAmount'),
      render: (offer) => (
        <div className="flex flex-col">
          <span className="whitespace-nowrap tabular-nums text-brand-900">{formatAmount(offer.amount, offer.currency)}</span>
          <OfferVsPrice amount={offer.amount} price={offer.priceAmount} />
        </div>
      ),
    },
    {
      key: 'status',
      header: t('orgOfferStatus'),
      render: (offer) => <Badge className={OFFER_STATUS_BADGE[offer.status]}>{t(OFFER_STATUS_KEYS[offer.status])}</Badge>,
    },
    {
      key: 'decision',
      header: t('orgOfferArtistDecision'),
      render: (offer) => <ArtistDecisionBadge decision={offer.artistDecision} />,
    },
  ];

  const columns: GenericTableColumn<ApiArtistDetailArtwork>[] = [
    {
      key: 'title',
      header: t('orgDetailArtworkColTitle'),
      render: (artwork) => (
        <div className="flex items-center gap-3">
          <img src={artwork.imageUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded object-cover" />
          <div className="min-w-0">
            <p className="font-medium text-brand-900">{artwork.title}</p>
            <p className="text-xs text-brand-500">
              {[artwork.technique, artwork.yearCreated].filter((part) => part !== null && part !== '').join(' · ') ||
                artwork.artistDisplayName}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: t('orgArtistColCategory'),
      render: (artwork) => (
        <div className="flex flex-col text-brand-700">
          <span>{t(CATEGORY_KEYS[artwork.category])}</span>
          <span className="whitespace-nowrap text-xs text-brand-500">
            {t('orgArtistDimensions', { height: artwork.heightCm, width: artwork.widthCm })}
          </span>
        </div>
      ),
    },
    {
      key: 'price',
      header: t('orgDetailArtworkColPrice'),
      render: (artwork) => (
        <div className="flex flex-col">
          <span className="whitespace-nowrap tabular-nums text-brand-900">{formatAmount(artwork.priceAmount, artwork.currency)}</span>
          {artwork.maxDiscountPercent !== null && (
            <span className="whitespace-nowrap text-xs text-brand-500">
              {t('orgArtistMaxDiscount', { percent: artwork.maxDiscountPercent })}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('orgDetailArtworkColStatus'),
      render: (artwork) => <Badge className={ARTWORK_STATUS_BADGE[artwork.status]}>{t(ARTWORK_STATUS_KEYS[artwork.status])}</Badge>,
    },
    {
      key: 'offers',
      header: t('orgDetailArtworkColOffers'),
      render: (artwork) => {
        const stats = artworkOfferStats(artwork);
        return (
          <div className="flex items-center gap-2">
            <span className="tabular-nums text-brand-700">{stats.count}</span>
            {stats.pending > 0 && (
              <Badge className="bg-amber-100 text-amber-800">{t('orgDetailArtistPendingOffers', { count: stats.pending })}</Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'highest',
      header: t('orgArtistColHighestOffer'),
      render: (artwork) => {
        const { highest } = artworkOfferStats(artwork);
        if (!highest) return <span className="text-xs text-brand-500">—</span>;
        return (
          <div className="flex flex-col">
            <span className="whitespace-nowrap tabular-nums text-brand-900">{formatAmount(highest.amount, highest.currency)}</span>
            <OfferVsPrice amount={highest.amount} price={artwork.priceAmount} />
          </div>
        );
      },
    },
    {
      key: 'exhibitions',
      header: t('orgArtistColExhibitions'),
      render: (artwork) => {
        const live = artwork.exhibitionLinks.filter((link) => !link.exhibition.deletedAt);
        if (live.length === 0) return <span className="text-xs text-brand-500">—</span>;
        return (
          <ul className="flex flex-col gap-0.5">
            {live.map(({ exhibition }) => (
              <li key={exhibition.id} className="text-xs text-brand-700">
                {exhibition.title}
              </li>
            ))}
          </ul>
        );
      },
    },
    {
      key: 'views',
      header: t('orgArtistColViews'),
      render: (artwork) => <span className="tabular-nums text-brand-700">{artwork._count.visitEvents}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('orgArtistArtworkSearch')}
          aria-label={t('orgArtistArtworkSearch')}
          className={`${fieldClass} min-w-56 flex-1 sm:max-w-sm`}
        />
        <select
          aria-label={t('orgDetailArtworkColStatus')}
          value={status}
          onChange={(e) => setStatus(e.target.value as ArtworkStatus | '')}
          className={fieldClass}
        >
          <option value="">{t('listFilterAll', { label: t('orgDetailArtworkColStatus') })}</option>
          {(Object.keys(ARTWORK_STATUS_KEYS) as ArtworkStatus[]).map((value) => (
            <option key={value} value={value}>
              {t(ARTWORK_STATUS_KEYS[value])}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-brand-300" aria-live="polite">
          {t('listResultCount', { count: visible.length })}
        </span>
      </div>

      <GenericTable
        columns={columns}
        data={visible}
        getRowKey={(artwork) => artwork.id}
        emptyMessage={artworks.length === 0 ? t('orgDetailArtistNoArtworks') : t('listNoResults')}
        expandable={{
          isExpanded: (artwork) => expandedArtworkId === artwork.id,
          onToggle: (artwork) => {
            setExpandedArtworkId(expandedArtworkId === artwork.id ? null : artwork.id);
            setExpandedOfferId(null);
          },
          renderExpanded: (artwork) =>
            artwork.offers.length === 0 ? (
              <p className="text-sm text-brand-600">{t('orgDetailOfferEmpty')}</p>
            ) : (
              <GenericTable
                columns={offerColumns}
                data={artwork.offers.map((offer) => ({ ...offer, priceAmount: artwork.priceAmount }))}
                getRowKey={(offer) => offer.id}
                emptyMessage={t('orgDetailOfferEmpty')}
                expandable={{
                  isExpanded: (offer) => expandedOfferId === offer.id,
                  onToggle: (offer) => setExpandedOfferId(expandedOfferId === offer.id ? null : offer.id),
                  renderExpanded: (offer) => <OfferDetailsPanel offer={offer} />,
                }}
              />
            ),
        }}
      />
    </div>
  );
}

function BuyerCell({ buyer }: { buyer: ApiArtistDetailOffer['buyer'] }) {
  return (
    <div className="flex flex-col">
      {buyer.name && <span className="text-brand-900">{buyer.name}</span>}
      <span className={buyer.name ? 'text-xs text-brand-500' : 'text-brand-700'}>{buyer.email}</span>
    </div>
  );
}

function OffersTab({ offers }: { offers: ArtistOfferRow[] }) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<OfferStatus | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const visible = useMemo(() => (status ? offers.filter((offer) => offer.status === status) : offers), [offers, status]);

  const columns: GenericTableColumn<ArtistOfferRow>[] = [
    {
      key: 'date',
      header: t('orgDetailOfferColDate'),
      render: (offer) => (
        <span className="whitespace-nowrap text-brand-700">
          {new Date(offer.createdAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      ),
    },
    {
      key: 'artwork',
      header: t('orgOfferArtwork'),
      render: (offer) => (
        <div className="flex items-center gap-3">
          <img src={offer.artwork.imageUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
          <div className="min-w-0">
            <p className="font-medium text-brand-900">{offer.artwork.title}</p>
            <p className="whitespace-nowrap text-xs text-brand-500">
              {t('orgArtistAskingPrice', { price: formatAmount(offer.artwork.priceAmount, offer.artwork.currency) })}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'buyer',
      header: t('orgOfferBuyer'),
      render: (offer) => <BuyerCell buyer={offer.buyer} />,
    },
    {
      key: 'amount',
      header: t('orgOfferAmount'),
      render: (offer) => (
        <div className="flex flex-col">
          <span className="whitespace-nowrap tabular-nums text-brand-900">{formatAmount(offer.amount, offer.currency)}</span>
          <OfferVsPrice amount={offer.amount} price={offer.artwork.priceAmount} />
        </div>
      ),
    },
    {
      key: 'status',
      header: t('orgOfferStatus'),
      render: (offer) => <Badge className={OFFER_STATUS_BADGE[offer.status]}>{t(OFFER_STATUS_KEYS[offer.status])}</Badge>,
    },
    {
      key: 'decision',
      header: t('orgOfferArtistDecision'),
      render: (offer) => <ArtistDecisionBadge decision={offer.artistDecision} />,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('orgOfferStatus')}
          value={status}
          onChange={(e) => setStatus(e.target.value as OfferStatus | '')}
          className={fieldClass}
        >
          <option value="">{t('listFilterAll', { label: t('orgOfferStatus') })}</option>
          {(Object.keys(OFFER_STATUS_KEYS) as OfferStatus[]).map((value) => (
            <option key={value} value={value}>
              {t(OFFER_STATUS_KEYS[value])}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-brand-300" aria-live="polite">
          {t('listResultCount', { count: visible.length })}
        </span>
      </div>

      <GenericTable
        columns={columns}
        data={visible}
        getRowKey={(offer) => offer.id}
        emptyMessage={offers.length === 0 ? t('orgArtistNoOffers') : t('listNoResults')}
        expandable={{
          isExpanded: (offer) => expandedId === offer.id,
          onToggle: (offer) => setExpandedId(expandedId === offer.id ? null : offer.id),
          renderExpanded: (offer) => <OfferDetailsPanel offer={offer} />,
        }}
      />
    </div>
  );
}
