export function timeAgo(epochSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(epochSeconds * 1000).toLocaleDateString();
}

export function sanitizeWebsite(value: string): string {
  if (!value) return "";
  try {
    const u = new URL(value.startsWith("http") ? value : `https://${value}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    return "";
  }
}
