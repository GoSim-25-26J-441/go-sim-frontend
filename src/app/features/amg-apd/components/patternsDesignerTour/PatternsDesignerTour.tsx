"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  AMG_DESIGNER,
  type AmgDesignerAnchor,
} from "@/app/features/amg-apd/components/patternsDesignerTour/anchors";
import {
  buildLegendTourSteps,
  type DesignerTourStep,
} from "@/app/features/amg-apd/components/patternsDesignerTour/legendTourSteps";

export { AMG_DESIGNER } from "@/app/features/amg-apd/components/patternsDesignerTour/anchors";
export type { AmgDesignerAnchor } from "@/app/features/amg-apd/components/patternsDesignerTour/anchors";

/** Above simulation picker (160000), suggestion modal (200000), version portal (99999) */
const ACTIVE_TOUR_Z = 240000;

const PROJECT_WELCOME_DIM_Z = 46;
const PROJECT_WELCOME_GLEAM_Z_EXTRA = 58;
const PROJECT_WELCOME_DIALOG_Z = 100;

/** Idle hint pips — below sticky patterns toolbar (z-20) */
const DESIGNER_PIP_Z = 12;

/** Welcome gleams sit above the dim (18) but below the sticky toolbar (20). */
const DESIGNER_WELCOME_GLEAM_Z = 19;

/** Sticky toolbar band from viewport top (px) — used with pip position to hide scrolled-under workspace */
const STICKY_TOOLBAR_GUARD_PX = 108;

/** Default (e.g. dashboard patterns): subtle glass pip */
const GUIDE_MARKER_INTERACTIVE =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] font-semibold text-white/90 transition-colors hover:bg-white/15 hover:text-white";
const GUIDE_MARKER_STATIC =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] font-semibold text-white/90";

/** Project /patterns only: blue-800 circle, white ? (slightly larger for visibility) */
const PROJECT_GUIDE_MARKER_INTERACTIVE =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-800 text-[11px] font-bold text-white shadow-sm ring-2 ring-black/30 transition-colors hover:bg-blue-700 active:scale-95";
const PROJECT_GUIDE_MARKER_STATIC =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-800 text-[11px] font-bold text-white ring-2 ring-black/30";

type ChapterMeta = {
  id: string;
  markerAnchor: AmgDesignerAnchor;
  title: string;
  /** Multiple guide markers can open the same step list (e.g. canvas + details → one surface tour). */
  stepGroupKey?: string;
};

const CHAPTER_BASE: ChapterMeta[] = [
  {
    id: "versions",
    markerAnchor: AMG_DESIGNER.versions,
    title: "Versions & compare",
  },
  {
    id: "toolbarDownloads",
    markerAnchor: AMG_DESIGNER.toolbarDownloads,
    title: "Exports & downloads",
  },
  {
    id: "returnToChat",
    markerAnchor: AMG_DESIGNER.returnToChat,
    title: "Return to chat",
  },
  {
    id: "suggestions",
    markerAnchor: AMG_DESIGNER.viewSuggestions,
    title: "Suggestions assistant",
  },
  {
    id: "legend",
    markerAnchor: AMG_DESIGNER.legend,
    title: "Legend & anti-patterns",
  },
  {
    id: "simulator",
    markerAnchor: AMG_DESIGNER.simulator,
    title: "Simulation",
  },
  {
    id: "layout",
    markerAnchor: AMG_DESIGNER.layout,
    title: "Layout & overview",
  },
  {
    id: "editButton",
    markerAnchor: AMG_DESIGNER.editGraph,
    title: "Edit graph mode",
  },
  {
    id: "editToolbox",
    markerAnchor: AMG_DESIGNER.toolbox,
    title: "Edit toolbox",
  },
  {
    id: "editCanvas",
    markerAnchor: AMG_DESIGNER.canvas,
    title: "Canvas & graph",
    stepGroupKey: "editSurface",
  },
  {
    id: "editDetails",
    markerAnchor: AMG_DESIGNER.details,
    title: "Details panel",
    stepGroupKey: "editSurface",
  },
  {
    id: "fullscreen",
    markerAnchor: AMG_DESIGNER.fullscreen,
    title: "Fullscreen workspace",
  },
];

/** Centered 3-step welcome on project `/project/.../patterns` only */
const PROJECT_WELCOME_STEPS: { title: string; body: string }[] = [
  {
    title: "Welcome to AMG-APD",
    body: "This is the Architecture Model Generator & Anti-Pattern Detector patterns workspace. Here you can switch diagram versions, review the live graph and YAML, open suggestions to address detections, download exports, jump to simulation, and use edit mode when you need to change the model.",
  },
  {
    title: "Blue question marks",
    body: "Blue (?) markers appear beside key areas of the page. Each marker opens a short guided tour for that topic—versions, exports, legend, layout, the editor, toolbox, and more—so you can learn the UI at your own pace.",
  },
  {
    title: "Turn guides on or off",
    body: "Use the Guides control in the page header (and in the graph toolbar when you are in the workspace) to show or hide these highlights. Your preference is remembered for next time you open this page.",
  },
];

function qs(anchor: AmgDesignerAnchor): string {
  return `[data-amg-designer="${anchor}"]`;
}

const EDIT_TOOLBOX_CHAPTER_ID = "editToolbox";

function scrollDesignerToolboxAntiIntoView() {
  const el = document.querySelector(qs(AMG_DESIGNER.editToolboxAntiPatterns));
  if (el instanceof HTMLElement) {
    el.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }
}

function scrollDesignerToolboxListToTop() {
  const root = document.querySelector("[data-amg-designer-toolbox-scroll]");
  if (root instanceof HTMLElement) {
    root.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function stepSelector(step: DesignerTourStep): string {
  return step.anchorSelector ?? qs(step.anchor);
}

function getRectFromSelector(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  if (!el || !(el instanceof HTMLElement)) return null;
  return el.getBoundingClientRect();
}

function getVisibleGuidesControlRect(): DOMRect | null {
  const sel = qs(AMG_DESIGNER.guides);
  const nodes = document.querySelectorAll(sel);
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!(el instanceof HTMLElement)) continue;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

const GUIDES_INTRO_POPOVER_GAP = 12;
const GUIDES_INTRO_POPOVER_MARGIN = 12;
const GUIDES_INTRO_MAX_W_PX = 352;
/** Rough minimum vertical space desired below anchor before flipping above */
const GUIDES_INTRO_MIN_SPACE_BELOW = 168;

function welcomeIntroPanelStyle(anchor: DOMRect | null): CSSProperties {
  const vw =
    typeof window !== "undefined" ? window.innerWidth : GUIDES_INTRO_MAX_W_PX;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;
  const maxW = Math.min(
    GUIDES_INTRO_MAX_W_PX,
    vw - GUIDES_INTRO_POPOVER_MARGIN * 2,
  );

  if (!anchor || anchor.width <= 0) {
    return {
      position: "fixed",
      zIndex: 30,
      right: GUIDES_INTRO_POPOVER_MARGIN + 6,
      bottom: GUIDES_INTRO_POPOVER_MARGIN + 8,
      left: "auto",
      top: "auto",
      width: maxW,
      maxWidth: maxW,
    };
  }

  let left = anchor.left;
  left = Math.max(
    GUIDES_INTRO_POPOVER_MARGIN,
    Math.min(left, vw - GUIDES_INTRO_POPOVER_MARGIN - maxW),
  );

  const topBelow = anchor.bottom + GUIDES_INTRO_POPOVER_GAP;
  const spaceBelow = vh - topBelow - GUIDES_INTRO_POPOVER_MARGIN;
  const spaceAbove = anchor.top - GUIDES_INTRO_POPOVER_MARGIN * 2;
  const placeAbove =
    spaceBelow < GUIDES_INTRO_MIN_SPACE_BELOW && spaceAbove > spaceBelow;

  if (placeAbove) {
    return {
      position: "fixed",
      zIndex: 30,
      left,
      bottom: vh - anchor.top + GUIDES_INTRO_POPOVER_GAP,
      top: "auto",
      width: maxW,
      maxWidth: maxW,
      maxHeight: Math.min(0.55 * vh, anchor.top - GUIDES_INTRO_POPOVER_GAP * 2),
    };
  }

  return {
    position: "fixed",
    zIndex: 30,
    left,
    top: topBelow,
    width: maxW,
    maxWidth: maxW,
    maxHeight: Math.min(0.55 * vh, vh - topBelow - GUIDES_INTRO_POPOVER_MARGIN),
  };
}

function waitForSelector(
  selector: string,
  timeoutMs = 3500,
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el instanceof HTMLElement) {
        resolve(el);
        return;
      }
      if (performance.now() - t0 > timeoutMs) {
        resolve(null);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function SpotlightCutout({ rect, pad = 8 }: { rect: DOMRect; pad?: number }) {
  const t = Math.max(0, rect.top - pad);
  const l = Math.max(0, rect.left - pad);
  const r = rect.right + pad;
  const b = rect.bottom + pad;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;

  return (
    <>
      <div
        className="pointer-events-none fixed bg-slate-950/70 backdrop-blur-[1px]"
        style={{ zIndex: ACTIVE_TOUR_Z, top: 0, left: 0, right: 0, height: t }}
      />
      <div
        className="pointer-events-none fixed bg-slate-950/70 backdrop-blur-[1px]"
        style={{
          zIndex: ACTIVE_TOUR_Z,
          top: t,
          left: 0,
          width: l,
          height: b - t,
        }}
      />
      <div
        className="pointer-events-none fixed bg-slate-950/70 backdrop-blur-[1px]"
        style={{
          zIndex: ACTIVE_TOUR_Z,
          top: t,
          left: r,
          width: Math.max(0, vw - r),
          height: b - t,
        }}
      />
      <div
        className="pointer-events-none fixed bg-slate-950/70 backdrop-blur-[1px]"
        style={{ zIndex: ACTIVE_TOUR_Z, top: b, left: 0, right: 0, bottom: 0 }}
      />
    </>
  );
}

function pipPosition(rect: DOMRect, pipSize = 22) {
  return {
    left: rect.right - pipSize * 0.35,
    top: rect.top - pipSize * 0.45,
  };
}

/**
 * Hide markers that would draw in the top chrome while the anchored element extends below it
 * (scrolled workspace). Anchors that live entirely in the toolbar stay visible.
 */
function hideDesignerMarkerForStickyOverlap(rect: DOMRect): boolean {
  const { top: pipTop } = pipPosition(rect, 22);
  if (pipTop >= STICKY_TOOLBAR_GUARD_PX) return false;
  if (rect.bottom <= STICKY_TOOLBAR_GUARD_PX + 8) return false;
  return true;
}

/** Idle hint — z below sticky header so it disappears under the chrome when scrolled */
function DesignerHintPip({
  rect,
  onClick,
  title,
  projectPatternsStyling,
}: {
  rect: DOMRect;
  onClick: () => void;
  title: string;
  projectPatternsStyling?: boolean;
}) {
  const pipSize = projectPatternsStyling ? 26 : 22;
  const { left, top } = pipPosition(rect, pipSize);
  const off =
    rect.bottom < -2 ||
    rect.top > (typeof window !== "undefined" ? window.innerHeight + 8 : 900);

  if (off) return null;
  if (hideDesignerMarkerForStickyOverlap(rect)) return null;

  const pipCls = projectPatternsStyling
    ? PROJECT_GUIDE_MARKER_INTERACTIVE
    : GUIDE_MARKER_INTERACTIVE;

  return (
    <button
      type="button"
      title={title}
      aria-label={`Guide: ${title}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`${pipCls} fixed`}
      style={{
        zIndex: DESIGNER_PIP_Z,
        left,
        top,
      }}
    >
      <span aria-hidden>?</span>
    </button>
  );
}

/** Gleam shown during welcome intro — above sticky header so markers stay visible */
function DesignerWelcomeGleam({
  rect,
  title,
  projectPatternsStyling,
  zIndex = DESIGNER_WELCOME_GLEAM_Z,
  allowStickyOverlap = false,
}: {
  rect: DOMRect;
  title: string;
  projectPatternsStyling?: boolean;
  zIndex?: number;
  /** When true, still show gleam in top toolbar overlap zone (welcome spotlights) */
  allowStickyOverlap?: boolean;
}) {
  const pipSize = projectPatternsStyling ? 26 : 22;
  const { left, top } = pipPosition(rect, pipSize);
  const off =
    rect.bottom < -2 ||
    rect.top > (typeof window !== "undefined" ? window.innerHeight + 8 : 900);
  if (off) return null;
  if (!allowStickyOverlap && hideDesignerMarkerForStickyOverlap(rect))
    return null;
  const pipCls = projectPatternsStyling
    ? PROJECT_GUIDE_MARKER_STATIC
    : GUIDE_MARKER_STATIC;
  return (
    <div
      className={`${pipCls} pointer-events-none fixed`}
      style={{ zIndex, left: left - 1, top: top - 1 }}
      title={title}
      aria-hidden
    >
      ?
    </div>
  );
}

function WelcomeDimWithHoles({
  rects,
  maskId,
  zIndex = 18,
}: {
  rects: DOMRect[];
  maskId: string;
  /** Raise above local overlays (e.g. project welcome sits above dim, below dialog) */
  zIndex?: number;
}) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const pad = 6;

  return (
    <svg
      className="pointer-events-none fixed inset-0 h-full w-full"
      viewBox={`0 0 ${vw} ${vh}`}
      preserveAspectRatio="none"
      style={{ zIndex }}
      aria-hidden
    >
      <defs>
        <mask id={maskId}>
          <rect width="100%" height="100%" fill="white" />
          {rects.map((r, i) => (
            <rect
              key={i}
              x={Math.max(0, r.left - pad)}
              y={Math.max(0, r.top - pad)}
              width={r.width + pad * 2}
              height={r.height + pad * 2}
              rx={10}
              fill="black"
            />
          ))}
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(15,23,42,0.78)"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}

function buildSuggestionTourSteps(
  onRunSuggestionsForTour: () => Promise<void>,
  onExpandFirstPreview?: () => void,
): DesignerTourStep[] {
  const modalSel = `[data-amg-designer="${AMG_DESIGNER.suggestionModal}"]`;
  return [
    {
      anchor: AMG_DESIGNER.viewSuggestions,
      title: "View Suggestions",
      body: (
        <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
          <p>
            This runs the assistant on your current YAML when anti-patterns
            exist. You receive one card per proposed change, with bullets and a
            structural preview when the API provides one.
          </p>
          <p className="text-[11px] text-white/50">
            The next step opens the panel and walks through the{" "}
            <strong className="text-white/70">first</strong> suggestion returned
            for your graph.
          </p>
        </div>
      ),
    },
    {
      anchor: AMG_DESIGNER.suggestionModal,
      title: "Suggestions panel",
      beforeEnter: async () => {
        await onRunSuggestionsForTour();
        await waitForSelector(modalSel, 8000);
      },
      body: (
        <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
          <p>
            The header summarizes the flow: pick fixes, then confirm. Close (✕)
            or Cancel leaves everything unchanged.
          </p>
        </div>
      ),
    },
    {
      anchor: AMG_DESIGNER.suggestionModalToolbar,
      title: "Select all & Unselect all",
      body: (
        <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
          <p>
            <strong className="text-white/90">Select all</strong> checks every
            suggestion. <strong className="text-white/90">Unselect all</strong>{" "}
            clears the list so you can cherry-pick individual cards. The footer
            shows how many are selected.
          </p>
        </div>
      ),
    },
    {
      anchor: AMG_DESIGNER.suggestionFirstCard,
      title: "First suggestion card",
      body: (
        <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
          <p>
            Each row is one fix: title, anti-pattern kind chip, bullet list, and
            optional auto-fix notes. Click the row or the square to toggle
            whether that suggestion is included when you apply.
          </p>
        </div>
      ),
    },
    {
      anchor: AMG_DESIGNER.suggestionFirstPreview,
      title: "Before / after diagram",
      beforeEnter: async () => {
        onExpandFirstPreview?.();
        await new Promise((r) => window.setTimeout(r, 280));
      },
      body: (
        <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
          <p>
            When the API supplies preview data, this block sketches how calls or
            dependencies would change. The full{" "}
            <strong className="text-white/85">Before</strong> /{" "}
            <strong className="text-white/85">After</strong> pair opens here
            automatically so you can read captions, mini diagrams, and the
            footnote without using the toggle.
          </p>
          <p className="text-[11px] text-white/50">
            On other cards you can still expand or collapse the same control
            yourself.
          </p>
        </div>
      ),
    },
    {
      anchor: AMG_DESIGNER.suggestionModalFooter,
      title: "Apply suggestions",
      body: (
        <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
          <p>
            <strong className="text-white/90">Apply suggestions</strong> merges
            selected fixes into YAML, re-runs analysis, and saves a new version.
            Cancel closes without changes.
          </p>
        </div>
      ),
    },
  ];
}

function buildSteps(args: {
  onOpenVersionsMenu: () => void;
  onPrepareEditWorkspace: () => void;
  onExpandDetailAccordions: () => void;
  hasSuggestionsTour: boolean;
  onRunSuggestionsForTour?: () => Promise<void>;
  onExpandSuggestionFirstPreview?: () => void;
  onRequestOpenSimulationModal?: () => void;
}): Record<string, DesignerTourStep[]> {
  const {
    onOpenVersionsMenu,
    onPrepareEditWorkspace,
    onExpandDetailAccordions,
    hasSuggestionsTour,
    onRunSuggestionsForTour,
    onExpandSuggestionFirstPreview,
    onRequestOpenSimulationModal,
  } = args;

  const simModalSel = qs(AMG_DESIGNER.simulationModal);

  const ensureVersionsPortalOpen = async () => {
    onOpenVersionsMenu();
    await waitForSelector("#versions-dropdown-portal", 4000);
    await new Promise((r) => window.setTimeout(r, 120));
  };

  const scrollToDesignerAnchor = async (anchor: AmgDesignerAnchor) => {
    const el = await waitForSelector(qs(anchor), 4000);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    await new Promise((r) => window.setTimeout(r, 180));
  };

  const ensureSimulationModalOpen = async () => {
    onRequestOpenSimulationModal?.();
    await waitForSelector(simModalSel, 5000);
    await new Promise((r) => window.setTimeout(r, 120));
  };

  const base: Record<string, DesignerTourStep[]> = {
    versions: [
      {
        anchor: AMG_DESIGNER.versions,
        title: "Versions",
        body: "Each time you analyze or save the architecture, the system keeps a numbered version. Open this menu to jump to an older snapshot, rename a version, or delete one (you must keep at least one).",
      },
      {
        anchor: AMG_DESIGNER.versionCompare,
        title: "Compare versions",
        beforeEnter: async () => {
          await ensureVersionsPortalOpen();
          const el = await waitForSelector(
            `[data-amg-designer="${AMG_DESIGNER.versionCompare}"]`,
            4000,
          );
          el?.scrollIntoView({ block: "nearest", inline: "nearest" });
          await new Promise((r) => window.setTimeout(r, 220));
        },
        body: "Compare opens a side-by-side view of two saved versions so you can see how the graph and detections changed over time. It is especially useful after refactors or suggestion fixes.",
      },
      {
        anchor: AMG_DESIGNER.versionMove,
        title: "Move to this version",
        beforeEnter: async () => {
          await ensureVersionsPortalOpen();
          await scrollToDesignerAnchor(AMG_DESIGNER.versionMove);
        },
        body: "Loads the saved YAML and graph for that snapshot into the designer without creating a new version. Use it to audit an older architecture or recover from a bad edit.",
      },
      {
        anchor: AMG_DESIGNER.versionRename,
        title: "Rename a version",
        beforeEnter: async () => {
          await ensureVersionsPortalOpen();
          await scrollToDesignerAnchor(AMG_DESIGNER.versionRename);
        },
        body: "Opens an inline editor for the friendly title (the #number stays fixed). Save commits the new label to the server; Escape cancels.",
      },
      {
        anchor: AMG_DESIGNER.versionDelete,
        title: "Delete a version",
        beforeEnter: async () => {
          await ensureVersionsPortalOpen();
          await scrollToDesignerAnchor(AMG_DESIGNER.versionDelete);
        },
        body: "Permanently removes that snapshot after you confirm in the dialog. You cannot delete the last remaining version, so create another save first if you need to prune history.",
      },
    ],
    toolbarDownloads: [
      {
        anchor: AMG_DESIGNER.toolbarDownloads,
        title: "Exports & downloads",
        body: "Download YAML saves the live architecture text from the editor. Download JSON bundles the graph plus detections and version metadata. Download Image exports the diagram as PNG.",
      },
    ],
    returnToChat: [
      {
        anchor: AMG_DESIGNER.returnToChat,
        title: "Return to chat",
        body: "When you opened patterns from a project conversation, this jumps back to that chat and attaches the latest diagram version so you can keep iterating with context.",
      },
    ],
    legend: buildLegendTourSteps(),
    simulator: [
      {
        anchor: AMG_DESIGNER.simulator,
        title: "Performance simulator",
        body: "Use Simulation in the page header when you want to stress-test or profile a saved snapshot. The next step opens the confirmation dialog to review each control.",
      },
      {
        anchor: AMG_DESIGNER.simulationModal,
        title: "Simulation dialog",
        beforeEnter: async () => {
          await ensureSimulationModalOpen();
        },
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              The modal locks in which{" "}
              <strong className="text-white/85">versioned graph</strong> the
              simulator should load. Nothing runs until you confirm. Cancel
              closes the dialog and keeps you on the patterns page.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.simulationVersionSelect,
        title: "Choose a version",
        beforeEnter: async () => {
          await ensureSimulationModalOpen();
        },
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              Pick any saved snapshot from the dropdown (newest analyze/generate
              runs appear at the top of the list). The simulator route receives
              the version id so results line up with what you see in the canvas.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.simulationModalFooter,
        title: "Proceed or cancel",
        beforeEnter: async () => {
          await ensureSimulationModalOpen();
        },
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              <strong className="text-white/90">Proceed</strong> is enabled only
              after a version is selected. It navigates to the performance
              simulation flow. <strong className="text-white/90">Cancel</strong>{" "}
              closes the modal and leaves the designer unchanged.
            </p>
          </div>
        ),
      },
    ],
    layout: [
      {
        anchor: AMG_DESIGNER.layout,
        title: "Layout algorithms",
        body: "Choose how nodes are arranged: layered (Dagre / ELK), or force-directed (Cose-Bilkent / Cola). Fit to Screen recenters the diagram. Changing layout does not edit the model; it only changes the view.",
      },
      {
        anchor: AMG_DESIGNER.stats,
        title: "Live counts",
        body: "These chips summarize services, gateways, topics, databases, external systems, clients, actors, edges, and how many anti-pattern instances are in the current graph.",
      },
    ],
    fullscreen: [
      {
        anchor: AMG_DESIGNER.fullscreen,
        title: "Fullscreen workspace",
        body: "Fullscreen maximizes the graph workspace: the legend moves into the chrome and the page header hides so you can edit large diagrams with less clutter. Exit fullscreen to reach versions, downloads, and the rest of the page again.",
      },
    ],
    editButton: [
      {
        anchor: AMG_DESIGNER.editGraph,
        title: "Edit graph (before you click)",
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              Use <strong className="text-white/90">Edit Graph</strong> when you
              want to change the diagram. After you turn it on, the same control
              reads <strong className="text-white/90">Exit edit mode</strong> so
              you can leave a safe view-only state.
            </p>
            <p className="text-[11px] text-white/50">
              Turn on edit mode first, then use the sparkle on the toolbox,
              canvas, or details column for the deeper guides.
            </p>
          </div>
        ),
      },
    ],
    editToolbox: [
      {
        anchor: AMG_DESIGNER.editToolboxSearch,
        title: "Search tools",
        beforeEnter: () => {
          onPrepareEditWorkspace();
        },
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              Filter the toolbox by name or hint text. Headings such as{" "}
              <strong className="text-white/85">Nodes</strong> or{" "}
              <strong className="text-white/85">Anti-patterns</strong> also
              match so you can jump to a whole section quickly.
            </p>
            <p className="text-[11px] text-white/50">
              Clearing the field shows every draggable row again.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.editToolboxNodes,
        title: "Nodes",
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              Each row is a diagram node type (service, API gateway, database,
              event topic, external system, client, user/actor).{" "}
              <strong className="text-white/85">Drag</strong> a row onto the
              canvas to drop a new node; the row highlights while you drag.
            </p>
            <p className="text-[11px] text-white/50">
              After drop, you can move nodes, connect them, and rename from the
              details column.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.editToolboxAntiPatterns,
        title: "Anti-patterns",
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              These rows are{" "}
              <strong className="text-white/85">sample subgraphs</strong>{" "}
              tailored to trigger a specific detector. Drag one onto empty
              canvas space to insert the template, then wire it into your
              architecture to explore how detections appear.
            </p>
            <p className="text-[11px] text-white/50">
              They are teaching aids, not a silent change to production YAML
              without your intent.
            </p>
          </div>
        ),
      },
    ],
    editSurface: [
      {
        anchor: AMG_DESIGNER.canvas,
        title: "Canvas overview",
        beforeEnter: () => {
          onPrepareEditWorkspace();
          onExpandDetailAccordions();
        },
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              This is the live Cytoscape diagram: pan by dragging the
              background, zoom with the scroll wheel or pinch, and use the
              layout picker in the control strip to re-run Dagre, ELK,
              Cose-Bilkent, or Cola without changing the underlying model.
            </p>
            <p className="text-[11px] text-white/50">
              The next step explains borders, detection orbs, and how call edges
              encode protocols. After that, the tour covers hover tips,
              selection, and the context menu.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.canvas,
        title: "Borders, orbs, and connections",
        beforeEnter: () => {
          onPrepareEditWorkspace();
          onExpandDetailAccordions();
        },
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              <strong className="text-white/85">Nodes</strong> pick up a tinted{" "}
              <strong className="text-white/85">border</strong> when a detection
              touches them. The hue follows the anti-pattern family and the
              stroke weight hints at severity.{" "}
              <strong className="text-white/85">Selected</strong> nodes switch
              to a crisp dark outline so you can tell focus apart from findings.
            </p>
            <p>
              When several findings share one node, small{" "}
              <strong className="text-white/85">colored orbs</strong> sit under
              the shape. Each dot mirrors a legend color so you can see
              multiplicity at a glance.
            </p>
            <p>
              <strong className="text-white/85">Call edges</strong> show the
              transport (<strong className="text-white/80">REST</strong>,{" "}
              <strong className="text-white/80">gRPC</strong>, or{" "}
              <strong className="text-white/80">Event</strong>) and whether
              traffic is <strong className="text-white/80">synchronous</strong>{" "}
              vs <strong className="text-white/80">asynchronous</strong>.
              Animated flow markers travel along active lanes so bidirectional
              or reciprocal patterns read clearly.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.canvas,
        title: "Hover tooltips",
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              Moving the pointer over a node or edge opens a compact tooltip:
              kind, label, key metrics, and call/dependency hints where the
              style encodes them. It helps you confirm what you are about to
              select before you click.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.canvas,
        title: "Click to select",
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              Click a node or edge to select it. The right-hand{" "}
              <strong className="text-white/85">Details</strong> column syncs to
              that selection. Expanding sections there shows node or connection
              fields, detection context, and export snippets tied to the same
              item.
            </p>
            <p className="text-[11px] text-white/50">
              Click empty canvas space to clear the selection when you only need
              the big picture.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.canvas,
        title: "Right-click menu",
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              In edit mode,{" "}
              <strong className="text-white/85">right-click a node</strong> for
              Rename, Add connection (when a connect tool is active), Copy,
              Delete, and related actions.{" "}
              <strong className="text-white/85">Right-click an edge</strong> to
              remove or adjust that connection.{" "}
              <strong className="text-white/85">
                Right-click empty canvas
              </strong>{" "}
              to paste a copied node when the clipboard has one.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.connectionTools,
        title: "Connection tools",
        beforeEnter: () => {
          onPrepareEditWorkspace();
          onExpandDetailAccordions();
        },
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              Choose the active edge tool (for example{" "}
              <strong className="text-white/85">Calls</strong>), then click a
              source node and a target to draw a link. Defaults for REST, gRPC,
              Event, sync vs async apply to new edges; you can still refine a
              selected edge in the details block.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.detailsSelection,
        title: "Selection details",
        beforeEnter: () => {
          onPrepareEditWorkspace();
          onExpandDetailAccordions();
        },
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              This accordion opens when you care about the current selection.
              For a node it exposes rename (inline when edit mode is on),
              metadata, and incident lists; for an edge it surfaces protocol,
              direction, and edit controls so call lanes stay consistent with
              the graph.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.detailsAntiPattern,
        title: "Anti-pattern details",
        beforeEnter: () => {
          onPrepareEditWorkspace();
          onExpandDetailAccordions();
        },
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              Lists detections that involve the selected node or edge (kinds,
              severities, and references into the YAML-backed graph). Use it
              together with the legend chips to see why a node is highlighted in
              rose or amber tones on the canvas.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.detailsExport,
        title: "Live graph export",
        beforeEnter: () => {
          onPrepareEditWorkspace();
          onExpandDetailAccordions();
        },
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              Streams JSON and YAML previews derived from the current Cytoscape
              state so you can copy snippets into tickets or compare against
              saved versions without leaving the designer.
            </p>
          </div>
        ),
      },
      {
        anchor: AMG_DESIGNER.generate,
        title: "Save your edits",
        beforeEnter: () => {
          onPrepareEditWorkspace();
        },
        body: (
          <div className="space-y-2 text-[12px] leading-relaxed text-white/70">
            <p>
              <strong className="text-white/90">Generate Graph</strong>{" "}
              validates the graph, rebuilds layout, re-runs anti-pattern
              detection, and stores a new version.{" "}
              <strong className="text-white/90">Reset</strong> discards
              canvas-only changes and returns you to the last saved baseline.
            </p>
          </div>
        ),
      },
    ],
  };

  if (hasSuggestionsTour && onRunSuggestionsForTour) {
    base.suggestions = buildSuggestionTourSteps(
      onRunSuggestionsForTour,
      onExpandSuggestionFirstPreview,
    );
  }

  return base;
}

type PatternsDesignerTourProps = {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  onRequestVersionsMenuOpen: () => void;
  onRequestEditWorkspace: () => void;
  onRequestExpandDetailAccordions: () => void;
  hasSuggestionsTour: boolean;
  onRunSuggestionsForTour?: () => Promise<void>;
  /** Bump to expand the first suggestion card’s before/after block while on that tour step. */
  onRequestExpandSuggestionFirstPreview?: () => void;
  /** Open the performance simulation confirmation modal (tour). */
  onRequestOpenSimulationModal?: () => void;
  /** When false, the Return to chat sparkle chapter is omitted (button not shown). */
  hasReturnToChatTour?: boolean;
  welcomeIntroOpen?: boolean;
  onDismissWelcomeIntro?: () => void;
  onTourChapterClose?: () => void;
  /** Project `/project/.../patterns` only: blue ? pips, gray guide panels, white/gray actions */
  projectPatternsStyling?: boolean;
};

export default function PatternsDesignerTour({
  enabled,
  onEnabledChange,
  onRequestVersionsMenuOpen,
  onRequestEditWorkspace,
  onRequestExpandDetailAccordions,
  hasSuggestionsTour,
  onRunSuggestionsForTour,
  onRequestExpandSuggestionFirstPreview,
  onRequestOpenSimulationModal,
  hasReturnToChatTour = false,
  welcomeIntroOpen = false,
  onDismissWelcomeIntro,
  onTourChapterClose,
  projectPatternsStyling = false,
}: PatternsDesignerTourProps) {
  const maskId = useId().replace(/:/g, "");
  const welcomeSpotlightMaskId = `${useId().replace(/:/g, "")}-wspot`;
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);
  const [markerRects, setMarkerRects] = useState<
    Partial<Record<AmgDesignerAnchor, DOMRect>>
  >({});
  const [welcomeRects, setWelcomeRects] = useState<DOMRect[]>([]);
  const [guidesButtonRect, setGuidesButtonRect] = useState<DOMRect | null>(
    null,
  );
  const [welcomeProjectStep, setWelcomeProjectStep] = useState(0);
  const [welcomeHighlightFrames, setWelcomeHighlightFrames] = useState<
    { rect: DOMRect; title: string }[]
  >([]);

  useEffect(() => {
    if (welcomeIntroOpen && projectPatternsStyling) {
      setWelcomeProjectStep(0);
    }
  }, [welcomeIntroOpen, projectPatternsStyling]);

  const chapterList = useMemo(() => {
    let list = CHAPTER_BASE.filter(
      (c) => c.id !== "suggestions" || hasSuggestionsTour,
    );
    if (!hasReturnToChatTour) {
      list = list.filter((c) => c.id !== "returnToChat");
    }
    return list;
  }, [hasSuggestionsTour, hasReturnToChatTour]);

  useLayoutEffect(() => {
    if (!enabled || !welcomeIntroOpen || !projectPatternsStyling || chapterId) {
      setWelcomeHighlightFrames([]);
      return;
    }
    const measure = () => {
      if (welcomeProjectStep === 1) {
        const list: { rect: DOMRect; title: string }[] = [];
        for (const ch of chapterList) {
          const r = getRectFromSelector(qs(ch.markerAnchor));
          if (r && r.width > 0 && r.height > 0) {
            list.push({ rect: r, title: ch.title });
          }
        }
        setWelcomeHighlightFrames(list);
      } else if (welcomeProjectStep === 2) {
        const list: { rect: DOMRect; title: string }[] = [];
        const sel = qs(AMG_DESIGNER.guides);
        document.querySelectorAll(sel).forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") {
            return;
          }
          const r = node.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            list.push({ rect: r, title: "Guides" });
          }
        });
        setWelcomeHighlightFrames(list);
      } else {
        setWelcomeHighlightFrames([]);
      }
    };
    measure();
    const id = window.setInterval(measure, 400);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [
    enabled,
    welcomeIntroOpen,
    projectPatternsStyling,
    chapterId,
    welcomeProjectStep,
    chapterList,
  ]);

  const stepsByChapter = useMemo(
    () =>
      buildSteps({
        onOpenVersionsMenu: onRequestVersionsMenuOpen,
        onPrepareEditWorkspace: onRequestEditWorkspace,
        onExpandDetailAccordions: onRequestExpandDetailAccordions,
        hasSuggestionsTour,
        onRunSuggestionsForTour,
        onExpandSuggestionFirstPreview: onRequestExpandSuggestionFirstPreview,
        onRequestOpenSimulationModal,
      }),
    [
      onRequestVersionsMenuOpen,
      onRequestEditWorkspace,
      onRequestExpandDetailAccordions,
      hasSuggestionsTour,
      onRunSuggestionsForTour,
      onRequestExpandSuggestionFirstPreview,
      onRequestOpenSimulationModal,
    ],
  );

  const activeSteps = useMemo(() => {
    if (!chapterId) return [];
    const meta = chapterList.find((c) => c.id === chapterId);
    const key = meta?.stepGroupKey ?? chapterId;
    return stepsByChapter[key] ?? [];
  }, [chapterId, chapterList, stepsByChapter]);
  const activeStep = activeSteps[stepIndex] ?? null;

  /** Wider card and taller body so “Reading the canvas” fits without scrolling when possible. */
  const isLegendReadingIntro = chapterId === "legend" && stepIndex === 0;

  const closeChapter = useCallback(() => {
    onTourChapterClose?.();
    setChapterId(null);
    setStepIndex(0);
    setSpotRect(null);
  }, [onTourChapterClose]);

  const prevToolboxChapterScrollRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!projectPatternsStyling) {
      prevToolboxChapterScrollRef.current = chapterId;
      return;
    }
    const prev = prevToolboxChapterScrollRef.current;
    prevToolboxChapterScrollRef.current = chapterId;
    if (prev === EDIT_TOOLBOX_CHAPTER_ID && chapterId === null) {
      scrollDesignerToolboxListToTop();
    }
  }, [chapterId, projectPatternsStyling]);

  const prevEditToolboxStepRef = useRef<number>(-1);
  useLayoutEffect(() => {
    if (!projectPatternsStyling || chapterId !== EDIT_TOOLBOX_CHAPTER_ID) {
      if (chapterId !== EDIT_TOOLBOX_CHAPTER_ID) {
        prevEditToolboxStepRef.current = -1;
      }
      return;
    }
    if (prevEditToolboxStepRef.current === -1) {
      prevEditToolboxStepRef.current = stepIndex;
      return;
    }
    const prev = prevEditToolboxStepRef.current;
    if (prev === 0 && stepIndex > 0) {
      scrollDesignerToolboxListToTop();
    }
    prevEditToolboxStepRef.current = stepIndex;
  }, [chapterId, stepIndex, projectPatternsStyling]);

  useLayoutEffect(() => {
    if (!enabled || !projectPatternsStyling) return;
    if (chapterId !== EDIT_TOOLBOX_CHAPTER_ID || stepIndex !== 0) return;
    const t = window.setTimeout(() => {
      scrollDesignerToolboxAntiIntoView();
    }, 220);
    return () => window.clearTimeout(t);
  }, [enabled, projectPatternsStyling, chapterId, stepIndex]);

  /** When guides are off, parent may pass new function refs each render; only react to real enabled toggles. */
  const prevEnabledRef = useRef<boolean | null>(null);
  const onTourChapterCloseRef = useRef(onTourChapterClose);
  onTourChapterCloseRef.current = onTourChapterClose;

  const startChapter = useCallback(
    (id: string) => {
      if (!enabled) return;
      const meta = chapterList.find((c) => c.id === id);
      const key = meta?.stepGroupKey ?? id;
      const steps = stepsByChapter[key];
      if (!steps?.length) return;
      setChapterId(id);
      setStepIndex(0);
    },
    [enabled, stepsByChapter, chapterList],
  );

  const [cardDrag, setCardDrag] = useState({ x: 0, y: 0 });
  const cardDragRef = useRef(cardDrag);
  cardDragRef.current = cardDrag;
  const cardDragSession = useRef<{
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);

  useEffect(() => {
    if (!chapterId) setCardDrag({ x: 0, y: 0 });
  }, [chapterId]);

  useLayoutEffect(() => {
    if (!chapterId || !activeStep) {
      setSpotRect(null);
      return;
    }

    let cancelled = false;

    const measure = async () => {
      if (activeStep.beforeEnter) {
        await activeStep.beforeEnter();
      }
      if (cancelled) return;
      await new Promise((r) => window.setTimeout(r, 160));
      if (cancelled) return;
      const sel = stepSelector(activeStep);
      await waitForSelector(sel, 4500);
      if (cancelled) return;
      const r = getRectFromSelector(sel);
      setSpotRect(r);
    };

    void measure();

    const onScroll = () => {
      if (!activeStep) return;
      const r = getRectFromSelector(stepSelector(activeStep));
      setSpotRect(r);
    };

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [chapterId, activeStep]);

  useLayoutEffect(() => {
    if (!enabled || chapterId) {
      setMarkerRects({});
      return;
    }
    if (welcomeIntroOpen) {
      setMarkerRects({});
      return;
    }

    const measureMarkers = () => {
      const next: Partial<Record<AmgDesignerAnchor, DOMRect>> = {};
      for (const ch of chapterList) {
        const r = getRectFromSelector(qs(ch.markerAnchor));
        if (r && r.width > 0 && r.height > 0) {
          next[ch.markerAnchor] = r;
        }
      }
      setMarkerRects(next);
    };

    measureMarkers();
    const id = window.setInterval(measureMarkers, 600);
    window.addEventListener("scroll", measureMarkers, true);
    window.addEventListener("resize", measureMarkers);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("scroll", measureMarkers, true);
      window.removeEventListener("resize", measureMarkers);
    };
  }, [enabled, chapterId, welcomeIntroOpen, chapterList]);

  useLayoutEffect(() => {
    if (!enabled || !welcomeIntroOpen || chapterId) {
      setWelcomeRects([]);
      return;
    }
    const measure = () => {
      const list: DOMRect[] = [];
      for (const ch of chapterList) {
        const r = getRectFromSelector(qs(ch.markerAnchor));
        if (r && r.width > 0 && r.height > 0) list.push(r);
      }
      setWelcomeRects(list);
    };
    measure();
    const id = window.setInterval(measure, 400);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [enabled, welcomeIntroOpen, chapterId, chapterList]);

  useLayoutEffect(() => {
    if (!enabled || !welcomeIntroOpen || chapterId) {
      setGuidesButtonRect(null);
      return;
    }
    const measure = () => {
      setGuidesButtonRect(getVisibleGuidesControlRect());
    };
    measure();
    const id = window.setInterval(measure, 400);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [enabled, welcomeIntroOpen, chapterId]);

  useEffect(() => {
    const wasEnabled = prevEnabledRef.current;
    if (wasEnabled === true && !enabled) {
      onTourChapterCloseRef.current?.();
      if (projectPatternsStyling) {
        scrollDesignerToolboxListToTop();
      }
      setChapterId(null);
      setStepIndex(0);
      setSpotRect(null);
    }
    prevEnabledRef.current = enabled;
  }, [enabled, projectPatternsStyling]);

  useEffect(() => {
    if (!chapterId || !activeStep) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeChapter();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chapterId, activeStep, closeChapter]);

  if (typeof document === "undefined") return null;

  const showIdlePips = enabled && !chapterId && !welcomeIntroOpen;

  const portal = (
    <>
      {enabled && welcomeIntroOpen && !chapterId && (
        <>
          {projectPatternsStyling ? (
            <>
              {welcomeProjectStep === 0 && (
                <div
                  className="fixed inset-0 bg-slate-950/78"
                  style={{ zIndex: PROJECT_WELCOME_DIM_Z }}
                  aria-hidden
                />
              )}
              {welcomeProjectStep > 0 && welcomeHighlightFrames.length > 0 && (
                <WelcomeDimWithHoles
                  rects={welcomeHighlightFrames.map((f) => f.rect)}
                  maskId={welcomeSpotlightMaskId}
                  zIndex={PROJECT_WELCOME_DIM_Z}
                />
              )}
              {welcomeProjectStep > 0 &&
                welcomeHighlightFrames.length === 0 && (
                  <div
                    className="fixed inset-0 bg-slate-950/78"
                    style={{ zIndex: PROJECT_WELCOME_DIM_Z }}
                    aria-hidden
                  />
                )}
              {(welcomeProjectStep === 1 || welcomeProjectStep === 2) &&
                welcomeHighlightFrames.map((f, i) => (
                  <DesignerWelcomeGleam
                    key={`welcome-hl-${i}-${f.title}`}
                    rect={f.rect}
                    title={f.title}
                    projectPatternsStyling
                    zIndex={PROJECT_WELCOME_GLEAM_Z_EXTRA}
                    allowStickyOverlap
                  />
                ))}
              <div
                className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
                style={{ zIndex: PROJECT_WELCOME_DIALOG_Z }}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="designer-welcome-multi-title"
                  aria-describedby="designer-welcome-multi-desc"
                  className="pointer-events-auto flex w-full max-w-lg flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-900/98 p-5 text-gray-100 shadow-2xl ring-1 ring-black/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        Guided highlights · Step {welcomeProjectStep + 1} of 3
                      </p>
                      <h2
                        id="designer-welcome-multi-title"
                        className="mt-1 text-base font-semibold leading-snug text-white"
                      >
                        {PROJECT_WELCOME_STEPS[welcomeProjectStep]?.title ?? ""}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDismissWelcomeIntro?.()}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-gray-900 shadow-sm transition-colors hover:bg-gray-100"
                      aria-label="Dismiss"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <p
                    id="designer-welcome-multi-desc"
                    className="mt-3 text-sm leading-relaxed text-gray-300"
                  >
                    {PROJECT_WELCOME_STEPS[welcomeProjectStep]?.body ?? ""}
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-4">
                    {welcomeProjectStep > 0 && (
                      <button
                        type="button"
                        className="rounded-md border border-white/10 bg-zinc-800 px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:bg-zinc-700/90"
                        onClick={() =>
                          setWelcomeProjectStep((s) => Math.max(0, s - 1))
                        }
                      >
                        Back
                      </button>
                    )}
                    {welcomeProjectStep < 2 ? (
                      <button
                        type="button"
                        className="rounded-md bg-white px-4 py-2 text-xs font-semibold text-black shadow-sm transition-colors hover:bg-gray-100"
                        onClick={() =>
                          setWelcomeProjectStep((s) => Math.min(2, s + 1))
                        }
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-md bg-white px-4 py-2 text-xs font-semibold text-black shadow-sm transition-colors hover:bg-gray-100"
                        onClick={() => onDismissWelcomeIntro?.()}
                      >
                        Got it
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <WelcomeDimWithHoles rects={welcomeRects} maskId={maskId} />
              {chapterList.map((ch) => {
                const r = getRectFromSelector(qs(ch.markerAnchor));
                if (!r || r.width <= 0) return null;
                return (
                  <DesignerWelcomeGleam
                    key={`w-${ch.id}`}
                    rect={r}
                    title={ch.title}
                    projectPatternsStyling={projectPatternsStyling}
                  />
                );
              })}
              <div
                role="dialog"
                aria-labelledby="designer-welcome-intro-title"
                aria-describedby="designer-welcome-intro-desc"
                className="pointer-events-auto flex min-h-0 flex-col gap-2 overflow-hidden rounded-md bg-white/95 px-3 py-2.5 text-black shadow-xl ring-1 ring-black/10 backdrop-blur-sm sm:min-w-[min(18rem,calc(100vw-1.5rem))]"
                style={welcomeIntroPanelStyle(guidesButtonRect)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-black/55">
                      Guides
                    </p>
                    <h3
                      id="designer-welcome-intro-title"
                      className="mt-0.5 text-sm font-semibold leading-snug text-black"
                    >
                      Guided highlights
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDismissWelcomeIntro?.()}
                    className="rounded p-0.5 text-black/60 transition-colors hover:bg-black/10 hover:text-black shrink-0"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <p
                  id="designer-welcome-intro-desc"
                  className="min-h-0 flex-1 overflow-y-auto text-xs leading-relaxed text-black/80 pr-0.5"
                >
                  Help (?) markers appear on the main areas of this page
                  (versions, exports, legend, layout, editor, and more). Click
                  any marker whenever you want a short guided tour for that
                  topic.
                </p>
                <button
                  type="button"
                  onClick={() => onDismissWelcomeIntro?.()}
                  className="mt-1 w-full rounded-md bg-black py-2 text-xs font-semibold text-white transition-colors hover:bg-black/90"
                >
                  Got it
                </button>
              </div>
            </>
          )}
        </>
      )}

      {showIdlePips && (
        <>
          {chapterList.map((ch) => {
            const r = markerRects[ch.markerAnchor];
            if (!r) return null;
            return (
              <DesignerHintPip
                key={ch.id}
                rect={r}
                title={ch.title}
                projectPatternsStyling={projectPatternsStyling}
                onClick={() => startChapter(ch.id)}
              />
            );
          })}
        </>
      )}

      {enabled && chapterId && activeStep && (
        <div
          className="pointer-events-none fixed inset-0"
          style={{ zIndex: ACTIVE_TOUR_Z - 1 }}
        >
          {spotRect && <SpotlightCutout rect={spotRect} />}
          <div
            className={`pointer-events-auto fixed bottom-5 left-4 w-auto overflow-hidden shadow-xl sm:left-auto sm:right-6 ${
              projectPatternsStyling
                ? "rounded-lg border border-white/10 bg-zinc-900/98 ring-1 ring-black/25"
                : "rounded-md border border-gray-700 bg-[#1F1F1F]"
            } ${
              isLegendReadingIntro
                ? "right-4 max-h-[min(88vh,680px)] sm:w-[min(100vw-2rem,34rem)]"
                : "right-4 max-h-[min(72vh,520px)] max-w-md sm:w-[min(100vw-2rem,26rem)]"
            }`}
            style={{
              zIndex: ACTIVE_TOUR_Z + 5,
              transform: `translate(${cardDrag.x}px, ${cardDrag.y}px)`,
            }}
          >
            <div
              className={`cursor-grab select-none border-b px-4 py-3 active:cursor-grabbing ${
                projectPatternsStyling
                  ? "border-white/10 bg-zinc-800/90"
                  : "border-gray-700"
              }`}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                if ((e.target as HTMLElement).closest("button")) return;
                cardDragSession.current = {
                  sx: e.clientX,
                  sy: e.clientY,
                  ox: cardDragRef.current.x,
                  oy: cardDragRef.current.y,
                };
                const onMove = (ev: MouseEvent) => {
                  const s = cardDragSession.current;
                  if (!s) return;
                  setCardDrag({
                    x: s.ox + ev.clientX - s.sx,
                    y: s.oy + ev.clientY - s.sy,
                  });
                };
                const onUp = () => {
                  cardDragSession.current = null;
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
                e.preventDefault();
              }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Guides
              </p>
              <p className="text-[11px] font-normal normal-case text-gray-500">
                Drag this bar to move the card.
              </p>
            </div>
            <div
              className={`overflow-y-auto px-4 py-3 ${
                isLegendReadingIntro
                  ? "max-h-[min(76vh,600px)]"
                  : "max-h-[min(60vh,440px)]"
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {activeStep.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeChapter}
                  className={
                    projectPatternsStyling
                      ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-gray-900 shadow-sm transition-colors hover:bg-gray-100"
                      : "rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-700/50 hover:text-gray-200"
                  }
                  aria-label="Close guide"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              {!spotRect && (
                <p className="mb-2 text-[11px] text-amber-400/95">
                  The highlight is not visible yet. Try leaving fullscreen or
                  expanding any collapsed panels, then open this guide again.
                </p>
              )}
              <div
                className={
                  projectPatternsStyling
                    ? "text-[12px] leading-relaxed text-gray-300 [&_strong]:text-white/95"
                    : "text-[12px] leading-relaxed text-gray-400"
                }
              >
                {typeof activeStep.body === "string" ? (
                  <p className="whitespace-pre-line">{activeStep.body}</p>
                ) : (
                  activeStep.body
                )}
              </div>
              <div
                className={`mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 ${
                  projectPatternsStyling ? "border-white/10" : "border-gray-700"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onEnabledChange(false)}
                  className={
                    projectPatternsStyling
                      ? "rounded-md border border-white/10 bg-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-gray-300 transition-colors hover:bg-zinc-700/90"
                      : "text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-300"
                  }
                >
                  Hide guides
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={stepIndex <= 0}
                    onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                    className={
                      projectPatternsStyling
                        ? "inline-flex items-center gap-1 rounded-md border border-white/10 bg-zinc-800/90 px-2.5 py-1.5 text-[11px] font-medium text-gray-200 transition-colors hover:bg-zinc-700/90 disabled:cursor-not-allowed disabled:opacity-35"
                        : "inline-flex items-center gap-1 rounded-md border border-gray-600 px-2.5 py-1.5 text-[11px] font-medium text-gray-200 transition-colors hover:bg-gray-700/50 disabled:cursor-not-allowed disabled:opacity-35"
                    }
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (stepIndex >= activeSteps.length - 1) {
                        closeChapter();
                      } else {
                        setStepIndex((i) => i + 1);
                      }
                    }}
                    className={
                      projectPatternsStyling
                        ? "inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-[11px] font-semibold text-black shadow-sm transition-colors hover:bg-gray-100"
                        : "inline-flex items-center gap-1 rounded-md border border-gray-600 bg-gray-700/80 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-gray-600"
                    }
                  >
                    {stepIndex >= activeSteps.length - 1 ? "Done" : "Next"}
                    {stepIndex < activeSteps.length - 1 && (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(portal, document.body);
}
