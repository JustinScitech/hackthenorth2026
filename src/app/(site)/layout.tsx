import { SiteFooter, SiteHeader } from "./site-chrome";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="site">
      <SiteHeader />
      <div className="site-main">{children}</div>
      <SiteFooter />
    </div>
  );
}
