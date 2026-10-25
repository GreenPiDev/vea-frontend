import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adaptExhibitionTemplate } from '../3d/backendAdapter';
import { toFurnitureDef } from '../3d/furniture';
import { useOwnExhibitionTemplate } from '../../lib/api/domains/exhibitionTemplates';
import { useFurnitureAssetsByOrganization } from '../../lib/api/domains/furnitureAssets';
import { useMinimumLoadingTime, GALLERY_SCENE_MIN_LOADING_MS } from '../../lib/useMinimumLoadingTime';
import ExhibitionPreviewScene from './ExhibitionPreviewScene';
import '../../App.css';

// /dashboard/organization/exhibition-templates/preview/:templateId — same
// full-bleed 3D walkthrough as ExhibitionPreviewPage.tsx, but for a bare
// template (no exhibition, no artworks) — lets a curator see what a
// template's empty room looks like before picking it for a real exhibition.
// The actual rendering (canvas, instructions, HUD) lives in
// ExhibitionPreviewScene.tsx, shared with ExhibitionPreviewPage.tsx — this
// component is just the data-fetching/adaptation glue for the template case.
export default function ExhibitionTemplatePreviewPage() {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();

  const { data: template, isLoading } = useOwnExhibitionTemplate(templateId ?? '');
  const { data: furnitureAssets } = useFurnitureAssetsByOrganization(template?.organizationId ?? null);
  const exhibition = useMemo(
    () => (template ? adaptExhibitionTemplate(template, (furnitureAssets ?? []).map(toFurnitureDef)) : null),
    [template, furnitureAssets]
  );
  const showLoadingScreen = useMinimumLoadingTime(isLoading, GALLERY_SCENE_MIN_LOADING_MS);

  return (
    <ExhibitionPreviewScene
      exhibition={exhibition}
      showLoadingScreen={showLoadingScreen}
      badgeKey="exhibitionTemplatePreviewBadge"
      onBack={() => navigate('/dashboard/organization/exhibition-templates')}
    />
  );
}
