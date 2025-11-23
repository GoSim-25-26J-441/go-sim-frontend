declare module "react-cytoscapejs" {
  import { ComponentType, CSSProperties } from "react";
  import type { Core, ElementDefinition, Stylesheet } from "cytoscape";

  export interface CytoscapeComponentProps {
    elements?:
      | ElementDefinition[]
      | { nodes: ElementDefinition[]; edges: ElementDefinition[] };
    stylesheet?: Stylesheet[];
    style?: CSSProperties;
    className?: string;
    cy?: (cy: Core) => void;
    layout?: any;
    minZoom?: number;
    maxZoom?: number;
    wheelSensitivity?: number;
    [key: string]: any;
  }

  const CytoscapeComponent: ComponentType<CytoscapeComponentProps>;
  export default CytoscapeComponent;
}

// More robust CJS/ESM-friendly declarations

declare module "cytoscape-dagre" {
  import type cytoscape from "cytoscape";
  const register: (cy: typeof cytoscape) => void;
  export = register;
}

declare module "cytoscape-cola" {
  import type cytoscape from "cytoscape";
  const register: (cy: typeof cytoscape) => void;
  export = register;
}

declare module "cytoscape-cose-bilkent" {
  import type cytoscape from "cytoscape";
  const register: (cy: typeof cytoscape) => void;
  export = register;
}

declare module "cytoscape-elk" {
  import type cytoscape from "cytoscape";
  const register: (cy: typeof cytoscape) => void;
  export = register;
}
