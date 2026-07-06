#!/bin/sh
# Railway / container diagnostic for GCS + Google OAuth token fetch.
# Run inside the app container (railway ssh), e.g.:
#   sh /app/backend/scripts/railway-gcs-diagnose.sh
# Or paste this file's contents into the shell.
#
# Does NOT print secrets (no SA JSON, no access tokens).

set -u

section() {
  printf '\n========== %s ==========\n' "$1"
}

pass() { printf '  [PASS] %s\n' "$1"; }
fail() { printf '  [FAIL] %s\n' "$1"; }
info() { printf '  [INFO] %s\n' "$1"; }

section "Build / process"
if [ -f /app/build-info.json ]; then
  info "build-info.json:"
  sed 's/^/    /' /app/build-info.json 2>/dev/null | head -20
else
  info "build-info.json not found"
fi

NODE_PID=$(pgrep -f 'node dist/index.js' | head -1 || true)
if [ -n "${NODE_PID:-}" ]; then
  pass "Node backend PID: $NODE_PID"
  ps -o args= -p "$NODE_PID" 2>/dev/null | sed 's/^/    /'
else
  fail "Node backend (node dist/index.js) not running"
fi

section "GCP credentials file"
if [ -f /tmp/gcp-sa.json ]; then
  pass "/tmp/gcp-sa.json exists ($(wc -c < /tmp/gcp-sa.json | tr -d ' ') bytes)"
  head -c 40 /tmp/gcp-sa.json | grep -q '"type":"service_account"' && pass 'starts with service_account JSON' || info 'first bytes do not look like SA JSON (may still be OK if pretty-printed)'
else
  fail "/tmp/gcp-sa.json missing"
fi

section "Node process environment"
if [ -n "${NODE_PID:-}" ]; then
  tr '\0' '\n' < "/proc/$NODE_PID/environ" | grep -E '^(STORAGE_TYPE|BUCKET_NAME|GOOGLE_CLOUD_PROJECT_ID|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_LOCATION|NODE_OPTIONS|GCP_SA_JSON)=' | sed 's/=.*/=***redacted***/' | sed 's/^/    /'
  tr '\0' '\n' < "/proc/$NODE_PID/environ" | grep -q '^GOOGLE_APPLICATION_CREDENTIALS=' && pass 'GOOGLE_APPLICATION_CREDENTIALS set on Node' || fail 'GOOGLE_APPLICATION_CREDENTIALS missing on Node'
  tr '\0' '\n' < "/proc/$NODE_PID/environ" | grep -q '^STORAGE_TYPE=gcs' && info 'STORAGE_TYPE=gcs' || info 'STORAGE_TYPE is not gcs (or unset)'
else
  fail "Skipped (no Node PID)"
fi

section "Interactive shell environment (may differ from Node)"
if [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
  pass "shell GOOGLE_APPLICATION_CREDENTIALS=$GOOGLE_APPLICATION_CREDENTIALS"
else
  info "shell GOOGLE_APPLICATION_CREDENTIALS not set (normal for railway ssh)"
fi

section "DNS"
for host in oauth2.googleapis.com www.googleapis.com; do
  info "$host:"
  nslookup "$host" 2>/dev/null | sed 's/^/    /' | head -12
done

section "curl IPv4 vs IPv6 (token endpoint)"
TOKEN_URL="https://www.googleapis.com/oauth2/v4/token"
POST_DATA="grant_type=client_credentials"

if curl -4 -sS -m 15 -X POST "$TOKEN_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "$POST_DATA" 2>/dev/null | head -c 80 | grep -q '"error"'; then
  pass "curl -4 POST $TOKEN_URL → JSON error response (connectivity OK)"
else
  fail "curl -4 POST $TOKEN_URL → no JSON (connection or TLS problem)"
fi

if curl -6 -sS -m 5 -X POST "$TOKEN_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "$POST_DATA" 2>/dev/null | head -c 80 | grep -q '"error"'; then
  pass "curl -6 POST $TOKEN_URL → JSON error response"
else
  fail "curl -6 POST $TOKEN_URL → cannot reach Google over IPv6"
fi

section "Node tests (uses /tmp/gcp-sa.json)"
if [ ! -d /app/backend/node_modules ]; then
  fail "/app/backend/node_modules missing — run from app container"
  exit 1
fi

export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-/tmp/gcp-sa.json}"

cd /app/backend || exit 1

node <<'NODE'
const https = require('https');

function log(ok, msg) {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${msg}`);
}

(async () => {
  // 1) Raw https + family 4
  await new Promise((resolve) => {
  const data = 'grant_type=client_credentials';
  const req = https.request(
    {
      hostname: 'www.googleapis.com',
      path: '/oauth2/v4/token',
      method: 'POST',
      family: 4,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    },
    (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        const ok = res.statusCode === 400 && b.includes('"error"');
        log(ok, `https.request family=4 → status ${res.statusCode}`);
        if (!ok) console.log('    body:', b.slice(0, 120));
        resolve();
      });
    }
  );
  req.on('error', (e) => {
    log(false, `https.request family=4 → ${e.message}`);
    resolve();
  });
  req.write(data);
  req.end();
});

// 2) Plain GoogleAuth
try {
  const { GoogleAuth } = require('google-auth-library');
  await new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
  }).getAccessToken();
  log(true, 'GoogleAuth.getAccessToken()');
} catch (e) {
  log(false, `GoogleAuth.getAccessToken() → ${e.message}`);
}

// 3) GoogleAuth + Gaxios agent family 4
try {
  const { GoogleAuth } = require('google-auth-library');
  const { Gaxios } = require('gaxios');
  const agent = new https.Agent({ family: 4, keepAlive: true });
  await new GoogleAuth({
    transporter: new Gaxios({ agent }),
    scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
  }).getAccessToken();
  log(true, 'GoogleAuth + Gaxios(agent family=4).getAccessToken()');
} catch (e) {
  log(false, `GoogleAuth + Gaxios(agent family=4) → ${e.message}`);
}

// 4) JWT client (service-account path)
try {
  const { JWT } = require('google-auth-library');
  await new JWT({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
  }).authorize();
  log(true, 'JWT.authorize()');
} catch (e) {
  log(false, `JWT.authorize() → ${e.message}`);
}

// 5) @google-cloud/storage bucket exists
try {
  const { Storage } = require('@google-cloud/storage');
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const bucketName = process.env.BUCKET_NAME;
  if (!projectId || !bucketName) {
    log(false, 'GCS bucket test skipped (GOOGLE_CLOUD_PROJECT_ID or BUCKET_NAME unset in shell env)');
  } else {
    const [exists] = await new Storage({ projectId }).bucket(bucketName).exists();
    log(exists, `Storage.bucket(${bucketName}).exists() → ${exists}`);
  }
} catch (e) {
  log(false, `Storage.bucket().exists() → ${e.message}`);
}

// 6) Package versions
try {
  const gal = require('google-auth-library/package.json').version;
  const gx = require('gaxios/package.json').version;
  const st = require('@google-cloud/storage/package.json').version;
  console.log(`  [INFO] google-auth-library@${gal} gaxios@${gx} @google-cloud/storage@${st}`);
} catch (e) {
  console.log('  [INFO] could not read package versions:', e.message);
}
})();
NODE

section "Optional: disable IPv6 and retry GoogleAuth"
if [ -w /proc/sys/net/ipv6/conf/all/disable_ipv6 ] 2>/dev/null; then
  IPV6_BEFORE=$(cat /proc/sys/net/ipv6/conf/all/disable_ipv6 2>/dev/null || echo '?')
  info "IPv6 disable_ipv6 before: $IPV6_BEFORE"
  echo 1 > /proc/sys/net/ipv6/conf/all/disable_ipv6 2>/dev/null && info 'set disable_ipv6=1' || info 'could not set disable_ipv6'
  cd /app/backend
  node -e "
    const { GoogleAuth } = require('google-auth-library');
    new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_write'] })
      .getAccessToken()
      .then(() => console.log('  [PASS] GoogleAuth after IPv6 disabled'))
      .catch((e) => console.log('  [FAIL] GoogleAuth after IPv6 disabled →', e.message));
  "
  # restore if it was enabled before
  [ "$IPV6_BEFORE" = "0" ] && echo 0 > /proc/sys/net/ipv6/conf/all/disable_ipv6 2>/dev/null || true
else
  info 'cannot write /proc/sys/net/ipv6/conf/all/disable_ipv6 (skip)'
fi

section "Done"
info "Compare PASS/FAIL lines between working (cab7be5) and broken (cd9936b) containers."
info "Save output: sh /app/backend/scripts/railway-gcs-diagnose.sh 2>&1 | tee /tmp/gcs-diagnose.txt"
