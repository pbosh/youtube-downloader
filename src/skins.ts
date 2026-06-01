import { access, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

export interface SkinMeta {
  id: string;
  title: string;
  icon: string;
  /** Deck brightness — from progress fill in skin.css (same rule as button progress bar) */
  mode: "light" | "dark";
  iconImage?: string;
  /** Banner filename in the skin folder, e.g. banner.jpg or banner.mp4 */
  banner?: string;
  /** Picker thumbnail for video banners (frame 0), e.g. banner-thumb.jpg */
  bannerThumb?: string;
}

interface SkinJson {
  title?: unknown;
  icon?: unknown;
  iconImage?: unknown;
  banner?: unknown;
  bannerThumb?: unknown;
  mode?: unknown;
}

const VIDEO_BANNER_PATTERN = /\.(mp4|webm|mov|m4v)$/i;

function isVideoBannerFilename(name: string): boolean {
  return VIDEO_BANNER_PATTERN.test(name);
}

/** Same rule as scaffold progress fill: black mix = light deck, white mix = dark deck. */
function modeFromProgressFill(css: string): "light" | "dark" | null {
  const match = css.match(/--button-progress-fill:\s*([^;]+);/);
  if (!match) return null;

  const fill = match[1].toLowerCase();
  if (/\bblack\b/.test(fill)) return "light";
  if (/\bwhite\b/.test(fill)) return "dark";
  return null;
}

async function readSkinMode(
  cssPath: string,
  parsed: SkinJson,
): Promise<"light" | "dark"> {
  const css = await readFile(cssPath, "utf8");
  const fromProgress = modeFromProgressFill(css);
  if (fromProgress) return fromProgress;

  if (parsed.mode === "light" || parsed.mode === "dark") {
    return parsed.mode;
  }

  return css.includes("color-scheme: light") ? "light" : "dark";
}

export async function listSkins(skinsDir: string): Promise<SkinMeta[]> {
  let entries;

  try {
    entries = await readdir(skinsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const skins: SkinMeta[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("_")) continue;

    const id = entry.name;
    const skinDir = path.join(skinsDir, id);
    const jsonPath = path.join(skinDir, "skin.json");
    const cssPath = path.join(skinDir, "skin.css");

    try {
      await access(jsonPath);
      await access(cssPath);

      const parsed = JSON.parse(await readFile(jsonPath, "utf8")) as SkinJson;
      if (typeof parsed.title !== "string" || !parsed.title.trim()) continue;

      const skin: SkinMeta = {
        id,
        title: parsed.title.trim(),
        icon: typeof parsed.icon === "string" ? parsed.icon : "🎨",
        mode: await readSkinMode(cssPath, parsed),
      };

      if (typeof parsed.iconImage === "string" && parsed.iconImage.trim()) {
        skin.iconImage = parsed.iconImage.trim();
      }

      if (typeof parsed.banner === "string" && parsed.banner.trim()) {
        skin.banner = parsed.banner.trim();
      } else {
        for (const name of [
          "banner.jpg",
          "banner.png",
          "banner.mp4",
          "banner.webm",
          "banner.mov",
          "banner.m4v",
        ]) {
          try {
            await access(path.join(skinDir, name));
            skin.banner = name;
            break;
          } catch {
            // try next candidate
          }
        }
      }

      if (typeof parsed.bannerThumb === "string" && parsed.bannerThumb.trim()) {
        skin.bannerThumb = parsed.bannerThumb.trim();
      } else if (skin.banner && isVideoBannerFilename(skin.banner)) {
        try {
          await access(path.join(skinDir, "banner-thumb.jpg"));
          skin.bannerThumb = "banner-thumb.jpg";
        } catch {
          // video skin without a thumb
        }
      }

      skins.push(skin);
    } catch {
      // Skip folders without valid skin.json + skin.css
    }
  }

  return skins.sort((a, b) => a.title.localeCompare(b.title));
}

const SKIN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export type DeleteSkinResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export async function deleteSkin(
  skinsDir: string,
  id: string,
): Promise<DeleteSkinResult> {
  if (!SKIN_ID_PATTERN.test(id)) {
    return { ok: false, error: "Invalid skin id.", status: 400 };
  }

  if (id.startsWith("_")) {
    return { ok: false, error: "Protected skins cannot be deleted.", status: 403 };
  }

  const skinDir = path.join(skinsDir, id);
  const resolvedDir = path.resolve(skinDir);
  const resolvedRoot = path.resolve(skinsDir);

  if (!resolvedDir.startsWith(resolvedRoot + path.sep)) {
    return { ok: false, error: "Invalid skin id.", status: 400 };
  }

  try {
    await access(path.join(skinDir, "skin.json"));
    await access(path.join(skinDir, "skin.css"));
  } catch {
    return { ok: false, error: "Skin not found.", status: 404 };
  }

  const remaining = (await listSkins(skinsDir)).filter((skin) => skin.id !== id);
  if (remaining.length === 0) {
    return {
      ok: false,
      error: "Cannot delete the last remaining skin.",
      status: 409,
    };
  }

  await rm(skinDir, { recursive: true, force: true });
  return { ok: true };
}
