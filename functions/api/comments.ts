// Blog comments API — Cloudflare Pages Function.
// GET  /api/comments?slug=<post-slug>   → approved comments for the post
// POST /api/comments                     → submit a comment (held for moderation)
// D1 bindings: COMMENTS_DB (truongnpt-comments), DINO_DB (dino settings for
// Pushover creds + the HMAC secret used to sign moderation links).

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { last_row_id: number } }>;
}
interface D1Database {
  prepare(query: string): D1Prepared;
}
interface Env {
  COMMENTS_DB: D1Database;
  DINO_DB: D1Database;
  COMMENTS_ADMIN_PASSWORD?: string;
}
type Ctx = { request: Request; env: Env };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const ADMIN_COOKIE = 'blog_cadmin';
function getCookie(request: Request, name: string): string {
  const h = request.headers.get('cookie') || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}
async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const pw = (env.COMMENTS_ADMIN_PASSWORD || '').trim();
  if (!pw) return false;
  const tok = getCookie(request, ADMIN_COOKIE);
  return tok !== '' && tok === (await hmacHex(pw, 'comments-admin-v1'));
}

async function dinoSetting(db: D1Database, key: string): Promise<string> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value?.trim() ?? '';
}

async function notifyNewComment(db: D1Database, title: string, message: string, url: string): Promise<void> {
  const user = await dinoSetting(db, 'pushover_user');
  const token = await dinoSetting(db, 'pushover_token');
  if (!user || !token) return;
  try {
    const body = new URLSearchParams({ token, user, title, message, url, url_title: 'Moderate' });
    await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    /* notification is best-effort */
  }
}

export const onRequestGet = async ({ request, env }: Ctx) => {
  const slug = (new URL(request.url).searchParams.get('slug') || '').slice(0, 200);
  if (!slug) return json({ error: 'missing slug' }, 400);
  const admin = await isAdmin(request, env);
  const { results } = admin
    ? await env.COMMENTS_DB.prepare(
        'SELECT id, name, body, created_at, approved FROM comments WHERE slug = ? ORDER BY created_at ASC LIMIT 200',
      )
        .bind(slug)
        .all<{ id: number; name: string; body: string; created_at: number; approved: number }>()
    : await env.COMMENTS_DB.prepare(
        'SELECT id, name, body, created_at FROM comments WHERE slug = ? AND approved = 1 ORDER BY created_at ASC LIMIT 200',
      )
        .bind(slug)
        .all<{ id: number; name: string; body: string; created_at: number }>();
  return json({ comments: results, admin });
};

export const onRequestPost = async ({ request, env }: Ctx) => {
  let data: Record<string, unknown> = {};
  try {
    data = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }

  // Admin inline moderation (from the post page; cookie-authenticated).
  const action = String(data.action || '');
  if (action === 'approve' || action === 'delete') {
    if (!(await isAdmin(request, env))) return json({ error: 'forbidden' }, 403);
    const id = String(data.id || '');
    if (!/^\d+$/.test(id)) return json({ error: 'bad id' }, 400);
    if (action === 'approve') {
      await env.COMMENTS_DB.prepare('UPDATE comments SET approved = 1 WHERE id = ?').bind(id).run();
    } else {
      await env.COMMENTS_DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
    }
    return json({ ok: true });
  }

  // Honeypot: bots fill the hidden "website" field; pretend success, store nothing.
  if (data.website) return json({ ok: true });

  const slug = String(data.slug || '').slice(0, 200);
  const name = String(data.name || '').trim().slice(0, 60);
  const body = String(data.body || '').trim().slice(0, 2000);
  if (!slug || !name || !body) return json({ error: 'Please fill in your name and comment.' }, 400);

  // Rate limit: max 5 comments/hour per IP.
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const ipHash = await sha256Hex('blog-comment:' + ip);
  const recent = await env.COMMENTS_DB.prepare(
    'SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?',
  ).bind(ipHash, Date.now() - 3600_000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= 5) return json({ error: 'Too many comments — please try again later.' }, 429);

  const ua = (request.headers.get('user-agent') || '').slice(0, 200);
  const res = await env.COMMENTS_DB.prepare(
    'INSERT INTO comments (slug, name, body, created_at, approved, ip_hash, user_agent) VALUES (?, ?, ?, ?, 0, ?, ?)',
  ).bind(slug, name, body, Date.now(), ipHash, ua).run();
  const id = res.meta.last_row_id;

  // Notify the admin with a signed one-click moderation link.
  const secret = await dinoSetting(env.DINO_DB, 'deploy_webhook_secret');
  if (secret) {
    const sig = await hmacHex(secret, 'comment:' + id);
    const modUrl = `https://truongnpt.com/api/comments/moderate?id=${id}&sig=${sig}`;
    await notifyNewComment(
      env.DINO_DB,
      '💬 New blog comment',
      `${name} on "${slug}": ${body.slice(0, 140)}`,
      modUrl,
    );
  }

  return json({ ok: true, pending: true });
};
