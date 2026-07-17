import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const here = join(fileURLToPath(new URL('.', import.meta.url)));
const root = join(here, '..');
const outDir = join(root, 'web-reference');
const rawDir = join(outDir, 'downloaded');
const prettyDir = join(outDir, 'deminified');
const appUrl = 'https://app.traderepublic.com/';
const sessionPath = process.env.TR_SESSION_FILE || join(root, 'demo', '.demo-session.json');

await mkdir(rawDir, { recursive: true });
await mkdir(prettyDir, { recursive: true });

const session = JSON.parse(await readFile(sessionPath, 'utf8'));
const cookies = { ...(session.webContext?.cookies ?? {}), ...(session.cookies ?? {}) };
const cookieHeader = Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; ');
const headers = { accept: '*/*', 'user-agent': 'handelsrepublik-web-reference-downloader/0.1.0', cookie: cookieHeader };

const html = await fetchText(appUrl);
await writeFile(join(rawDir, 'index.html'), html);
const queue = [...discoverAssetUrls(html, appUrl)];
const queued = new Set(queue);
const assets = [];
while (queue.length) {
  const url = queue.shift();
  const fileName = safeFileName(url);
  const rawPath = join(rawDir, fileName);
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(rawPath, buffer);
    const item = { url, file: `downloaded/${fileName}`, size: buffer.length, contentType: response.headers.get('content-type') };
    const isJavaScript = /\.js(?:\.map)?$/i.test(fileName) || (item.contentType ?? '').includes('javascript');
    const isCss = /\.css$/i.test(fileName) || (item.contentType ?? '').includes('text/css');
    if (isJavaScript) {
      try {
        const result = await transform(buffer.toString('utf8'), { loader: 'js', format: 'esm', minify: false, sourcemap: false });
        const prettyName = fileName.replace(/\.js$/i, '.pretty.js');
        await writeFile(join(prettyDir, prettyName), result.code);
        item.deminified = `deminified/${prettyName}`;
      } catch (error) {
        item.deminifyError = String(error?.message ?? error);
      }
    }
    if (isCss) {
      try {
        const result = await transform(buffer.toString('utf8'), { loader: 'css', minify: false, sourcemap: false });
        const prettyName = fileName.replace(/\.css$/i, '.pretty.css');
        await writeFile(join(prettyDir, prettyName), result.code);
        item.deminified = `deminified/${prettyName}`;
      } catch (error) {
        item.deminifyError = String(error?.message ?? error);
      }
    }
    assets.push(item);
    console.log(`${response.status} ${fileName}`);
    for (const child of discoverAssetUrls(buffer.toString('utf8'), url)) {
      if (!queued.has(child)) {
        queued.add(child);
        queue.push(child);
      }
    }
  } catch (error) {
    assets.push({ url, file: `downloaded/${fileName}`, error: String(error?.message ?? error) });
    console.warn(`FAILED ${url}: ${error?.message ?? error}`);
  }
}

await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify({ appUrl, downloadedAt: new Date().toISOString(), authenticated: true, assets }, null, 2)}\n`);
console.log(`Downloaded ${assets.filter((item) => !item.error).length}/${assets.length} assets into ${outDir}`);

async function fetchText(url) {
  const response = await fetch(url, { headers: { ...headers, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return response.text();
}

function discoverAssetUrls(text, baseUrl) {
  const urls = new Set();
  const candidates = [];
  for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) candidates.push(match[1]);
  for (const match of text.matchAll(/(?:import\s*\(|from\s*|import\s+)["'`]([^"'`]+)["'`]/g)) candidates.push(match[1]);
  for (const match of text.matchAll(/(?:url\(|sourceMappingURL=)["']?([^\s"'`)]+)["']?/gi)) candidates.push(match[1]);
  for (const match of text.matchAll(/(["'`])((?:\/assets\/|\/charting_library\/|\.\/|\.\.\/)[^"'`\s]+\.(?:js|css|json|map|svg|png|jpg|jpeg|webp|woff2?|ttf|ico))(?:["'`])/gi)) candidates.push(match[2]);
  for (const raw of candidates) {
    if (!raw || raw.startsWith('data:')) continue;
    try {
      const parsed = new URL(raw, baseUrl);
      parsed.hash = '';
      const url = parsed.toString();
      const path = parsed.pathname;
      // The app entrypoint is the scope boundary: follow bundled assets only,
      // never navigational links to FAQ, marketing, or landing pages.
      if (new URL(url).hostname === new URL(appUrl).hostname && /(?:\.(?:js|css|json|map|svg|png|jpg|jpeg|webp|gif|woff2?|ttf|otf|ico|mp4|webm)|favicon)/i.test(path) && /\/assets\/|\/charting_library\/|favicon|videos\//i.test(url)) urls.add(url);
    } catch {}
  }
  return [...urls];
}

function safeFileName(url) {
  return (basename(new URL(url).pathname) || 'index.html').replaceAll(/[^\w.-]/g, '_');
}
