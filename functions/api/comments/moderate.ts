// One-click comment moderation — linked from the Pushover notification.
// GET /api/comments/moderate?id=<id>&sig=<hmac>                  → review page
// GET /api/comments/moderate?id=<id>&sig=<hmac>&action=approve    → approve
// GET /api/comments/moderate?id=<id>&sig=<hmac>&action=delete     → delete
// The HMAC key is the Dino deploy_webhook_secret (shared secret, no new keys).

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1Prepared;
}
interface Env {
  COMMENTS_DB: D1Database;
  DINO_DB: D1Database;
}

async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const page = (title: string, inner: string) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:2rem auto;padding:0 1rem;line-height:1.5}` +
    `.card{border:2px solid #1a1a1a;border-radius:10px;padding:1rem;margin:1rem 0;background:#fff}` +
    `.btn{display:inline-block;margin:.4rem .4rem 0 0;padding:.6rem 1.1rem;border:2px solid #1a1a1a;border-radius:8px;text-decoration:none;font-weight:700}` +
    `.ok{background:#22c55e;color:#fff}.bad{background:#fff;color:#1a1a1a}.meta{color:#666;font-size:.85rem}</style></head>` +
    `<body>${inner}</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const sig = url.searchParams.get('sig') || '';
  const action = url.searchParams.get('action') || '';

  if (!/^\d+$/.test(id)) return new Response('Invalid link.', { status: 403 });
  const secret =
    (await env.DINO_DB.prepare('SELECT value FROM settings WHERE key = ?')
      .bind('deploy_webhook_secret').first<{ value: string }>())?.value?.trim() || '';
  const good = secret && sig && (await hmacHex(secret, 'comment:' + id)) === sig;
  if (!good) return new Response('Invalid link.', { status: 403 });

  if (action === 'approve' || action === 'delete') {
    if (action === 'approve') {
      await env.COMMENTS_DB.prepare('UPDATE comments SET approved = 1 WHERE id = ?').bind(id).run();
    } else {
      await env.COMMENTS_DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
    }
    return page('Done', `<h1>${action === 'approve' ? '✅ Approved' : '🗑️ Deleted'}</h1><p><a href="https://truongnpt.com/admin/">Back to CMS</a></p>`);
  }

  const c = await env.COMMENTS_DB.prepare(
    'SELECT id, slug, name, body, created_at, approved FROM comments WHERE id = ?',
  ).bind(id).first<{ id: number; slug: string; name: string; body: string; created_at: number; approved: number }>();
  if (!c) return new Response('Not found.', { status: 404 });

  const when = new Date(c.created_at).toLocaleString('en-US');
  const base = `https://truongnpt.com/api/comments/moderate?id=${c.id}&sig=${encodeURIComponent(sig)}`;
  return page(
    'Moderate comment',
    `<h1>💬 New comment</h1>` +
    `<p class="meta">On <strong>${esc(c.slug)}</strong> · ${esc(when)} · ${c.approved ? 'approved' : 'pending'}</p>` +
    `<div class="card"><strong>${esc(c.name)}</strong><p style="white-space:pre-line">${esc(c.body)}</p></div>` +
    `<a class="btn ok" href="${base}&action=approve">Approve</a>` +
    `<a class="btn bad" href="${base}&action=delete">Delete</a>`,
  );
};
