export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid md:grid-cols-[240px_1fr]">
      <aside className="border-r p-4">Sidebar</aside>
      <main>{children}</main>
    </div>
  );
}
