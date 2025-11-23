"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen grid place-items-center bg-black text-white">
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-slate-200">
            An unexpected error occurred. You can try again.
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded bg-white text-black text-sm"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
