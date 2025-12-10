// server component (no "use client")

import ClientChat from "./ClientChat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page({ params }: { params: { id: string } }) {
  return <ClientChat id={params.id} />;
}
