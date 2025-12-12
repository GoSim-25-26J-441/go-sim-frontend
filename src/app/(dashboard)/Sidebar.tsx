/* eslint-disable @typescript-eslint/no-explicit-any */
// // src/app/(dashboard)/Sidebar.tsx
// "use client";

// import Link from "next/link";
// import { useEffect, useRef, useState } from "react";
// import { usePathname, useRouter } from "next/navigation";
// import { useChats } from "@/modules/chat/useChats";
// import { useSession } from "@/modules/session/context";

// type RemoteChat = { jobId: string; title: string; lastAt: number | null; lastBy: string | null; };

// export default function Sidebar() {
//   const pathname = usePathname();
//   const router = useRouter();
//   const { userId } = useSession();
//   const { chats, create, ensureByJob } = useChats(userId || "");

//   const [remote, setRemote] = useState<RemoteChat[]>([]);
//   const [loading, setLoading] = useState(false);

//   // --- new: file input for ingest ---
//   const fileRef = useRef<HTMLInputElement>(null);
//   const [busy, setBusy] = useState(false);

//   async function handleFiles(files: FileList | null) {
//     if (!files || files.length === 0) return;
//     const file = files[0];
//     setBusy(true);
//     try {
//       const fd = new FormData();
//       fd.append("files", file);
//       // optional hint:
//       // fd.append("chat", "~200 RPS; internal gRPC");

//       const r = await fetch("/api/di/ingest", { method: "POST", body: fd });
//       const j = await r.json();
//       if (!r.ok || !j?.ok || !j?.jobId) {
//         console.error("ingest failed:", j);
//         alert(`Ingest failed: ${j?.error || r.statusText}`);
//         return;
//       }

//       // create/ensure a local tab that maps to this jobId (title = filename)
//       const title = file.name || "New chat";
//       const chat = ensureByJob(j.jobId, title);

//       // kick off Step 2 & 3 later (we’ll add in the next step)
//       // For now: redirect to the chat page for this job
//       router.push(`/chat/${chat.id}`);
//     } catch (e) {
//       console.error(e);
//       alert("Upload error");
//     } finally {
//       setBusy(false);
//       if (fileRef.current) fileRef.current.value = ""; // reset picker so same file can re-trigger
//     }
//   }

//   function onNew() {
//     fileRef.current?.click();
//   }

//   useEffect(() => {
//     let alive = true;
//     (async () => {
//       setLoading(true);
//       try {
//         const r = await fetch("/api/di/chats", { cache: "no-store" });
//         const raw = await r.text();
//         const j = JSON.parse(raw);
//         if (alive && j?.ok) setRemote(j.chats as RemoteChat[]);
//       } catch (e) {
//         console.error("GET /api/di/chats error:", e);
//       } finally {
//         if (alive) setLoading(false);
//       }
//     })();
//     return () => { alive = false; };
//   }, []);

//   return (
//     <aside className="p-3 space-y-3">
//       {/* hidden file input */}
//       <input
//         ref={fileRef}
//         type="file"
//         accept=".png,.jpg,.jpeg,.puml,.plantuml,.yaml,.yml,.json,.txt,.md"
//         className="hidden"
//         onChange={e => handleFiles(e.target.files)}
//       />

//       <div className="flex items-center justify-between">
//         <div className="text-xs opacity-60">UID: {userId}</div>
//         <button
//           onClick={onNew}
//           className="px-2 py-1 rounded bg-brand text-white text-xs disabled:opacity-60"
//           disabled={busy}
//           title="Upload a diagram/spec to start a new chat"
//         >
//           {busy ? "Uploading…" : "New"}
//         </button>
//       </div>

//       {/* Local list (if you keep it) */}
//       {!!chats.length && (
//         <div>
//           <div className="text-[10px] uppercase opacity-50 mb-1">Local</div>
//           <nav className="space-y-1">
//             {chats.map((c) => {
//               const active = pathname === `/chat/${c.id}`;
//               return (
//                 <Link
//                   key={c.id}
//                   href={`/chat/${c.id}`}
//                   className={`block rounded px-2 py-1 text-sm truncate ${
//                     active ? "bg-card border border-border" : "hover:bg-surface"
//                   }`}
//                   title={c.title}
//                 >
//                   {c.title || "Untitled"}
//                 </Link>
//               );
//             })}
//           </nav>
//         </div>
//       )}

//       {/* Server list */}
//       <div>
//         <div className="text-[10px] uppercase opacity-50 mb-1">Server</div>
//         {loading && <div className="text-xs opacity-60">Loading…</div>}
//         {!loading && !remote.length && (
//           <div className="text-xs opacity-60">No server chats.</div>
//         )}
//         <nav className="space-y-1">
//           {remote.map((rc) => (
//             <button
//               key={rc.jobId}
//               onClick={() => {
//                 const chat = ensureByJob(rc.jobId, rc.title);
//                 // open the mapped local tab
//                 location.assign(`/chat/${chat.id}`);
//               }}
//               className="w-full text-left block rounded px-2 py-1 text-sm truncate hover:bg-surface"
//               title={rc.title}
//             >
//               {rc.title}
//             </button>
//           ))}
//         </nav>
//       </div>
//     </aside>
//   );
// }

// src/app/(dashboard)/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useChats } from "@/modules/chat/useChats";
import { useSession } from "@/modules/session/context";
import { useEffect, useState } from "react";

type RemoteChat = {
  jobId: string;
  title: string;
  lastAt: number | null;
  lastBy: string | null;
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { userId } = useSession();
  const { chats} = useChats(userId || "");
  const [remote, setRemote] = useState<RemoteChat[]>([]);
  const [loading, setLoading] = useState(false);

  async function onNew() {
    const r = await fetch("/api/di/new-job", {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": userId },
      body: "{}",
    });

    // safer parse
    const raw = await r.text();
    let j: any;
    try {
      j = JSON.parse(raw);
    } catch {
      console.error("new-job not JSON:", raw);
      return;
    }

    if (!r.ok || !j?.jobId) {
      console.error(j?.error || "new-job failed");
      return;
    }
    // go to summary of the newly created server job
    router.push(`/chat/${j.jobId}/summary`);
  }

  function openServerChat(rc: { jobId: string; title: string }) {
    router.push(`/chat/${rc.jobId}/summary`);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/di/chats", { cache: "no-store" });
        const j = await r.json();
        if (j?.ok) setRemote(j.chats as RemoteChat[]);
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <aside className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs opacity-60">UID: {userId}</div>
        <button
          onClick={onNew}
          className="px-2 py-1 rounded bg-brand text-white text-xs"
        >
          New
        </button>
      </div>

      {!!chats.length && (
        <div>
          <div className="text-[10px] uppercase opacity-50 mb-1">Local</div>
          <nav className="space-y-1">
            {chats.map((c) => {
              const active = pathname === `/chat/${c.id}`;
              return (
                <Link
                  key={c.id}
                  href={`/chat/${c.id}`}
                  className={`block rounded px-2 py-1 text-sm truncate ${
                    active ? "bg-card border border-border" : "hover:bg-surface"
                  }`}
                  title={c.title}
                >
                  {c.title || "Untitled"}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <div>
        <div className="text-[10px] uppercase opacity-50 mb-1">Server</div>
        {loading && <div className="text-xs opacity-60">Loading…</div>}
        {!loading && !remote.length && (
          <div className="text-xs opacity-60">No server chats.</div>
        )}
        <nav className="space-y-1">
          {remote.map((rc) => (
            <button
              key={rc.jobId}
              onClick={() => openServerChat(rc)}
              className="w-full text-left block rounded px-2 py-1 text-sm truncate hover:bg-surface"
              title={rc.title}
            >
              {rc.title}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}
