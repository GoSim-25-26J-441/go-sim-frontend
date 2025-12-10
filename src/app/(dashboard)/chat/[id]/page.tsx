import ClientChat from "./ClientChat";

export default function Page({ params }: { params: { id: string } }) {
  return <ClientChat id={params.id} />;
}