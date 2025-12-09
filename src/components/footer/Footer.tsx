import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <span>© {year} GO-SIM. All rights reserved.</span>
        <nav className="flex gap-4">
          <Link href="/docs">Docs</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <span className="opacity-80">Built as a research project at SLIIT.</span>
      </div>
    </footer>
  );
}
