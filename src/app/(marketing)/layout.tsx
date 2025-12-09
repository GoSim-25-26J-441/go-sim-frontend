import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/footer/Footer";
import { cookies } from "next/headers";
import CookieConsent from "@/components/common/cookies/CookieConsent";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const hasConsent = (await cookies()).has("gs_cookie_consent");
  return (
    <div className="min-h-dvh flex flex-col">
      <Navbar />
      <main className="pt-14 flex-1">{children}</main>
      <Footer />
      {!hasConsent && <CookieConsent />}
    </div>
  );
}
