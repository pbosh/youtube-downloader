# YouTube Downloader — React client

React + Vite frontend for the YouTube downloader. The legacy HTML UI remains in `../public/`.

## Development

Run the Express API and the React dev server in separate terminals:

```bash
# Terminal 1 — API on http://127.0.0.1:47823
npm run launch

# Terminal 2 — React UI on http://localhost:5173
cd client && npm install && npm run dev
```

Vite proxies `/api` and `/skins` to the backend.

## Production build

```bash
cd client && npm run build
```

Output goes to `client/dist/`. To serve it from Express later, point `src/server.ts` at `client/dist` instead of `public/`.

## Structure

- `src/App.tsx` — root layout
- `src/hooks/` — downloads (SSE), video format picker
- `src/lib/progressEngine.ts` — button progress smoothing
- `src/lib/skinSystem.js` — skin picker (ported from `public/skins.js`)
- `src/styles/app.css` — base chrome CSS (from `public/index.html`)

Skins still load as `/skins/{id}/skin.css` and target the same DOM structure/classes as the HTML app.
