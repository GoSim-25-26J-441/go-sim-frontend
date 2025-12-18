"use client";
import Image from "next/image";
import mark from "../../../../public/icon/mark1.png";

type Card1Props = {
  title?: string;
  description?: string;
  isUnderline?: boolean;
  points?: string[];
  className?:string;
};

const HIGHLIGHT = [
  "sample architectures",
  "anti-pattern",
  "architecture graphs",
  "3 projects"
] as const;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, terms: readonly string[]) {
  const termSet = new Set(terms.map((t) => t.toLowerCase()));
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");

  return text.split(pattern).map((chunk, i) =>
    termSet.has(chunk.toLowerCase()) ? (
      <span key={i} className="font-bold text-white">
        {chunk}
      </span>
    ) : (
      <span key={i}>{chunk}</span>
    )
  );
}

export default function Card1({
  title,
  description,
  isUnderline = false,
  points,
  className
}: Card1Props) {
  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="shrink-0 mb-6">
        {title && (
          <h2 className="text-sm font-bold text-white text-center min-h-5 flex items-center justify-center">
            {title}
          </h2>
        )}

        {description && (
          <p className="mt-2 text-xs font-normal text-white/80 text-center min-h-5 flex items-center justify-center">
            {description}
          </p>
        )}

        {isUnderline && <div className="h-0.5 w-full bg-white mt-4" />}
      </div>

      {points && points.length > 0 && (
        <ul className="space-y-4 flex-1">
          {points.map((point, index) => (
            <li
              key={`${index}-${point}`}
              className="text-sm text-[#7D7F86] flex flex-row items-start gap-3"
            >
              <div className="shrink-0 w-3 h-3 mt-0.5">
                <Image
                  src={mark}
                  alt="point icon"
                  width={16}
                  height={16}
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="flex-1 text-white/80 font-normal text-xs leading-relaxed">
                {highlightText(point, HIGHLIGHT)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
