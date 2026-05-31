#!/usr/bin/env node
import path from "node:path";
import { downloadMp3, ensureOutputDir, isValidYouTubeUrl, normalizeYouTubeUrl } from "./download.js";
import { getDesktopPath } from "./paths.js";
import { createProgressBar } from "./progress.js";

const defaultOutputDir = getDesktopPath();

function printUsage() {
  console.log(`Usage: npm run dev -- <youtube-url> [output-dir]

Examples:
  npm run dev -- "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  npm run dev -- "dQw4w9WgXcQ"
  npm run dev -- "https://youtu.be/dQw4w9WgXcQ" ./my-music

Downloads audio as 320 kbps MP3 to your Desktop by default.
Requires yt-dlp and ffmpeg on your PATH.`);
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const rawUrl = args[0]!;
  const url = normalizeYouTubeUrl(rawUrl);
  const outputDir = args[1]
    ? path.resolve(args[1])
    : defaultOutputDir;

  if (!isValidYouTubeUrl(url)) {
    console.error(
      "Error: Please provide a valid YouTube link, video ID, or youtu.be URL.",
    );
    printUsage();
    process.exit(1);
  }

  await ensureOutputDir(outputDir);

  const progress = createProgressBar();

  try {
    const result = await downloadMp3({
      url,
      outputDir,
      onProgress: (update) => progress.update(update),
    });

    console.log(`\nSaved: ${result.outputPath}`);
    if (result.title) {
      console.log(`Title: ${result.title}`);
    }
  } catch (error) {
    progress.fail(
      error instanceof Error ? error.message : "Download failed.",
    );
    process.exit(1);
  }
}

main();
