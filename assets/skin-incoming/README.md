# Skin incoming folder

**Queue:** drop new banner PNG/JPEG/WebP or MP4/MOV/WebM files here.

**Done:** finished sources live in [`_DONE/`](_DONE/) locally (not committed to git — large PNGs). Use it to track what's complete vs still queued.

```bash
npm run mark-skins-done    # match existing skins → copy to _DONE/, remove from queue
npm run scaffold:skins     # scaffold queue → skins/; copies to _DONE/ by default
```

Full workflow: [`docs/batch-skins.md`](../../docs/batch-skins.md)
