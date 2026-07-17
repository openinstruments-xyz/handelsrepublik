# Trade Republic Pro web reference

This folder contains a locally downloaded, ignored copy of the Trade Republic
Pro web-trading bundle. The raw assets are in `downloaded/`; JavaScript files
expanded with esbuild are in `deminified/`; `manifest.json` records the source
URLs and download results. Do not commit the bundle, session material, or
account payloads.

## Redownload

From this package directory, run:

```powershell
node .\scripts\download-web-bundle.mjs
```

The script reads `demo/.demo-session.json` by default, uses its cookies only
in memory, recursively follows JavaScript dynamic imports, vendor chunks,
source maps, CSS URLs, fonts, images, and other same-origin app assets, and
writes the output here.

The crawl is scoped to assets referenced by the brokerage web-app entrypoint.
It does not follow page links and therefore excludes FAQ, marketing, and
landing-page documents.
To use another local session file:

```powershell
$env:TR_SESSION_FILE = 'C:\path\to\session.json'
node .\scripts\download-web-bundle.mjs
```

The session file must stay local and ignored. The downloader does not call
private account APIs; it only follows same-origin application assets exposed by
the web bundle.
