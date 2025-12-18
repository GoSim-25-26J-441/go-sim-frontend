import CookieConsent from "@/components/common/cookies/CookieConsent";
import { cookies } from "next/headers";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasConsent = (await cookies()).has("gs_cookie_consent");
  return (
    <>
      <main className="min-h-screen bg-linear-to-b from-[#1F1F1F] to-black">
        {children}
      </main>
      {!hasConsent && <CookieConsent />}
    </>
  );
}
