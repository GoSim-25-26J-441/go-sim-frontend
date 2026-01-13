"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="min-h-dvh grid place-items-center bg-bg text-fg p-6">
        <div className="max-w-lg space-y-3">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-muted break-words">{error.message}</p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-xl bg-brand text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
