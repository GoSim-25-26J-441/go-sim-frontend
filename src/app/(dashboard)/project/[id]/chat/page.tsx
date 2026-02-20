import ClientChat from "@/components/chat/ClientChat";

export default function ChatPage({ params }: { params: { id: string } }) {
  // Server component shell renders the client chat with the project id
  return <ClientChat id={params.id} />;
}
