// Read-only Cloudflare backup capture. Requires existing Cloudflare & Drive auth environment.
// Usage: node scripts/hbnf-parent-release/capture-cloudflare.mjs <manifestDriveId> <manifestSha256>
import { captureFromControllingDriveManifest } from './cloudflare-recovery.mjs';

if (process.argv.length !== 4) {
  process.stderr.write('Usage: node scripts/hbnf-parent-release/capture-cloudflare.mjs <manifestDriveId> <manifestSha256>\n');
  process.exitCode = 2;
} else {
  try {
    const result = await captureFromControllingDriveManifest({
      manifestFileId: process.argv[2], expectedManifestSha256: process.argv[3]
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    // Never print raw HTTP responses or tokens.
    const code = /^[A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'PROVIDER_RECOVERY_UNAVAILABLE';
    process.stderr.write(code + '\n');
    process.exitCode = 1;
  }
}
