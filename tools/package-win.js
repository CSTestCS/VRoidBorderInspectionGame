// Builds a portable Windows x64 build: dist/HavenCheckpoint-win32-x64/HavenCheckpoint.exe
// Works on Windows, macOS and Linux (no Wine needed; resources edited with resedit).
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const packager = require('@electron/packager');

const root = path.join(__dirname, '..');
const keep = [/^\/package\.json$/, /^\/electron(\/|$)/, /^\/src(\/|$)/, /^\/assets(\/|$)/];
const skip = [/^\/src\/dev\./, /^\/assets\/test-models(\/|$)/];

(async () => {
  const out = path.join(root, 'dist');
  const paths = await packager({
    dir: root,
    out,
    name: 'HavenCheckpoint',
    executableName: 'HavenCheckpoint',
    platform: 'win32',
    arch: 'x64',
    overwrite: true,
    asar: false,
    prune: true,
    icon: path.join(root, 'assets', 'icon.ico'),
    appCopyright: 'Haven Checkpoint',
    win32metadata: { CompanyName: 'Haven Checkpoint', FileDescription: 'Haven Checkpoint', ProductName: 'Haven Checkpoint', InternalName: 'HavenCheckpoint' },
    ignore: (p) => {
      if (!p) return false;
      if (skip.some((r) => r.test(p))) return true;
      return !keep.some((r) => r.test(p));
    },
  });
  for (const p of paths) {
    console.log('Built', p);
    if (process.argv.includes('--zip')) {
      const zip = p + '.zip';
      fs.rmSync(zip, { force: true });
      execSync(`zip -qr "${path.basename(zip)}" "${path.basename(p)}"`, { cwd: path.dirname(p), stdio: 'inherit' });
      console.log('Zipped', zip);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
