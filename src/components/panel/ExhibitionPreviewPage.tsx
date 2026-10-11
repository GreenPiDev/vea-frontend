import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adaptApiExhibition } from '../3d/backendAdapter';
import { useOwnExhibition } from '../../lib/api/domains/exhibitions';
import { useMinimumLoadingTime, GALLERY_SCENE_MIN_LOADING_MS } from '../../lib/useMinimumLoadingTime';
import ExhibitionPreviewScene from './ExhibitionPreviewScene';
import '../../App.css';

// /dashboard/organization/exhibitions/preview/:exhibitionId — lets a curator
// walk through their own exhibition in the real 3D scene before publishing
// it (DRAFT exhibitions 404 on the public GET /exhibitions/:id path, so this
// uses useOwnExhibition/GET /exhibitions/mine/:id instead, same owner-only
// endpoint ExhibitionArtworkPlacement.tsx already relies on — its Prisma
// include already carries artworkLinks, so adaptApiExhibition works
// unmodified). The actual rendering (canvas, instructions, HUD) lives in
// ExhibitionPreviewScene.tsx, shared with ExhibitionTemplatePreviewPage.tsx —
// this component is just the data-fetching/adaptation glue for the
// exhibition case.
export default function ExhibitionPreviewPage() {
  const navigate = useNavigate();
  const { exhibitionId } = useParams<{ exhibitionId: string }>();

  const { data: backendDetail, isLoading } = useOwnExhibition(exhibitionId ?? '');
  const exhibition = useMemo(() => (backendDetail ? adaptApiExhibition(backendDetail) : null), [backendDetail]);
  const showLoadingScreen = useMinimumLoadingTime(isLoading, GALLERY_SCENE_MIN_LOADING_MS);

  return (
    <ExhibitionPreviewScene
      exhibition={exhibition}
      showLoadingScreen={showLoadingScreen}
      badgeKey="exhibitionPreviewBadge"
      onBack={() => navigate('/dashboard/organization/exhibitions')}
    />
  );
}
