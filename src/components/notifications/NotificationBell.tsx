import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
  type ApiNotification,
} from '../../lib/api/domains/notifications';
import { BellIcon } from '../layout/icons';

// Renders a notification's message from its (type, payload) — the backend
// never stores a pre-rendered string (see Notification model's comment),
// so every event type this app knows about gets mapped here. Adding a new
// notification-producing feature elsewhere only needs a new case here, not
// a schema/gateway change (see vea-api's NotificationsService).
function renderMessage(n: ApiNotification, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const payload = n.payload;
  switch (n.type) {
    case 'OFFER_CREATED': {
      const amount = new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: String(payload.currency ?? 'TRY'),
      }).format(Number(payload.amount ?? 0) / 100);
      return t('notifOfferCreated', { artworkTitle: payload.artworkTitle, amount });
    }
    case 'OFFER_DECISION': {
      const key = payload.decision === 'APPROVED' ? 'notifOfferDecisionApproved' : 'notifOfferDecisionRejected';
      return t(key, { artworkTitle: payload.artworkTitle });
    }
    case 'ARTWORK_REMOVAL_REQUESTED':
      return t('notifRemovalRequested', {
        artworkTitle: payload.artworkTitle,
        exhibitionTitle: payload.exhibitionTitle,
      });
    case 'ARTWORK_REMOVAL_DECIDED': {
      const key =
        payload.decision === 'APPROVED' ? 'notifRemovalDecisionApproved' : 'notifRemovalDecisionRejected';
      return t(key, { artworkTitle: payload.artworkTitle });
    }
    default:
      return n.type;
  }
}

interface NotificationBellProps {
  /** Mirrors Header's transparent-at-top vs. scrolled "milky coffee" state —
   * the icon is brand-700 by default, which disappears against the
   * transparent header's dark backdrop, so it needs to lighten to white
   * at the top the same way the rest of the header row does. */
  atTop?: boolean;
}

export default function NotificationBell({ atTop }: NotificationBellProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: notifications } = useNotifications();
  const { data: unreadCount } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const count = unreadCount?.count ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('notificationsTitle')}
        className={`relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors duration-300 ${
          atTop ? 'text-white hover:bg-white/15' : 'text-brand-700 hover:bg-brand-100'
        }`}
      >
        <BellIcon />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] rounded-lg bg-white shadow-lg ring-1 ring-brand-200">
            <div className="flex items-center justify-between border-b border-brand-100 px-4 py-2">
              <span className="text-sm font-semibold text-brand-900">{t('notificationsTitle')}</span>
              {count > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-xs text-brand-600 underline hover:text-brand-900"
                >
                  {t('notificationsMarkAllRead')}
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {(!notifications || notifications.length === 0) && (
                <p className="px-4 py-6 text-center text-sm text-brand-600">{t('notificationsEmpty')}</p>
              )}
              <ul>
                {notifications?.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => !n.readAt && markRead.mutate(n.id)}
                      className={`block w-full px-4 py-3 text-left text-sm ${
                        n.readAt ? 'text-brand-600' : 'bg-brand-50 font-medium text-brand-900'
                      } hover:bg-brand-100`}
                    >
                      {renderMessage(n, t)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
