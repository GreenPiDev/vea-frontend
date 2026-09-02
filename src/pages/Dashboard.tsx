import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import SuperAdminPanel from "../components/panel/SuperAdminPanel";
import CuratorPanel from "../components/panel/CuratorPanel";
import NewExhibitionPage from "../components/panel/NewExhibitionPage";
import NewExhibitionTemplatePage from "../components/panel/NewExhibitionTemplatePage";
import EditExhibitionTemplatePage from "../components/panel/EditExhibitionTemplatePage";
import ExhibitionTemplatePreviewPage from "../components/panel/ExhibitionTemplatePreviewPage";
import AddArtworkPage from "../components/panel/AddArtworkPage";
import ExhibitionPreviewPage from "../components/panel/ExhibitionPreviewPage";
import ArtistPanel from "../components/panel/ArtistPanel";
import NewArtworkPage from "../components/panel/NewArtworkPage";
import EditArtworkPage from "../components/panel/EditArtworkPage";
import BuyerPanel from "../components/panel/BuyerPanel";
import { useAuth } from "../lib/auth/AuthContext";

// /dashboard/* — every authenticated role lands here (Header's "Panel" link,
// and Login's post-login redirect), but each role sees a different panel.
// Each role gets its own URL namespace (organization/artist/buyer/admin) so
// two roles' same-named sections (both CuratorPanel and ArtistPanel have an
// "offers" tab, for instance) never collide on one path —
// /dashboard/organization/offers vs /dashboard/artist/offers stay distinct.
// A logged-in user only ever matches their own role's namespace; anything
// else (bare /dashboard, an unknown section, another role's URL typed by
// hand) falls through the wildcard route to that role's default section.
// Not reachable unauthenticated: unlike gallery browsing, these panels
// assume a logged-in user (BuyerPanel's offer list, etc.), so a direct/
// stale visit here without a session bounces back to /home instead of
// rendering broken authenticated-only queries.
export default function Dashboard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="loading-indicator" />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  const onBack = () => navigate("/home");

  switch (user?.role) {
    case "SUPERADMIN":
      return (
        <Routes>
          <Route path="admin/organizations" element={<SuperAdminPanel onBack={onBack} />} />
          <Route path="*" element={<Navigate to="admin/organizations" replace />} />
        </Routes>
      );
    case "GALLERY_ADMIN":
      return (
        <Routes>
          <Route
            path="organization/exhibitions/new-exhibition"
            element={<NewExhibitionPage onBack={onBack} />}
          />
          <Route
            path="organization/exhibitions/add-artwork/:exhibitionId"
            element={<AddArtworkPage onBack={onBack} />}
          />
          <Route
            path="organization/exhibitions/preview/:exhibitionId"
            element={<ExhibitionPreviewPage />}
          />
          <Route
            path="organization/exhibition-templates/new"
            element={<NewExhibitionTemplatePage onBack={onBack} />}
          />
          <Route
            path="organization/exhibition-templates/edit/:templateId"
            element={<EditExhibitionTemplatePage onBack={onBack} />}
          />
          <Route
            path="organization/exhibition-templates/preview/:templateId"
            element={<ExhibitionTemplatePreviewPage />}
          />
          <Route path="organization/:section" element={<CuratorPanel onBack={onBack} />} />
          <Route path="*" element={<Navigate to="organization/exhibitions" replace />} />
        </Routes>
      );
    case "SELLER":
      return (
        <Routes>
          <Route path="artist/artworks/new-artwork" element={<NewArtworkPage onBack={onBack} />} />
          <Route path="artist/artworks/edit/:artworkId" element={<EditArtworkPage onBack={onBack} />} />
          <Route path="artist/:section" element={<ArtistPanel onBack={onBack} />} />
          <Route path="*" element={<Navigate to="artist/artworks" replace />} />
        </Routes>
      );
    default:
      // Plain visitor/buyer — artist onboarding is invite-only now (a
      // curator adds them via CuratorPanel's "Sanatçılarım"), so anyone
      // without that role just tracks their own offers here instead of
      // being forced into ArtistPanel's profile-creation form.
      return (
        <Routes>
          <Route path="buyer/offers" element={<BuyerPanel onBack={onBack} />} />
          <Route path="*" element={<Navigate to="buyer/offers" replace />} />
        </Routes>
      );
  }
}
