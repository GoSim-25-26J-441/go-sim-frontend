import { Monitor } from "lucide-react";

/**
 * Shown below the top bar on viewports below the `lg` breakpoint (phones & tablets).
 * Top bar stays visible so users can sign out.
 */
export function DesktopOnlyNotice() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center bg-linear-to-b from-[#1F1F1F] to-black px-6 py-8 text-center">
      <div className="flex max-w-sm flex-col items-center">
        <Monitor
          className="h-10 w-10 text-white/25"
          strokeWidth={1.25}
          aria-hidden
        />
        <h2 className="mt-3 text-sm font-semibold leading-snug text-white">
          Use a desktop for the full experience
        </h2>
        <div
          className="my-3 h-px w-full max-w-[200px] bg-white/25"
          aria-hidden
        />
        <p className="text-[11px] leading-relaxed text-white/55">
          This workspace is built for larger screens so you can work comfortably with diagrams,
          simulation, metrics, and cost tools. Please open ArcFind on a desktop or laptop
          browser. You can sign out anytime from the menu in the bar above.
        </p>
      </div>
    </div>
  );
}
