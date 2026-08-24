import { Navigate, useNavigate } from "react-router-dom";
import SuperAdminPanel from "../components/panel/SuperAdminPanel";
import CuratorPanel from "../components/panel/CuratorPanel";
import ArtistPanel from "../components/panel/ArtistPanel";
import BuyerPanel from "../components/panel/BuyerPanel";
import { useAuth } from "../lib/auth/AuthContext";

// /dashboard — every authenticated role lands here (Header's "Panel" link,
// and Login's post-login redirect), but each role sees a different panel.
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
      return <SuperAdminPanel onBack={onBack} />;
    case "ADMIN":
      return <CuratorPanel onBack={onBack} />;
    case "ARTIST":
      return <ArtistPanel onBack={onBack} />;
    default:
      // Plain visitor/buyer — artist onboarding is invite-only now (a
      // curator adds them via CuratorPanel's "Sanatçılarım"), so anyone
      // without that role just tracks their own offers here instead of
      // being forced into ArtistPanel's profile-creation form.
      return <BuyerPanel onBack={onBack} />;
  }
}
