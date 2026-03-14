import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { renderElements } from "../canvas/renderElements";
import { getElementBounds } from "../canvas/hitTest";
import { useDocumentStore } from "../store/documentStore";
import type {
  CanvasElement,
  Bounds,
  FreehandElement,
  TextElement,
  RectangleElement,
  EllipseElement,
  LineElement,
  ArrowElement,
  ImageElement,
  StickyNoteElement,
} from "../types/document";

// ─── Helpers ────────────────────────────────────────────────────

const EXPORT_PADDING = 32;

/** Compute the bounding box that encloses all visible elements. */
function getAllElementsBounds(elements: CanvasElement[]): Bounds | null {
  const visible = elements.filter((el) => el.visible);
  if (visible.length === 0) return null;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const el of visible) {
    const b = getElementBounds(el);
    // Account for stroke width extending beyond bounds
    const pad = el.stroke.width / 2;
    if (b.x - pad < minX) minX = b.x - pad;
    if (b.y - pad < minY) minY = b.y - pad;
    if (b.x + b.width + pad > maxX) maxX = b.x + b.width + pad;
    if (b.y + b.height + pad > maxY) maxY = b.y + b.height + pad;
  }

  return {
    x: minX - EXPORT_PADDING,
    y: minY - EXPORT_PADDING,
    width: maxX - minX + EXPORT_PADDING * 2,
    height: maxY - minY + EXPORT_PADDING * 2,
  };
}

// ─── PNG Export ──────────────────────────────────────────────────

export async function exportPNG(): Promise<void> {
  const elements = useDocumentStore.getState().board.elements;
  const bounds = getAllElementsBounds(elements);
  if (!bounds) {
    window.alert("Nothing to export — the canvas is empty.");
    return;
  }

  const filePath = await save({
    filters: [{ name: "PNG Image", extensions: ["png"] }],
    title: "Export as PNG",
    defaultPath: getExportFileName("png"),
  });
  if (!filePath) return;

  let path = filePath;
  if (!path.toLowerCase().endsWith(".png")) path += ".png";

  // Create offscreen canvas at 2x for quality
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bounds.width * scale);
  canvas.height = Math.ceil(bounds.height * scale);

  const ctx = canvas.getContext("2d")!;
  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Scale and translate so elements render at origin
  ctx.scale(scale, scale);
  ctx.translate(-bounds.x, -bounds.y);

  renderElements(ctx, elements);

  // Convert to blob → array buffer → Uint8Array → Rust
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Failed to create PNG blob"));
    }, "image/png");
  });

  const arrayBuffer = await blob.arrayBuffer();
  const data = Array.from(new Uint8Array(arrayBuffer));

  try {
    await invoke("write_binary_file", { path, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    window.alert(`Failed to export PNG:\n${msg}`);
  }
}

// ─── SVG Export ─────────────────────────────────────────────────

export async function exportSVG(): Promise<void> {
  const elements = useDocumentStore.getState().board.elements;
  const bounds = getAllElementsBounds(elements);
  if (!bounds) {
    window.alert("Nothing to export — the canvas is empty.");
    return;
  }

  const filePath = await save({
    filters: [{ name: "SVG Image", extensions: ["svg"] }],
    title: "Export as SVG",
    defaultPath: getExportFileName("svg"),
  });
  if (!filePath) return;

  let path = filePath;
  if (!path.toLowerCase().endsWith(".svg")) path += ".svg";

  const svgContent = buildSVG(elements, bounds);

  try {
    await invoke("write_file", { path, contents: svgContent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    window.alert(`Failed to export SVG:\n${msg}`);
  }
}

function buildSVG(elements: CanvasElement[], bounds: Bounds): string {
  const sorted = [...elements].filter((el) => el.visible).sort((a, b) => a.zIndex - b.zIndex);

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" width="${Math.ceil(bounds.width)}" height="${Math.ceil(bounds.height)}">`,
  );
  // White background
  lines.push(
    `  <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff" />`,
  );

  for (const el of sorted) {
    lines.push(elementToSVG(el));
  }

  lines.push("</svg>");
  return lines.join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function elementToSVG(el: CanvasElement): string {
  switch (el.type) {
    case "freehand":
      return freehandToSVG(el);
    case "rectangle":
      return rectangleToSVG(el);
    case "ellipse":
      return ellipseToSVG(el);
    case "line":
      return lineToSVG(el);
    case "arrow":
      return arrowToSVG(el);
    case "text":
      return textToSVG(el);
    case "image":
      return imageToSVG(el);
    case "sticky":
      return stickyToSVG(el);
    case "connector":
      return "";
  }
}

function freehandToSVG(el: FreehandElement): string {
  const { points, position, stroke, isEraser } = el;
  if (points.length === 0 || isEraser) return "";

  let d: string;
  if (points.length === 1) {
    // Render as a circle (dot)
    const cx = position.x + points[0].x;
    const cy = position.y + points[0].y;
    return `  <circle cx="${cx}" cy="${cy}" r="${stroke.width / 2}" fill="${stroke.color}" opacity="${stroke.opacity}" />`;
  } else if (points.length === 2) {
    const x1 = position.x + points[0].x;
    const y1 = position.y + points[0].y;
    const x2 = position.x + points[1].x;
    const y2 = position.y + points[1].y;
    d = `M${x1},${y1} L${x2},${y2}`;
  } else {
    // Quadratic bezier through midpoints (same as canvas renderer)
    const parts: string[] = [];
    parts.push(`M${position.x + points[0].x},${position.y + points[0].y}`);
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      parts.push(
        `Q${position.x + curr.x},${position.y + curr.y} ${position.x + midX},${position.y + midY}`,
      );
    }
    const last = points[points.length - 1];
    parts.push(`L${position.x + last.x},${position.y + last.y}`);
    d = parts.join(" ");
  }

  return `  <path d="${d}" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="${stroke.opacity}" />`;
}

function rectangleToSVG(el: RectangleElement): string {
  const { position, size, stroke, fill, cornerRadius } = el;
  const fillAttr =
    fill.color !== "transparent"
      ? `fill="${fill.color}" fill-opacity="${fill.opacity}"`
      : `fill="none"`;
  const rxAttr =
    cornerRadius > 0
      ? `rx="${Math.min(cornerRadius, Math.abs(size.width) / 2, Math.abs(size.height) / 2)}"`
      : "";

  return `  <rect x="${position.x}" y="${position.y}" width="${size.width}" height="${size.height}" ${rxAttr} ${fillAttr} stroke="${stroke.color}" stroke-width="${stroke.width}" opacity="${stroke.opacity}" />`;
}

function ellipseToSVG(el: EllipseElement): string {
  const { position, size, stroke, fill } = el;
  const cx = position.x + size.width / 2;
  const cy = position.y + size.height / 2;
  const rx = Math.abs(size.width / 2);
  const ry = Math.abs(size.height / 2);
  const fillAttr =
    fill.color !== "transparent"
      ? `fill="${fill.color}" fill-opacity="${fill.opacity}"`
      : `fill="none"`;

  return `  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${fillAttr} stroke="${stroke.color}" stroke-width="${stroke.width}" opacity="${stroke.opacity}" />`;
}

function lineToSVG(el: LineElement): string {
  const { position, endDelta, stroke } = el;
  return `  <line x1="${position.x}" y1="${position.y}" x2="${position.x + endDelta.x}" y2="${position.y + endDelta.y}" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" opacity="${stroke.opacity}" />`;
}

function arrowToSVG(el: ArrowElement): string {
  const { position, endDelta, stroke } = el;
  const x1 = position.x;
  const y1 = position.y;
  const x2 = position.x + endDelta.x;
  const y2 = position.y + endDelta.y;

  const angle = Math.atan2(endDelta.y, endDelta.x);
  const headLen = Math.max(stroke.width * 3, 10);
  const headAngle = Math.PI / 7;

  const ax = x2 - headLen * Math.cos(angle - headAngle);
  const ay = y2 - headLen * Math.sin(angle - headAngle);
  const bx = x2 - headLen * Math.cos(angle + headAngle);
  const by = y2 - headLen * Math.sin(angle + headAngle);
  const baseX = (ax + bx) / 2;
  const baseY = (ay + by) / 2;

  return [
    `  <g opacity="${stroke.opacity}">`,
    `    <line x1="${x1}" y1="${y1}" x2="${baseX}" y2="${baseY}" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" />`,
    `    <polygon points="${x2},${y2} ${ax},${ay} ${bx},${by}" fill="${stroke.color}" />`,
    `  </g>`,
  ].join("\n");
}

function textToSVG(el: TextElement): string {
  const { position, text, fontSize, fontFamily, textAlign, fill, size, bold, italic } = el;
  if (!text) return "";

  const lineHeight = fontSize * 1.3;
  const lines = text.split("\n");

  let xBase = position.x;
  let anchor = "start";
  if (textAlign === "center") {
    xBase += size.width / 2;
    anchor = "middle";
  } else if (textAlign === "right") {
    xBase += size.width;
    anchor = "end";
  }

  const fontWeight = bold ? "bold" : "normal";
  const fontStyle = italic ? "italic" : "normal";

  const tspans = lines.map((line, i) => {
    const y = position.y + i * lineHeight + fontSize; // SVG text baseline is bottom of em box
    return `    <tspan x="${xBase}" y="${y}">${escapeXml(line)}</tspan>`;
  });

  return [
    `  <text font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" text-anchor="${anchor}" fill="${fill.color}" fill-opacity="${fill.opacity}">`,
    ...tspans,
    `  </text>`,
  ].join("\n");
}

function imageToSVG(el: ImageElement): string {
  const { position, size, imageData } = el;
  return `  <image x="${position.x}" y="${position.y}" width="${size.width}" height="${size.height}" href="${escapeXml(imageData)}" preserveAspectRatio="none" />`;
}

function stickyToSVG(el: StickyNoteElement): string {
  const { position, size, text, backgroundColor, textColor, fontSize, fontFamily } = el;
  const lines: string[] = [];
  lines.push(
    `  <rect x="${position.x}" y="${position.y}" width="${size.width}" height="${size.height}" rx="6" ry="6" fill="${backgroundColor}" filter="url(#shadow)" />`,
  );
  if (text) {
    const padding = 10;
    const lineHeight = fontSize * 1.3;
    const textLines = text.split("\n");
    for (let i = 0; i < textLines.length; i++) {
      lines.push(
        `  <text x="${position.x + padding}" y="${position.y + padding + i * lineHeight + fontSize}" font-size="${fontSize}" font-family="${escapeXml(fontFamily)}" fill="${textColor}">${escapeXml(textLines[i])}</text>`,
      );
    }
  }
  return lines.join("\n");
}

// ─── PDF Export ─────────────────────────────────────────────────

/**
 * Export to PDF by embedding the PNG rendering into a minimal PDF document.
 * This approach avoids external PDF library dependencies.
 */
export async function exportPDF(): Promise<void> {
  const elements = useDocumentStore.getState().board.elements;
  const bounds = getAllElementsBounds(elements);
  if (!bounds) {
    window.alert("Nothing to export — the canvas is empty.");
    return;
  }

  const filePath = await save({
    filters: [{ name: "PDF Document", extensions: ["pdf"] }],
    title: "Export as PDF",
    defaultPath: getExportFileName("pdf"),
  });
  if (!filePath) return;

  let path = filePath;
  if (!path.toLowerCase().endsWith(".pdf")) path += ".pdf";

  // Render to offscreen canvas at 2x
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bounds.width * scale);
  canvas.height = Math.ceil(bounds.height * scale);

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(-bounds.x, -bounds.y);
  renderElements(ctx, elements);

  // Get PNG data as JPEG for smaller PDF size
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to create image blob"));
      },
      "image/jpeg",
      0.92,
    );
  });

  const imageBytes = new Uint8Array(await blob.arrayBuffer());
  const pdfBytes = buildPDF(imageBytes, canvas.width, canvas.height, bounds.width, bounds.height);

  try {
    await invoke("write_binary_file", { path, data: Array.from(pdfBytes) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    window.alert(`Failed to export PDF:\n${msg}`);
  }
}

/**
 * Build a minimal PDF 1.4 file embedding a JPEG image.
 * Page size matches the content bounds (in points, 1pt = 1px at 72dpi).
 */
function buildPDF(
  jpegData: Uint8Array,
  imgWidthPx: number,
  imgHeightPx: number,
  pageWidthPt: number,
  pageHeightPt: number,
): Uint8Array {
  const enc = new TextEncoder();

  // Object offsets for xref
  const offsets: number[] = [];
  const parts: Uint8Array[] = [];
  let pos = 0;

  function write(s: string) {
    const bytes = enc.encode(s);
    parts.push(bytes);
    pos += bytes.length;
  }

  function writeBinary(data: Uint8Array) {
    parts.push(data);
    pos += data.length;
  }

  function markObj() {
    offsets.push(pos);
  }

  // Header
  write("%PDF-1.4\n%\xC0\xC1\xC2\xC3\n");

  // Obj 1: Catalog
  markObj();
  write("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // Obj 2: Pages
  markObj();
  write("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  // Obj 3: Page
  markObj();
  write(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Contents 4 0 R /Resources << /XObject << /Img 5 0 R >> >> >>\nendobj\n`,
  );

  // Obj 4: Content stream — draw image scaled to page
  const contentStr = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Img Do\nQ\n`;
  markObj();
  write(`4 0 obj\n<< /Length ${contentStr.length} >>\nstream\n${contentStr}endstream\nendobj\n`);

  // Obj 5: Image XObject (JPEG)
  markObj();
  write(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgWidthPx} /Height ${imgHeightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegData.length} >>\nstream\n`,
  );
  writeBinary(jpegData);
  write("\nendstream\nendobj\n");

  // xref table
  const xrefPos = pos;
  write(`xref\n0 ${offsets.length + 1}\n`);
  write("0000000000 65535 f \n");
  for (const off of offsets) {
    write(`${String(off).padStart(10, "0")} 00000 n \n`);
  }

  // Trailer
  write(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  // Concatenate all parts
  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

// ─── Helpers ────────────────────────────────────────────────────

function getExportFileName(ext: string): string {
  const name = useDocumentStore.getState().board.metadata.name || "Untitled";
  return `${name}.${ext}`;
}
