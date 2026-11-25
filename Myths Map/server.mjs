import http from 'node:http';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, rename, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const COOKIE = 'myths_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const publicUser = ({ id, name, role }) => ({ id, name, role });
const publicMyth = ({ ownerId, ...myth }) => myth;
const safeId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64);
  return { salt, hash: hash.toString('hex') };
}
async function passwordMatches(password, account) {
  const candidate = await scrypt(password, account.salt, 64);
  const expected = Buffer.from(account.hash, 'hex');
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}
function textField(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new HttpError(400, `${label} must contain ${min}–${max} characters.`);
  }
  return value.trim();
}
function optionalText(value, label, max) {
  if (value === undefined || value === null || value === '') return '';
  return textField(value, label, 0, max);
}
function mythFields(body) {
  if (typeof body.lat !== 'number' || !Number.isFinite(body.lat) || body.lat < 4 || body.lat > 22 ||
      typeof body.lng !== 'number' || !Number.isFinite(body.lng) || body.lng < 116 || body.lng > 127) {
    throw new HttpError(400, 'Choose a location within the Philippine archipelago (4–22°N, 116–127°E).');
  }
  if (!['land', 'sea'].includes(body.type)) throw new HttpError(400, 'Choose land or sea as the story type.');
  return {
    title: textField(body.title, 'Title', 3, 100),
    author: textField(body.author, 'Author', 2, 80),
    story: textField(body.story, 'Story', 20, 10000),
    lat: body.lat, lng: body.lng, type: body.type,
    region: optionalText(body.region, 'Region', 80),
    source: optionalText(body.source, 'Source', 300)
  };
}
async function jsonBody(req) {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Send a JSON request.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new HttpError(413, 'The request is too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new HttpError(400, 'The request contains invalid JSON.'); }
}

/** A dependency-free HTTP app. Tests can provide their own data folder and clock. */
export async function createApp({ projectRoot = ROOT, dataDir = process.env.DATA_DIR || path.join(ROOT, 'data'),
  credentials = {}, now = () => Date.now(), sessionMs = SESSION_MS, secureCookies = process.env.COOKIE_SECURE === 'true' } = {}) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const databasePath = path.join(dataDir, 'store.json');
  let db;
  try {
    db = JSON.parse(await readFile(databasePath, 'utf8'));
    if (db.version !== 1 || !Array.isArray(db.accounts) || !Array.isArray(db.myths) ||
        !db.bookmarks || typeof db.bookmarks !== 'object' || Array.isArray(db.bookmarks)) throw new Error('Invalid database format');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Cannot read the saved database: ${error.message}. Restore data/store.json from a valid backup.`);
    db = { version: 1, accounts: [], myths: [], bookmarks: {} };
  }
  let saveQueue = Promise.resolve();
  function persist(change = () => {}) {
    const operation = saveQueue.catch(() => {}).then(async () => {
      const next = structuredClone(db);
      const result = change(next);
      const snapshot = JSON.stringify(next, null, 2);
      const temporary = `${databasePath}.${randomBytes(6).toString('hex')}.tmp`;
      await writeFile(temporary, snapshot, { mode: 0o600 });
      await rename(temporary, databasePath);
      db = next;
      return result;
    });
    saveQueue = operation;
    return operation;
  }
  for (const role of ['admin', 'user']) {
    const prefix = role.toUpperCase();
    const login = credentials[role]?.login ?? process.env[`${prefix}_LOGIN`] ?? 'admin';
    const password = credentials[role]?.password ?? process.env[`${prefix}_PASSWORD`] ?? 'admin';
    if (!login || !password) throw new Error(`${prefix}_LOGIN and ${prefix}_PASSWORD cannot be empty.`);
    const seedId = role === 'admin' ? 'admin-account' : 'user-account';
    if (db.removedSeedIds?.includes(seedId)) continue;
    let account = db.accounts.find((item) => item.id === seedId);
    if (!account) {
      account = { id: seedId, role, name: role === 'admin' ? 'Administrator' : 'Explorer' };
      db.accounts.push(account);
    }
    // Reuse an existing salt/hash when credentials have not changed.
    if (account.login !== login.toLowerCase() || !account.hash || !(await passwordMatches(password, account))) {
      Object.assign(account, { login: login.toLowerCase(), ...await passwordHash(password) });
    }
  }
  await persist();

  const sessions = new Map();
  const loginAttempts = new Map();
  let requestCount = 0;
  function getSession(req) {
    const raw = req.headers.cookie?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`));
    const token = raw?.slice(COOKIE.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= now() || (session.user.role !== 'guest' && !db.accounts.some(a => a.id === session.user.id))) { sessions.delete(token); return null; }
    return { ...session, token };
  }
  function sessionResponse(res, user, oldSession) {
    if (oldSession) sessions.delete(oldSession.token);
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    sessions.set(token, { user: publicUser(user), csrfToken, expiresAt: now() + sessionMs });
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(sessionMs / 1000)}${secureCookies ? '; Secure' : ''}`);
    return { user: publicUser(user), csrfToken };
  }
  function requireRole(session, roles) {
    if (!session) throw new HttpError(401, 'Your session has expired. Please sign in again.');
    if (!roles.includes(session.user.role)) throw new HttpError(403, 'This account does not have permission for that action.');
  }
  function requireCsrf(req, session) {
    if (!session) throw new HttpError(401, 'Your session has expired. Please sign in again.');
    if (req.headers['x-csrf-token'] !== session.csrfToken) throw new HttpError(403, 'Please reload the page and try again.');
  }
  function json(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  }
  const rootReal = await realpath(projectRoot);
  async function serveStatic(req, res, pathname) {
    if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'Method not allowed.');
    let relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const rootFiles = ['index.html', 'Index.html', 'style.css', 'Style.css', 'favicon.ico'];
    const permitted = rootFiles.includes(relative) || /^(?:Script|topojson|vendor|assets)\/[a-zA-Z0-9_./ -]+\.(?:js|mjs|css|json|svg|png|jpg|jpeg|webp|woff2|ico|glb|gltf|bin|obj|mtl|ktx2)$/.test(relative);
    if (!permitted || relative.split('/').includes('..')) throw new HttpError(404, 'File not found.');
    let filename = path.join(projectRoot, relative);
    let info;
    try {
      info = await stat(filename);
    } catch (error) {
      if (error.code === 'ENOENT' && relative === 'index.html') { filename = path.join(projectRoot, 'Index.html'); info = await stat(filename); }
      else if (error.code === 'ENOENT' && relative === 'style.css') { filename = path.join(projectRoot, 'Style.css'); info = await stat(filename); }
      else throw error;
    }
    if (!info.isFile()) throw new HttpError(404, 'File not found.');
    const resolved = await realpath(filename);
    if (!resolved.startsWith(`${rootReal}${path.sep}`)) throw new HttpError(404, 'File not found.');
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.obj': 'model/obj', '.mtl': 'model/mtl', '.ktx2': 'image/ktx2' };
    const body = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) throw new HttpError(404, 'File not found.');
      if (!pathname.startsWith('/api/')) { await serveStatic(req, res, pathname); return; }
      const method = req.method;
      if (!['GET', 'HEAD'].includes(method)) {
        const origin = req.headers.origin;
        if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') {
          throw new HttpError(403, 'Cross-site requests are not allowed.');
        }
      }
      if (++requestCount % 100 === 0) {
        for (const [token, session] of sessions) if (session.expiresAt <= now()) sessions.delete(token);
        for (const [ip, attempts] of loginAttempts) if (attempts.until <= now()) loginAttempts.delete(ip);
      }
      const session = getSession(req);
      // Recheck the session when a queued write runs, including after a body read.
      const commit = (roles, change) => persist(next => {
        const current = getSession(req);
        requireRole(current, roles);
        requireCsrf(req, current);
        return change(next);
      });
      if (method === 'GET' && pathname === '/api/config') {
        json(res, 200, { mapboxToken: process.env.MAPBOX_TOKEN || '', mapboxStyle: process.env.MAPBOX_STYLE || '' });
        return;
      }
      if (method === 'GET' && pathname === '/api/session') {
        json(res, 200, { user: session?.user || null, csrfToken: session?.csrfToken || null }); return;
      }
      if (method === 'POST' && pathname === '/api/login') {
        const ip = req.socket.remoteAddress || 'unknown';
        const attempts = loginAttempts.get(ip);
        if (attempts && attempts.until > now() && attempts.count >= 10) {
          res.setHeader('Retry-After', Math.ceil((attempts.until - now()) / 1000));
          throw new HttpError(429, 'Too many sign-in attempts. Please try again in 15 minutes.');
        }
        const body = await jsonBody(req);
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (typeof body.password !== 'string' || body.password.length > 256 || email.length > 254 || !['admin', 'user'].includes(body.role)) {
          throw new HttpError(400, 'Enter an email/username, password, and account role.');
        }
        const account = db.accounts.find((item) => item.role === body.role && item.login === email);
        // Perform the same expensive password check even for an unknown login.
        const matched = await passwordMatches(body.password, account || db.accounts[0]);
        if (!account || !matched || !db.accounts.some(a => a.id === account.id && a.hash === account.hash)) {
          const latest = loginAttempts.get(ip);
          const entry = latest && latest.until > now() ? latest : { count: 0, until: now() + 15 * 60 * 1000 };
          entry.count++;
          loginAttempts.set(ip, entry);
          throw new HttpError(401, 'The email/username or password is incorrect for this role.');
        }
        loginAttempts.delete(ip);
        json(res, 200, sessionResponse(res, account, session)); return;
      }
      if (method === 'POST' && pathname === '/api/guest') {
        // Guest entry needs no credentials or request body.
        if (req.headers['content-type']) await jsonBody(req);
        json(res, 200, sessionResponse(res, { id: `guest-${randomUUID()}`, name: 'Guest', role: 'guest' }, session)); return;
      }
      if (method === 'POST' && pathname === '/api/logout') {
        requireCsrf(req, session);
        sessions.delete(session.token);
        res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookies ? '; Secure' : ''}`);
        json(res, 200, { ok: true }); return;
      }
      if (method === 'GET' && pathname === '/api/myths') {
        json(res, 200, { myths: db.myths.filter((myth) => myth.status === 'approved').map(publicMyth) }); return;
      }
      if (method === 'POST' && pathname === '/api/myths') {
        requireRole(session, ['user', 'admin']); requireCsrf(req, session);
        const fields = mythFields(await jsonBody(req));
        const myth = { ...fields, id: randomUUID(), ownerId: session.user.id, status: 'pending', createdAt: new Date(now()).toISOString(), reviewNote: '' };
        await commit(['admin', 'user'], next => next.myths.push(myth));
        json(res, 201, { myth: publicMyth(myth) }); return;
      }
      if (method === 'GET' && pathname === '/api/my-submissions') {
        requireRole(session, ['user', 'admin']);
        json(res, 200, { myths: db.myths.filter((myth) => myth.ownerId === session.user.id).map(publicMyth) }); return;
      }
      if (method === 'GET' && pathname === '/api/admin/accounts') {
        requireRole(session, ['admin']);
        const online = new Set([...sessions.values()].filter(s => s.expiresAt > now()).map(s => s.user.id));
        const counts = new Map();
        for (const myth of db.myths) counts.set(myth.ownerId, (counts.get(myth.ownerId) || 0) + 1);
        const accounts = db.accounts.map(a => ({
          ...publicUser(a), login: a.login, signedIn: online.has(a.id), submissions: counts.get(a.id) || 0,
        }));
        json(res, 200, { accounts }); return;
      }
      const accountRoute = pathname.match(/^\/api\/admin\/accounts\/([^/]+)$/);
      if (method === 'DELETE' && accountRoute) {
        const id = accountRoute[1];
        await commit(['admin'], next => {
          if (id === session.user.id) throw new HttpError(409, 'Your signed-in administrator account must stay active.');
          if (!next.accounts.some(a => a.id === id)) throw new HttpError(404, 'Account not found.');
          next.accounts = next.accounts.filter(a => a.id !== id);
          delete next.bookmarks[id];
          if (id === 'admin-account' || id === 'user-account') (next.removedSeedIds ??= []).push(id);
        });
        for (const [token, entry] of sessions) if (entry.user.id === id) sessions.delete(token);
        json(res, 200, { ok: true }); return;
      }
      if (method === 'GET' && pathname === '/api/admin/myths') {
        requireRole(session, ['admin']);
        json(res, 200, { myths: db.myths.map(m => ({ ...publicMyth(m), ownerId: m.ownerId })) }); return;
      }
      const review = pathname.match(/^\/api\/admin\/myths\/([^/]+)$/);
      if (method === 'DELETE' && review) {
        await commit(['admin'], next => {
          if (!next.myths.some(m => m.id === review[1])) throw new HttpError(404, 'Submission not found.');
          next.myths = next.myths.filter(m => m.id !== review[1]);
          for (const [id, saved] of Object.entries(next.bookmarks)) next.bookmarks[id] = saved.filter(key => key !== review[1]);
        });
        json(res, 200, { ok: true }); return;
      }
      if (method === 'PATCH' && review) {
        requireRole(session, ['admin']); requireCsrf(req, session);
        const body = await jsonBody(req);
        if (!['approved', 'rejected'].includes(body.status)) throw new HttpError(400, 'Choose approved or rejected.');
        const reviewNote = optionalText(body.reviewNote, 'Review note', 500);
        const myth = await commit(['admin'], next => {
          const item = next.myths.find(m => m.id === review[1]);
          if (!item) throw new HttpError(404, 'The submission was not found.');
          return Object.assign(item, { status: body.status, reviewNote, reviewedAt: new Date(now()).toISOString() });
        });
        json(res, 200, { myth: publicMyth(myth) }); return;
      }
      if (method === 'GET' && pathname === '/api/bookmarks') {
        requireRole(session, ['user', 'admin']);
        json(res, 200, { bookmarks: db.bookmarks[session.user.id] || [] }); return;
      }
      const bookmark = pathname.match(/^\/api\/bookmarks\/([^/]+)$/);
      if (method === 'PUT' && bookmark) {
        requireRole(session, ['user', 'admin']); requireCsrf(req, session);
        if (!safeId(bookmark[1])) throw new HttpError(400, 'Invalid story ID.');
        const body = await jsonBody(req);
        if (typeof body.saved !== 'boolean') throw new HttpError(400, 'Choose whether to save this story.');
        const saved = await commit(['user', 'admin'], next => {
          const bookmarks = new Set(next.bookmarks[session.user.id] || []);
          if (body.saved) {
            if (bookmarks.size >= 1000 && !bookmarks.has(bookmark[1])) throw new HttpError(400, 'Your collection is full. Remove a saved story first.');
            bookmarks.add(bookmark[1]);
          } else bookmarks.delete(bookmark[1]);
          return next.bookmarks[session.user.id] = [...bookmarks];
        });
        json(res, 200, { bookmarks: saved }); return;
      }
      throw new HttpError(404, 'This endpoint was not found.');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : (error.code === 'ENOENT' || error instanceof URIError ? 404 : 500);
      if (status === 500) console.error(error);
      if (!res.headersSent) json(res, status, { error: status === 500 ? 'The server could not complete this request. Please try again.' : (error instanceof HttpError ? error.message : 'File not found.') });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return { server, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Read only the atlas's two public settings. Exported values take precedence.
  try {
    const settings = await readFile(path.join(ROOT, '.env'), 'utf8');
    for (const line of settings.split(/\r?\n/)) {
      const match = line.match(/^\s*(MAPBOX_TOKEN|MAPBOX_STYLE)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\s]*))\s*(?:#.*)?$/);
      if (match) process.env[match[1]] ??= match[2] ?? match[3] ?? match[4];
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
  const { server } = await createApp();
  server.on('error', (error) => {
    console.error(`Could not start Myths Map: ${error.message}${error.code === 'EADDRINUSE' ? '. Choose a different PORT or stop the other server.' : ''}`);
    process.exitCode = 1;
  });
  server.listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log(`Myths Map is ready at http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`);
    if (!process.env.ADMIN_PASSWORD || !process.env.USER_PASSWORD) console.log('Demo sign-in: choose Admin or Explorer, then use admin / admin.');
  });
}
