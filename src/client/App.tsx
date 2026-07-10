import { AdminApp } from "./pages/admin/AdminApp";
import { DomainDetailPage } from "./pages/public/DomainDetailPage";
import { PublicPage } from "./pages/public/PublicPage";

export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return <AdminApp />;
  if (path.startsWith("/d/")) {
    const name = decodeURIComponent(path.slice(3)).trim().toLowerCase();
    if (name) return <DomainDetailPage name={name} />;
  }
  return <PublicPage />;
}
