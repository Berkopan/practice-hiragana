import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('dist');
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? walk(path.join(directory, entry.name)) : path.join(directory, entry.name)));
  return nested.flat();
}
const paths = (await walk(out)).filter(file => !file.endsWith('/sw.js')).sort();
const revision = createHash('sha256');
for (const file of paths) revision.update(path.relative(out, file)).update(await readFile(file));
const version = revision.digest('hex').slice(0, 16);
const files = paths.map(file => './' + path.relative(out, file).split(path.sep).join('/'));
const source = `/* Generated from the complete build. Every model/runtime asset is same-origin. */
const PREFIX = 'hiragana:' + self.registration.scope + ':';
const CACHE = PREFIX + '${version}';
const FILES = ${JSON.stringify(files)};
const STATIC_URLS = new Set(FILES.map(file => new URL(file, self.registration.scope).href));
const HOME = new URL('./index.html', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(file =>
    new Request(new URL(file, self.registration.scope).href, { cache: 'reload' })
  ))));
  // Let existing tabs finish using their own complete build before activation.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Serve the HTML and chunks from the same installed version, even online.
    // The browser checks sw.js independently for updates on later visits.
    if (request.mode === 'navigate') return (await cache.match(HOME, { ignoreVary: true })) || fetch(request);
    // These exact build URLs always contain the same public bytes. Some hosts
    // send Vary: Origin, but module/style requests and precache requests can
    // have different Origin headers. Do not turn that into an offline miss.
    const cached = STATIC_URLS.has(request.url)
      ? await cache.match(request, { ignoreVary: true })
      : await cache.match(request);
    return cached || fetch(request);
  })());
});
`;
await writeFile(path.join(out, 'sw.js'), source);
await writeFile(path.join(out, '.nojekyll'), '');
console.log(`Offline cache ${version}: ${files.length} assets.`);
