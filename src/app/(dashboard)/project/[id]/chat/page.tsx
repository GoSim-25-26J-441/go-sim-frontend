import ClientChat from "@/components/chat/main/ClientChat";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientChat id={id} />;
}
