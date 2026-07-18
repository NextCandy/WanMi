import { lazy, Suspense } from "react";

import { PublicPage } from "./pages/public/PublicPage";
import { FeaturedDomainPage } from "./pages/public/FeaturedDomainPage";

const AdminApp = lazy(() => import("./pages/admin/AdminApp").then((module) => ({ default: module.AdminApp })));

function RouteLoading() {
  return <div className="app-loading"><img className="brand-mark-img" src="/logo.svg" alt="" /><p>正在打开 DOMAIN HUNTER…</p></div>;
}

export function App() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return <Suspense fallback={<RouteLoading />}><AdminApp /></Suspense>;
  if (path.startsWith("/d/")) return <FeaturedDomainPage />;
  return <PublicPage />;
}
