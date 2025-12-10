// src/components/chat/Bubble.tsx
export const BUBBLE_VERSION = "1.1";

type Props = {
  role: "user" | "ai";
  text: string;
};

export default function Bubble({ role, text }: Props) {
  const isUser = role === "user";
  return (
    <div className={`w-full flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[72ch] whitespace-pre-wrap rounded-2xl px-4 py-2 border border-border",
          isUser ? "bg-brand text-white" : "bg-card",
        ].join(" ")}
      >
        {text}
      </div>
    </div>
  );
}
