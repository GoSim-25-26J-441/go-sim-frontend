"use client";

type Suggestion = {
  kind: string;
  title: string;
  bullets: string[];
  auto_fix_applied?: boolean;
  auto_fix_notes?: string[];
};

export default function SuggestionModal({
  open,
  loading,
  suggestions,
  error,
  onClose,
  onApply,
  applyLoading,
  disabledApply,
}: {
  open: boolean;
  loading: boolean;
  suggestions: Suggestion[];
  error?: string | null;
  onClose: () => void;
  onApply: () => void;
  applyLoading: boolean;
  disabledApply: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-white shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Suggestions to fix anti-patterns
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Simple steps that can be applied automatically.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-4">
          {loading ? (
            <div className="text-sm text-slate-600">
              Loading suggestions…
              <div className="mt-3 h-4 w-4 animate-spin rounded-full border border-slate-400 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-sm text-slate-600">
              No suggestions available.
            </div>
          ) : (
            <div className="space-y-4">
              {suggestions.map((s, idx) => (
                <div key={idx} className="rounded-md border bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-800">
                      {s.title}
                    </div>
                    <div className="text-[11px] text-slate-500">{s.kind}</div>
                  </div>

                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {s.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>

                  {s.auto_fix_notes?.length ? (
                    <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                      <div className="font-semibold">Auto-fix notes</div>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {s.auto_fix_notes.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-4">
          <button
            onClick={onClose}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            onClick={onApply}
            disabled={disabledApply || applyLoading}
            className="rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {applyLoading ? "Applying…" : "Apply suggestion"}
          </button>
        </div>
      </div>
    </div>
  );
}
