import { ChevronDown } from "lucide-react";
import { useState } from "react";

type OptionProps<T extends string> = {
  value: T;
  label: string;
  desc?: string;
};

type DropdownProps<T extends string> = {
  label: string;
  options: OptionProps<T>[];
  value: T;
  onSelect: (value: T) => void;
};

export default function Dropdown<T extends string>({
  label,
  options,
  value,
  onSelect,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  const dotColor: Record<string, string> = {
    thinking: "#60a5fa",
    instant: "#34d399",
    default: "#a78bfa",
    high: "#f87171",
    medium: "#fbbf24",
    low: "#6ee7b7",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 bg-white text-black hover:bg-gray-200"
        type="button"
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColor[value] ?? "#9ca3af" }}
        />
        <span className="text-black/60 text-xs">{label}:</span>
        {current?.label ?? value}
        <ChevronDown
          className="w-3.5 h-3.5 transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-2 rounded-xl overflow-hidden z-20"
            style={{
              minWidth: "10rem",
              backgroundColor: "#000",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
            }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onSelect(opt.value);
                  setOpen(false);
                }}
                type="button"
                className="w-full text-left px-3 py-2.5 text-sm transition-colors duration-100 flex items-center justify-between gap-4"
                style={{
                  backgroundColor:
                    value === opt.value
                      ? "rgba(255,255,255,0.07)"
                      : "transparent",
                  color:
                    value === opt.value ? "#fff" : "rgba(255,255,255,0.55)",
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: dotColor[String(opt.value)] ?? "#9ca3af",
                    }}
                  />
                  {opt.label}
                </span>
                {opt.desc && (
                  <span
                    className="text-xs"
                    style={{ color: "rgba(255,255,255,0.25)" }}
                  >
                    {opt.desc}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}