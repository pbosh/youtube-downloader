const VIDEO_ID_RE = /^[\w-]{11}$/;

function fixProtocolTypos(value: string): string {
  let url = value.trim();
  if (/^ttps:\/\//i.test(url)) url = `h${url}`;
  if (/^ttp:\/\//i.test(url)) url = `h${url}`;
  return url;
}

function youtubeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isYoutubeHost(hostname: string): boolean {
  const host = youtubeHost(hostname);
  return (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtu.be"
  );
}

function videoIdFromUrl(parsed: URL): string | null {
  const host = youtubeHost(parsed.hostname);

  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    return VIDEO_ID_RE.test(id) ? id : null;
  }

  const fromQuery = parsed.searchParams.get("v");
  if (fromQuery && VIDEO_ID_RE.test(fromQuery)) return fromQuery;

  const fromPath = parsed.pathname.match(
    /\/(?:shorts|embed|live|v)\/([\w-]{11})/,
  );
  if (fromPath?.[1] && VIDEO_ID_RE.test(fromPath[1])) return fromPath[1];

  return null;
}

export function normalizeYouTubeUrl(value: string): string {
  let input = fixProtocolTypos(value);
  if (!input) return "";

  if (VIDEO_ID_RE.test(input)) {
    return `https://www.youtube.com/watch?v=${input}`;
  }

  if (!/^https?:\/\//i.test(input)) {
    input = `https://${input.replace(/^\/+/, "")}`;
  }

  try {
    const parsed = new URL(input);
    if (isYoutubeHost(parsed.hostname)) {
      return parsed.toString();
    }
  } catch {
    // Fall through
  }

  return input;
}

export function isValidYouTubeUrl(value: string): boolean {
  const normalized = normalizeYouTubeUrl(value);
  if (!normalized) return false;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!isYoutubeHost(parsed.hostname)) return false;
    return videoIdFromUrl(parsed) !== null;
  } catch {
    return false;
  }
}

/** @deprecated Use normalizeYouTubeUrl */
export const normalizeUrl = normalizeYouTubeUrl;

/** @deprecated Use isValidYouTubeUrl */
export function isValidUrl(value: string): boolean {
  return isValidYouTubeUrl(value);
}
