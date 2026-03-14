/** Generate a random element ID (URL-safe, 21 chars like nanoid). */
export function generateId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const bytes = crypto.getRandomValues(new Uint8Array(21));
  let id = "";
  for (let i = 0; i < 21; i++) {
    id += chars[bytes[i] & 63];
  }
  return id;
}
