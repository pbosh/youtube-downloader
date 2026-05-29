import os from "node:os";
import path from "node:path";

export function getDesktopPath(): string {
  return path.join(os.homedir(), "Desktop");
}
