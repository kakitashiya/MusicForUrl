const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Load the real registration block without starting the server, opening SQLite,
// or calling upstream music services. next() represents the downstream router,
// which remains responsible for validating signed media and cover tokens.
function sitePasswordMiddleware() {
  const filename = path.join(__dirname, '..', 'server.js');
  const source = readFileSync(filename, 'utf8');
  const start = source.indexOf('if (process.env.SITE_PASSWORD) {');
  const end = source.indexOf('app.use(express.static', start);
  assert.ok(start >= 0 && end > start, 'site password registration block exists');
  let middleware;
  vm.runInNewContext(source.slice(start, end), {
    process: { env: { SITE_PASSWORD: 'regression-only-password' } },
    app: { use(handler) { middleware = handler; } },
    crypto,
    path,
    __dirname: path.dirname(filename),
  }, { filename });
  assert.equal(typeof middleware, 'function');
  return middleware;
}

function request(middleware, pathname, headers = {}, query = {}) {
  const result = { downstream: 0, status: 200, cookies: [] };
  const req = { path: pathname, headers, query, secure: false, accepts: () => false };
  const res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; },
    cookie(...args) { result.cookies.push(args); return this; },
    sendFile(file) { result.file = file; return this; },
  };
  middleware(req, res, () => { result.downstream++; });
  return result;
}

test('site password gate forwards media and cover paths to signed-token handlers', () => {
  const middleware = sitePasswordMiddleware();
  for (const pathname of ['/api/player/media/signed-token', '/api/player/cover/signed-token']) {
    const result = request(middleware, pathname);
    assert.equal(result.downstream, 1, `${pathname} must reach the downstream handler`);
    assert.equal(result.body, undefined);
    assert.equal(result.cookies.length, 0);
  }
});

test('site password gate still protects ordinary APIs and lookalike media paths', () => {
  const middleware = sitePasswordMiddleware();
  for (const pathname of [
    '/api/player/capabilities', '/api/player/resolve', '/api/auth/login',
    '/api/player/media', '/api/player/cover', '/api/player/mediator/token',
    '/api/player/coverage/token', '/api/hls/cache/status',
  ]) {
    const result = request(middleware, pathname);
    assert.equal(result.downstream, 0, pathname);
    assert.equal(result.status, 401, pathname);
    assert.equal(result.body.success, false);
  }
});

test('site password gate accepts the configured password and its signed cookie', () => {
  const middleware = sitePasswordMiddleware();
  const authenticated = request(middleware, '/api/player/capabilities', {
    'x-site-password': 'regression-only-password',
  });
  assert.equal(authenticated.downstream, 1);
  assert.equal(authenticated.cookies.length, 1);
  const [name, value, options] = authenticated.cookies[0];
  assert.equal(name, 'site_auth');
  assert.equal(options.httpOnly, true);
  assert.equal(request(middleware, '/api/player/capabilities', {
    cookie: `${name}=${value}`,
  }).downstream, 1);
  assert.equal(request(middleware, '/api/player/capabilities', {
    cookie: `${name}=invalid`,
  }).status, 401);
});
