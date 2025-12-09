import Navbar from "@/components/nav/Navbar";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="pt-14">{children}</main>
    </>
  );
}
