import { useNavigate, useParams } from 'react-router-dom';
import { useSuperAdminExhibition } from '../../lib/api/domains/exhibitions';
import ExhibitionPreviewContent from './ExhibitionPreviewContent';

// /dashboard/admin/organizations/:organizationId/exhibitions/:exhibitionId/preview
// — the SUPERADMIN walks through any organization's exhibition in the 3D
// scene, DRAFT and curator-deleted ones included (GET /exhibitions/admin/:id).
// Back returns to the organization's "Sergiler" tab.
export default function AdminExhibitionPreviewPage() {
  const navigate = useNavigate();
  const { organizationId, exhibitionId } = useParams<{ organizationId: string; exhibitionId: string }>();
  const { data, isLoading } = useSuperAdminExhibition(exhibitionId ?? '');

  return (
    <ExhibitionPreviewContent
      detail={data}
      isLoading={isLoading}
      onBack={() => navigate(`/dashboard/admin/organizations/${organizationId}?tab=exhibitions`)}
    />
  );
}
