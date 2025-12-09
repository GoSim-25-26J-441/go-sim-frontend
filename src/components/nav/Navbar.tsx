"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const pathname = usePathname();
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-bg/80 backdrop-blur">
      <nav className="mx-auto max-w-6xl h-14 px-4 flex items-center justify-between">
        <Link href="/" className="font-semibold">GO-SIM</Link>

        <ul className="flex gap-6 text-sm">
          {links.map(l => (
            <li key={l.href}>
              <Link
                href={l.href}
                className={pathname === l.href ? "text-brand" : "hover:opacity-80"}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* CTAs */}
        <div className="flex items-center gap-2">
          <Link href="/login" className="px-3 py-1.5 rounded-lg border border-border">
            Log in
          </Link>
          <Link href="/get-started" className="px-3 py-1.5 rounded-lg bg-brand text-white">
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
