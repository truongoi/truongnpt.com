// Blog comments admin — password-protected management UI.
//   GET  /admin/comments   → login form, or the comment list (with a valid cookie)
//   POST /admin/comments   → login | approve | delete | logout
// The password is the COMMENTS_ADMIN_PASSWORD Pages environment variable
// (truongnpt-com → Settings → Environment variables → Production).
// Auth state is an HMAC-signed cookie; the password never leaves the server.

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1Prepared;
}
interface Env {
  COMMENTS_DB: D1Database;
  COMMENTS_ADMIN_PASSWORD?: string;
}
type Ctx = { request: Request; env: Env };
type Comment = { id: number; slug: string; name: string; body: string; created_at: number; approved: number };

const COOKIE = 'blog_cadmin';

const esc = (s: string | number | null | undefined) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getCookie(request: Request, name: string): string {
  const h = request.headers.get('cookie') || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

async function isAuthed(request: Request, env: Env): Promise<boolean> {
  const pw = (env.COMMENTS_ADMIN_PASSWORD || '').trim();
  if (!pw) return false;
  const tok = getCookie(request, COOKIE);
  return tok !== '' && tok === (await hmacHex(pw, 'comments-admin-v1'));
}

const shell = (title: string, inner: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${esc(title)}</title><style>` +
      `body{font-family:system-ui,-apple-system,sans-serif;max-width:44rem;margin:0 auto;padding:1rem;line-height:1.5;background:#f6f6f4}` +
      `.card{background:#fff;border:1px solid #e2e2df;border-radius:10px;padding:.9rem 1rem;margin:.7rem 0}` +
      `.meta{color:#666;font-size:.82rem;margin:.2rem 0 .5rem}` +
      `.cbody{white-space:pre-line;margin:.4rem 0}` +
      `.row{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem}` +
      `button{font:inherit;font-weight:700;padding:.55rem 1.1rem;border-radius:8px;border:2px solid #1a1a1a;cursor:pointer}` +
      `.ok{background:#22c55e;color:#fff}.bad{background:#fff;color:#1a1a1a}` +
      `.sec{font-size:1.05rem;font-weight:800;margin:1.4rem 0 .2rem}` +
      `input[type=password]{font:inherit;padding:.55rem .8rem;border:2px solid #1a1a1a;border-radius:8px;width:100%;box-sizing:border-box}` +
      `.top{display:flex;align-items:center;justify-content:space-between;gap:.5rem}` +
      `.pill{background:#1a1a1a;color:#fff;border-radius:999px;padding:.15rem .7rem;font-size:.8rem;font-weight:700}` +
      `</style></head><body>${inner}</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );

const loginPage = (error: string) =>
  shell(
    'Comments admin login',
    `<h1>💬 Comments</h1><div class="card"><p>Enter the admin password to manage blog comments.</p>` +
      `<form method="post"><input type="hidden" name="action" value="login">` +
      `<input type="password" name="password" placeholder="Password" autocomplete="current-password" required>` +
      `<div class="row"><button class="ok" type="submit">Log in</button></div></form>` +
      (error ? `<p style="color:#b91c1c;font-weight:700;">${esc(error)}</p>` : '') +
      `</div>`,
  );

export const onRequestGet = async ({ request, env }: Ctx) => {
  if (!(env.COMMENTS_ADMIN_PASSWORD || '').trim()) {
    return shell(
      'Not configured',
      `<h1>💬 Comments</h1><div class="card"><p><strong>COMMENTS_ADMIN_PASSWORD</strong> is not set on the ` +
        `<strong>truongnpt-com</strong> Pages project.</p>` +
        `<p class="meta">Cloudflare dashboard → Pages → truongnpt-com → Settings → ` +
        `Environment variables → Production → add <strong>COMMENTS_ADMIN_PASSWORD</strong>, then redeploy.</p></div>`,
    );
  }
  if (!(await isAuthed(request, env))) return loginPage('');

  const { results } = await env.COMMENTS_DB.prepare(
    'SELECT id, slug, name, body, created_at, approved FROM comments ORDER BY approved ASC, created_at DESC LIMIT 500',
  ).all<Comment>();
  const pending = results.filter((c) => !c.approved);
  const approved = results.filter((c) => c.approved);

  const card = (c: Comment, showApprove: boolean) => {
    const when = new Date(c.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    return (
      `<div class="card"><div class="meta"><strong>${esc(c.name)}</strong> on <strong>${esc(c.slug)}</strong> · ${esc(when)}</div>` +
      `<div class="cbody">${esc(c.body)}</div>` +
      `<form method="post"><input type="hidden" name="id" value="${c.id}"><div class="row">` +
      (showApprove ? `<button class="ok" type="submit" name="action" value="approve">Approve</button>` : '') +
      `<button class="bad" type="submit" name="action" value="delete" onclick="return confirm('Delete this comment?')">Delete</button>` +
      `</div></form></div>`
    );
  };

  return shell(
    '💬 Comments admin',
    `<div class="top"><h1>💬 Comments</h1>` +
      `<form method="post"><button class="bad" type="submit" name="action" value="logout">Log out</button></form></div>` +
      `<div class="sec">Pending <span class="pill">${pending.length}</span></div>` +
      (pending.length ? pending.map((c) => card(c, true)).join('') : `<div class="card"><p class="meta">Nothing waiting. 🎉</p></div>`) +
      `<div class="sec">Approved <span class="pill">${approved.length}</span></div>` +
      (approved.length
        ? approved.map((c) => card(c, false)).join('')
        : `<div class="card"><p class="meta">No approved comments yet.</p></div>`),
  );
};

export const onRequestPost = async ({ request, env }: Ctx) => {
  const pw = (env.COMMENTS_ADMIN_PASSWORD || '').trim();
  let form: FormData | null = null;
  try {
    form = await request.formData();
  } catch {
    form = null;
  }
  const action = String(form?.get('action') || '');
  const redirect = (setCookie?: string) => {
    const headers: Record<string, string> = { location: '/admin/comments/' };
    if (setCookie) headers['set-cookie'] = setCookie;
    return new Response(null, { status: 303, headers });
  };

  if (action === 'login') {
    const attempt = String(form?.get('password') || '');
    if (pw && attempt === pw) {
      const tok = await hmacHex(pw, 'comments-admin-v1');
      const exp = new Date(Date.now() + 30 * 86400_000).toUTCString();
      return redirect(
        `${COOKIE}=${encodeURIComponent(tok)}; Path=/; Expires=${exp}; HttpOnly; SameSite=Lax; Secure`,
      );
    }
    return loginPage('Wrong password.');
  }

  if (!(await isAuthed(request, env))) return loginPage('');

  if (action === 'logout') {
    return redirect(`${COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax; Secure`);
  }

  const id = String(form?.get('id') || '');
  if ((action === 'approve' || action === 'delete') && /^\d+$/.test(id)) {
    if (action === 'approve') {
      await env.COMMENTS_DB.prepare('UPDATE comments SET approved = 1 WHERE id = ?').bind(id).run();
    } else {
      await env.COMMENTS_DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
    }
  }
  return redirect();
};
