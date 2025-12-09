"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useChats } from "@/modules/chat/useChats";

const UID = "demo-user"; // replace with real user later

export default function Sidebar() {
  const { chats, create } = useChats(UID);
  const router = useRouter();
  const pathname = usePathname();
  const activeId = pathname.split("/").pop();

  function onNew() {
    const c = create();
    router.push(`/chat/${c.id}`);
  }

  return (
    <aside className="border-r border-border p-3 flex flex-col min-h-[calc(100dvh-56px)]">
      <button onClick={onNew} className="w-full mb-3 px-3 py-2 rounded-lg bg-brand text-white">+ New chat</button>
      <div className="flex-1 space-y-1 overflow-auto">
        {chats.map(c => (
          <Link key={c.id} href={`/chat/${c.id}`}
            className={`block px-2 py-2 rounded-lg border ${activeId===c.id ? "border-brand" : "border-border hover:bg-surface"}`}>
            <div className="truncate">{c.title}</div>
          </Link>
        ))}
        {chats.length === 0 && <div className="text-sm opacity-70 px-1">No chats yet.</div>}
      </div>
      <div className="mt-3 border-t border-border pt-3 text-sm opacity-80">
        <div className="font-medium">Signed in</div>
        <div>{UID}</div>
      </div>
    </aside>
  );
}
