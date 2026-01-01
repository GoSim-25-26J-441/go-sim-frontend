import type { ElementDefinition } from "cytoscape";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

import { toCyElements } from "@/app/features/amg-apd/mappers/cyto/elements";
import { cyStyles } from "@/app/features/amg-apd/mappers/cyto/styles";

export function toElements(data?: AnalysisResult): ElementDefinition[] {
  return toCyElements(data);
}

export const styles = cyStyles;
