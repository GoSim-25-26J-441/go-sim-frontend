"use client";
import { useEffect, useState } from "react";

const COOKIE = "gs_cookie_consent";
const DAYS = 180;

export default function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const has = document.cookie.split("; ").some(c => c.startsWith(`${COOKIE}=`));
    if (!has) setOpen(true);
  }, []);

  if (!open) return null;

  function accept() {
    const expires = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${COOKIE}=accepted; expires=${expires}; path=/; SameSite=Lax`;
    setOpen(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-white">
      <div className="mx-auto max-w-6xl m-4 bg-card p-4">
        <p className="text-sm text-black">
          We use essential cookies to make GO-SIM work. See our{" "}
          <a href="/privacy" className="text-brand underline text-black">Privacy Policy</a>.
        </p>
        <div className="mt-3 flex gap-2">
          <button onClick={accept} className="px-3 py-1.5 rounded-lg bg-brand text-black hover:bg-gray-100">Accept</button>
          <a href="/privacy" className="px-3 py-1.5 rounded-lg border border-border text-black">Learn more</a>
        </div>
      </div>
    </div>
  );
}
