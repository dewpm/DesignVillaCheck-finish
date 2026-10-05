import { useEffect, useState } from "react";
const pages = new Set(["home", "directory", "detail", "scan", "verify", "pricing", "login", "about", "verification-standard", "articles", "article-detail", "owner-guide", "help", "contact", "privacy", "terms", "social-facebook", "social-instagram", "social-line", "gallery", "owner-auth", "owner-registration", "owner-information", "owner-onboarding-villa", "package-confirmation", "owner-select-villa", "package-request-pending", "owner-dashboard", "owner-villas", "owner-villa-detail", "owner-villa-edit", "owner-add-villa", "owner-preview", "owner-pending", "owner-analytics", "owner-reports", "owner-package", "user-dashboard", "user-checks", "user-check-detail", "user-reports", "user-report-detail", "user-precheck", "user-check-success", "villa-report", "villa-report-success", "admin-dashboard", "admin-review", "admin-owners", "admin-villas", "admin-checks", "admin-reports", "admin-qr", "admin-packages"]);
function readLocation() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const page = params.get("page") || "home";
  return { page: pages.has(page) ? page : "home", item: params.get("item") || "" };
}
export function usePageNavigation<T extends string>() {
  const [location, setLocation] = useState(readLocation);
  useEffect(() => {
    const restore = () => { setLocation(readLocation()); window.scrollTo(0, 0); };
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", restore); };
  }, []);
  const navigate = (page: T, item = "") => {
    if (!pages.has(page)) return;
    const params = new URLSearchParams({ page });
    if (item) params.set("item", item);
    const hash = `#${params}`;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    setLocation({ page, item });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return [location.page as T, navigate, location.item] as const;
}
