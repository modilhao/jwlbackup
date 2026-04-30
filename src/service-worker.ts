/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `jwlbackup-${version}`;

// Pre-cache all build assets + static files (icons, manifest, sql-wasm.wasm, etc).
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(ASSETS);
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;

	const url = new URL(req.url);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

	// Don't cache cross-origin (Google Fonts CSS, etc) — let browser handle.
	if (url.origin !== sw.location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			// Cached static asset → serve from cache, skip network.
			if (ASSETS.includes(url.pathname)) {
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
			}

			// Network-first for everything else; fall back to cache when offline.
			try {
				const fresh = await fetch(req);
				if (fresh.status === 200 && fresh.type === 'basic') {
					cache.put(req, fresh.clone());
				}
				return fresh;
			} catch {
				const hit = await cache.match(req);
				if (hit) return hit;
				// Last resort: index page from cache (single-page app).
				const index = await cache.match('/');
				if (index) return index;
				return new Response('Offline e recurso não cacheado.', { status: 504 });
			}
		})()
	);
});
