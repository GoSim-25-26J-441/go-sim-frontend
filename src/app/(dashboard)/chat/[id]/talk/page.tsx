import ClientChat from "../ClientChat";

export default function TalkPage({ params }: { params: { id: string } }) {
  // Server component shell renders the client chat with the job id
  return <ClientChat id={params.id} />;
}
