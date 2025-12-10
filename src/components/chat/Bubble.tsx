export const BUBBLE_VERSION = "v4"; 

type Role = "user" | "ai";

export default function Bubble({ role, text }: { role: Role; text: string }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "grid" }}>
      <div
        style={{ justifySelf: isUser ? "end" : "start" }} // hard align
        className={[
          "max-w-[70ch] whitespace-pre-wrap rounded-2xl px-4 py-2 border",
          // TEMP: loud colors so you can SEE the difference immediately
          isUser
            ? "bg-indigo-600 text-white border-indigo-600"
            : "bg-neutral-900 text-neutral-50 border-neutral-700",
        ].join(" ")}
      >
        {text}
      </div>
    </div>
  );
}
