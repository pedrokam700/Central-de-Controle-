import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;
const UPSTREAM = 'https://central-cora-v15-1-13-21-pedrokam700-6477.vercel.app';
const BUILD = '2.0.0-preview.2';

app.use(express.raw({ type: '*/*', limit: '25mb' }));

app.get('/__central_v2/status', (req, res) => {
  res.json({ ok: true, version: BUILD, upstream: UPSTREAM });
});

// Evita que um service worker legado congele a camada de migração V2.
app.get('/sw.js', (req, res) => {
  res.type('application/javascript').send(
    "self.addEventListener('install',()=>self.skipWaiting());" +
    "self.addEventListener('activate',e=>e.waitUntil(self.registration.unregister()));"
  );
});

app.use(async (req, res) => {
  try {
    const target = new URL(req.originalUrl, UPSTREAM);
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!value) continue;
      if (['host', 'content-length', 'accept-encoding', 'connection'].includes(key.toLowerCase())) continue;
      headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }
    headers['accept-encoding'] = 'identity';

    const init = { method: req.method, headers, redirect: 'follow' };
    if (!['GET', 'HEAD'].includes(req.method) && req.body?.length) init.body = req.body;

    const upstream = await fetch(target, init);
    const contentType = upstream.headers.get('content-type') || '';

    for (const [key, value] of upstream.headers) {
      const lower = key.toLowerCase();
      if (['content-length', 'content-encoding', 'transfer-encoding', 'content-security-policy', 'content-security-policy-report-only', 'x-frame-options'].includes(lower)) continue;
      try { res.setHeader(key, value); } catch {}
    }
    res.setHeader('X-Central-V2', BUILD);
    res.status(upstream.status);

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (contentType.includes('text/html')) {
      let html = bytes.toString('utf8');
      const tag = `<script type="module" src="/__central_v2/native.js?v=${BUILD}"></script>`;
      html = html.includes('</body>') ? html.replace('</body>', tag + '</body>') : html + tag;
      res.type('html').send(html);
      return;
    }

    if (req.method === 'HEAD') res.end();
    else res.send(bytes);
  } catch (error) {
    res.status(502).type('text').send('Central V2 proxy error: ' + error.message);
  }
});

app.listen(PORT, () => console.log(`Central V2 ${BUILD} on ${PORT}`));
