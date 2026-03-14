// ─── Primitives ─────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Style ──────────────────────────────────────────────────────

export interface StrokeStyle {
  color: string;
  width: number;
  opacity: number;
}

export interface FillStyle {
  color: string;
  opacity: number;
}

// ─── Element types ──────────────────────────────────────────────

export type ElementType =
  | "freehand"
  | "text"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "image"
  | "sticky"
  | "connector";

export type AnchorPosition = "top" | "bottom" | "left" | "right" | "center";
export type ConnectorPathStyle = "straight" | "elbow" | "curved";

/** Properties shared by every canvas element. */
export interface BaseElement {
  id: string;
  type: ElementType;
  /** Position in canvas-space (top-left corner for shapes, first point for paths). */
  position: Point;
  /** Rotation in radians. */
  rotation: number;
  /** Z-order — higher values render on top. */
  zIndex: number;
  /** Whether the element is currently locked (non-selectable). */
  locked: boolean;
  /** Whether the element is visible. */
  visible: boolean;
  stroke: StrokeStyle;
}

/** Freehand drawing path (pen, eraser, or highlighter). */
export interface FreehandElement extends BaseElement {
  type: "freehand";
  /** Points relative to `position`, with optional pressure. */
  points: Array<{ x: number; y: number; pressure?: number }>;
  /** If true, this path acts as an eraser. */
  isEraser: boolean;
  /** If true, this path is a highlighter stroke (semi-transparent, flattened opacity). */
  isHighlighter: boolean;
}

/** Text block. */
export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  textAlign: "left" | "center" | "right";
  bold: boolean;
  italic: boolean;
  fill: FillStyle;
  size: Size;
}

/** Rectangle shape. */
export interface RectangleElement extends BaseElement {
  type: "rectangle";
  size: Size;
  fill: FillStyle;
  cornerRadius: number;
}

/** Ellipse shape. */
export interface EllipseElement extends BaseElement {
  type: "ellipse";
  size: Size;
  fill: FillStyle;
}

/** Straight line. */
export interface LineElement extends BaseElement {
  type: "line";
  /** End point relative to `position`. */
  endDelta: Point;
}

/** Arrow (line with arrowhead). */
export interface ArrowElement extends BaseElement {
  type: "arrow";
  /** End point relative to `position`. */
  endDelta: Point;
}

/** Embedded image. */
export interface ImageElement extends BaseElement {
  type: "image";
  size: Size;
  /** Base64 data URL (e.g. "data:image/png;base64,..."). */
  imageData: string;
}

/** Sticky note. */
export interface StickyNoteElement extends BaseElement {
  type: "sticky";
  size: Size;
  text: string;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  fontFamily: string;
}

/** Connector linking two elements via anchor points. */
export interface ConnectorElement extends BaseElement {
  type: "connector";
  /** ID of the source element. */
  sourceId: string;
  /** ID of the target element. */
  targetId: string;
  /** Anchor position on the source element. */
  sourceAnchor: AnchorPosition;
  /** Anchor position on the target element. */
  targetAnchor: AnchorPosition;
  /** Path routing style. */
  pathStyle: ConnectorPathStyle;
}

/** Union of all concrete element types. */
export type CanvasElement =
  | FreehandElement
  | TextElement
  | RectangleElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | ImageElement
  | StickyNoteElement
  | ConnectorElement;

// ─── Board / Document ───────────────────────────────────────────

export interface BoardMetadata {
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Semantic version of the file format. */
  formatVersion: string;
}

export interface Board {
  metadata: BoardMetadata;
  elements: CanvasElement[];
}

// ─── Defaults ───────────────────────────────────────────────────

export const DEFAULT_STROKE: StrokeStyle = {
  color: "#1f2937",
  width: 2,
  opacity: 1,
};

export const DEFAULT_FILL: FillStyle = {
  color: "transparent",
  opacity: 1,
};

export const FORMAT_VERSION = "1.0.0";

export function createEmptyBoard(name = "Untitled"): Board {
  const now = new Date().toISOString();
  return {
    metadata: {
      name,
      createdAt: now,
      updatedAt: now,
      formatVersion: FORMAT_VERSION,
    },
    elements: [],
  };
}
