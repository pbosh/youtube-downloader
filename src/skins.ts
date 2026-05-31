import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface SkinMeta {
  id: string;
  title: string;
  icon: string;
  iconImage?: string;
  /** Banner filename in the skin folder, e.g. banner.png */
  banner?: string;
}

interface SkinJson {
  title?: unknown;
  icon?: unknown;
  iconImage?: unknown;
  banner?: unknown;
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
      };

      if (typeof parsed.iconImage === "string" && parsed.iconImage.trim()) {
        skin.iconImage = parsed.iconImage.trim();
      }

      if (typeof parsed.banner === "string" && parsed.banner.trim()) {
        skin.banner = parsed.banner.trim();
      } else {
        try {
          await access(path.join(skinDir, "banner.png"));
          skin.banner = "banner.png";
        } catch {
          // No banner asset
        }
      }

      skins.push(skin);
    } catch {
      // Skip folders without valid skin.json + skin.css
    }
  }

  return skins.sort((a, b) => a.title.localeCompare(b.title));
}
