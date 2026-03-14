import { useDocumentStore } from "../store/documentStore";
import { useHistoryStore } from "../store/historyStore";
import { generateId } from "./id";
import type { ImageElement } from "../types/document";

const MAX_IMAGE_DIMENSION = 800;

/** Load an image from a data URL and return its natural dimensions. */
function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

/**
 * Insert an image element onto the canvas from a base64 data URL.
 * The image is centered at `position` and scaled down if too large.
 */
export async function insertImageElement(
  dataUrl: string,
  position: { x: number; y: number },
): Promise<void> {
  const { width, height } = await loadImageDimensions(dataUrl);

  // Scale down if too large, preserving aspect ratio
  let w = width;
  let h = height;
  if (w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION) {
    const scale = MAX_IMAGE_DIMENSION / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const element: ImageElement = {
    id: generateId(),
    type: "image",
    position: { x: position.x - w / 2, y: position.y - h / 2 },
    rotation: 0,
    zIndex: 0,
    locked: false,
    visible: true,
    stroke: { color: "#000000", width: 0, opacity: 1 },
    size: { width: w, height: h },
    imageData: dataUrl,
  };

  useHistoryStore.getState().pushSnapshot();
  const store = useDocumentStore.getState();
  store.addElements([element]);
  store.clearSelection();
  store.select([element.id]);
}

/** Convert a File/Blob to a base64 data URL. */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/** Convert a binary byte array to a base64 data URL. */
export function binaryToDataUrl(data: number[], mimeType: string): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/** Infer MIME type from a file path extension. */
export function mimeTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "bmp":
      return "image/bmp";
    default:
      return "image/png";
  }
}

/** Accepted image file extensions for dialogs. */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
