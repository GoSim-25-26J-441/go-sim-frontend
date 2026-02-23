import ClientChat from "@/components/chat/main/ClientChat";

export default function ChatPage({ params }: { params: { id: string } }) {
  return <ClientChat id={params.id} />;
}
