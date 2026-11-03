/**
 * layout.tsx — каркас публичных страниц.
 *
 * Добавляет общую шапку и подвал к лендингу, страницам метода, науки,
 * тарифов, демо и юридическим документам.
 */

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
