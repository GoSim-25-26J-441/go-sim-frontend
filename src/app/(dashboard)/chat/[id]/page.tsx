import { redirect } from "next/navigation";
export default function Page({ params }: { params: { id: string } }) {
  redirect(`/project/${params.id}/summary`);
}