type MessageBubbleProps = {
  role: "user" | "assistant";
  text: string;
};

export default function MessageBubble({ role, text }: MessageBubbleProps) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2`}>
      <div
        className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
        style={
          isUser
            ? {
                backgroundColor: "#000",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.1)",
                borderBottomRightRadius: "4px",
              }
            : {
                backgroundColor: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.88)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderBottomLeftRadius: "4px",
              }
        }
      >
        {text}
      </div>
    </div>
  );
}
