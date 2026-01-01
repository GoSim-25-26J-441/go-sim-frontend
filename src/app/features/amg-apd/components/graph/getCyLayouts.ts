import type { LayoutName } from "@/app/features/amg-apd/components/ControlPanel";

export function getCyLayout(layoutName: LayoutName) {
  if (layoutName === "dagre") {
    return {
      name: "dagre",
      padding: 80,
      rankDir: "LR",
      rankSep: 120,
      nodeSep: 80,
      edgeSep: 80,
    };
  }

  if (layoutName === "cose-bilkent") {
    return {
      name: "cose-bilkent",
      animate: false,
      nodeRepulsion: 4500,
      idealEdgeLength: 150,
    };
  }

  if (layoutName === "cola") {
    return {
      name: "cola",
      fit: true,
      nodeSpacing: 40,
      edgeLengthVal: 120,
    };
  }

  return {
    name: "elk",
    elk: {
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": 80,
      "elk.spacing.nodeNode": 60,
    },
  };
}
