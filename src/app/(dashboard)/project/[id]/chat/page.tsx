import ClientChat from "@/components/chat/ClientChat";

export default function ChatPage({ params }: { params: { id: string } }) {
  return <ClientChat id={params.id} />;
}
