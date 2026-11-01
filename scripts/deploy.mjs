// Deploys the worker with a new access password: 8 random letters and digits,
// uploaded as the ACCESS_PASSWORD secret together with the code, so the old
// password (and every session made with it) stops working at once. The new
// password is printed under the worker's address.
import { spawn } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const password = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

// The secret goes through a file wrangler reads once; it is removed right after.
const folder = mkdtempSync(join(tmpdir(), 'att-deploy-'));
const secrets = join(folder, 'secrets.json');
writeFileSync(secrets, JSON.stringify({ ACCESS_PASSWORD: password }), { mode: 0o600 });

const wrangler = spawn('npx', ['wrangler', 'deploy', '--secrets-file', secrets], {
  cwd: new URL('../apps/server/', import.meta.url),
  stdio: ['inherit', 'pipe', 'inherit'],
});

let printed = false;
let pending = '';
wrangler.stdout.on('data', (chunk) => {
  pending += chunk.toString();
  const lines = pending.split('\n');
  pending = lines.pop() ?? '';
  for (const line of lines) {
    process.stdout.write(`${line}\n`);
    if (!printed && /https:\/\/\S+\.workers\.dev/.test(line)) {
      process.stdout.write(`password: ${password}\n`);
      printed = true;
    }
  }
});

wrangler.on('close', (code) => {
  if (pending) process.stdout.write(pending);
  rmSync(folder, { recursive: true, force: true });
  if (code !== 0) {
    process.stdout.write('\nDeploy failed: the password did not change.\n');
    process.exit(code ?? 1);
  }
  if (!printed) process.stdout.write(`password: ${password}\n`);
});
