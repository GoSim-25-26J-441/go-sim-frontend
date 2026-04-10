import { useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import Markdown from "react-markdown";
import { Copy, Check } from "lucide-react";

type MessageBubbleProps = {
  role: "user" | "assistant";
  text: string;
  responseTimeMs?: number;
};

function MdHeading({ children, ...props }: ComponentPropsWithoutRef<"h4">) {
  return (
    <h4
      className="text-base font-semibold text-white/95 mt-3 mb-1 first:mt-0"
      {...props}
    >
      {children}
    </h4>
  );
}

const assistantMarkdownComponents = {
  h1: MdHeading,
  h2: MdHeading,
  h3: MdHeading,
  h4: MdHeading,
  h5: MdHeading,
  h6: MdHeading,
  p: ({ children, ...props }: ComponentPropsWithoutRef<"p">) => (
    <p className="mb-2 last:mb-0 text-white/88 leading-relaxed" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }: ComponentPropsWithoutRef<"ul">) => (
    <ul
      className="list-disc pl-5 my-2 space-y-1 marker:text-white/50"
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: ComponentPropsWithoutRef<"ol">) => (
    <ol
      className="list-decimal pl-5 my-2 space-y-1 marker:text-white/50"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }: ComponentPropsWithoutRef<"li">) => (
    <li className="leading-relaxed pl-0.5" {...props}>
      {children}
    </li>
  ),
  blockquote: ({
    children,
    ...props
  }: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="border-l-2 border-white/25 pl-3 my-2 text-white/80"
      {...props}
    >
      {children}
    </blockquote>
  ),
  strong: ({ children, ...props }: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-white" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: ComponentPropsWithoutRef<"em">) => (
    <em className="italic text-white/85" {...props}>
      {children}
    </em>
  ),
  a: ({ children, href, ...props }: ComponentPropsWithoutRef<"a">) => (
    <a
      className="text-sky-300 underline underline-offset-2 hover:text-sky-200"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  code: ({
    className,
    children,
    ...props
  }: ComponentPropsWithoutRef<"code">) => {
    const isBlock = Boolean(className?.startsWith("language-"));
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded px-1 py-0.5 bg-black/40 text-[0.9em] font-mono text-sky-200/90"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="overflow-x-auto rounded-lg bg-black/45 p-3 my-2 border border-white/10 text-xs font-mono"
      {...props}
    >
      {children}
    </pre>
  ),
};

const bubbleBase =
  "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed";

function formatResponseTime(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export default function MessageBubble({
  role,
  text,
  responseTimeMs,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
    >
      <span
        className="text-[9px] font-medium px-1 select-none"
        style={{
          color: isUser ? "rgba(255,255,255,0.5)" : "rgba(147,197,253,0.85)",
        }}
      >
        {isUser
          ? ""
          : responseTimeMs !== undefined
            ? `Assistant · Response time: ${formatResponseTime(responseTimeMs)}`
            : "Assistant"}
      </span>

      <div
        className={
          isUser
            ? `${bubbleBase} whitespace-pre-wrap`
            : `${bubbleBase} [&_.markdown-root>:first-child]:mt-0`
        }
        style={
          isUser
            ? {
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.18)",
                borderBottomRightRadius: "4px",
              }
            : {
                backgroundColor: "transparent",
                color: "rgba(255,255,255,0.88)",
                border: "none",
                borderBottomLeftRadius: "4px",
              }
        }
      >
        {isUser ? (
          text
        ) : (
          <div className="markdown-root">
            <Markdown components={assistantMarkdownComponents}>
              {text}
            </Markdown>
          </div>
        )}
      </div>

      {!isUser && (
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-white/55 hover:text-white/80 transition-colors"
          title={copied ? "Copied" : "Copy response"}
          aria-label={copied ? "Copied response" : "Copy response"}
        >
          {copied ? (
            <Check className="w-3 h-3 shrink-0" />
          ) : (
            <Copy className="w-3 h-3 shrink-0" />
          )}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      )}
    </div>
  );
}
