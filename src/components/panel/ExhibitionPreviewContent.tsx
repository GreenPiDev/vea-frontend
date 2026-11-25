import { useMemo } from 'react';
import { adaptApiExhibition } from '../3d/backendAdapter';
import { toFurnitureDef } from '../3d/furniture';
import type { ApiExhibition } from '../../lib/api/domains/exhibitions';
import { useFurnitureAssetsByOrganization } from '../../lib/api/domains/furnitureAssets';
import { useMinimumLoadingTime, GALLERY_SCENE_MIN_LOADING_MS } from '../../lib/useMinimumLoadingTime';
import ExhibitionPreviewScene from './ExhibitionPreviewScene';
import '../../App.css';

interface ExhibitionPreviewContentProps {
  /** Exhibition detail with artworkLinks (+ exhibitionTemplate) — the
   * useOwnExhibition / useSuperAdminExhibition shape. */
  detail: ApiExhibition | undefined;
  isLoading: boolean;
  onBack: () => void;
}

// Shared glue for the panel's 3D exhibition previews: resolves the
// organization's furniture, adapts the backend exhibition to a renderable
// scene and shows the branded loading screen. The pages only differ in
// where the detail comes from — the curator's ExhibitionPreviewPage (own
// organization) and the SUPERADMIN's AdminExhibitionPreviewPage (any).
export default function ExhibitionPreviewContent({ detail, isLoading, onBack }: ExhibitionPreviewContentProps) {
  const { data: furnitureAssets } = useFurnitureAssetsByOrganization(detail?.exhibitionTemplate?.organizationId ?? null);
  const exhibition = useMemo(
    () => (detail ? adaptApiExhibition(detail, (furnitureAssets ?? []).map(toFurnitureDef)) : null),
    [detail, furnitureAssets],
  );
  const showLoadingScreen = useMinimumLoadingTime(isLoading, GALLERY_SCENE_MIN_LOADING_MS);

  return (
    <ExhibitionPreviewScene
      exhibition={exhibition}
      showLoadingScreen={showLoadingScreen}
      badgeKey="exhibitionPreviewBadge"
      onBack={onBack}
    />
  );
}
