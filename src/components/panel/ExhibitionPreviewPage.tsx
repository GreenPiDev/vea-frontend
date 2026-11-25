import { useNavigate, useParams } from 'react-router-dom';
import { useOwnExhibition } from '../../lib/api/domains/exhibitions';
import ExhibitionPreviewContent from './ExhibitionPreviewContent';

// /dashboard/organization/exhibitions/preview/:exhibitionId — lets a curator
// walk through their own exhibition in the real 3D scene before publishing
// it (DRAFT exhibitions 404 on the public GET /exhibitions/:id path, so this
// uses useOwnExhibition/GET /exhibitions/mine/:id instead, same owner-only
// endpoint ExhibitionArtworkPlacement.tsx already relies on). Rendering
// lives in ExhibitionPreviewContent.tsx, shared with the SUPERADMIN preview.
export default function ExhibitionPreviewPage() {
  const navigate = useNavigate();
  const { exhibitionId } = useParams<{ exhibitionId: string }>();
  const { data, isLoading } = useOwnExhibition(exhibitionId ?? '');

  return (
    <ExhibitionPreviewContent
      detail={data}
      isLoading={isLoading}
      onBack={() => navigate('/dashboard/organization/exhibitions')}
    />
  );
}
