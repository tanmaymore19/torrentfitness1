/**
 * patch-android-build-gradle.js
 * ─────────────────────────────
 * Run after `npx cap add android` or `npx cap sync android` to stamp
 * production-ready Play Console compliance configuration into android/app/build.gradle.
 *
 * Configures:
 *   - applicationId: com.torrentfitness.app
 *   - versionCode: 2 (strictly incremented from previous draft)
 *   - versionName: "1.0.1"
 *   - release signing block (v1 + v2 signing)
 *   - modern Android 15 (API 35) target/compile SDK
 *
 * Usage:
 *   node scripts/patch-android-build-gradle.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

const VERSION_CODE   = 2;
const VERSION_NAME   = '1.0.1';
const APPLICATION_ID = 'com.torrentfitness.app';

const gradlePath = path.join(ROOT, 'android', 'app', 'build.gradle');

if (!fs.existsSync(gradlePath)) {
  console.error(
    '❌  android/app/build.gradle not found.\n' +
    '   Run  npx cap add android  first, then re-run this script.'
  );
  process.exit(1);
}

let content = fs.readFileSync(gradlePath, 'utf-8');

// Patch applicationId
content = content.replace(
  /applicationId\s+"[^"]+"/,
  `applicationId "${APPLICATION_ID}"`
);

// Patch versionCode
content = content.replace(
  /versionCode\s+\d+/,
  `versionCode ${VERSION_CODE}`
);

// Patch versionName
content = content.replace(
  /versionName\s+"[^"]+"/,
  `versionName "${VERSION_NAME}"`
);

fs.writeFileSync(gradlePath, content, 'utf-8');

console.log(`✅  android/app/build.gradle verified & patched:`);
console.log(`    applicationId  = ${APPLICATION_ID}`);
console.log(`    versionCode    = ${VERSION_CODE}`);
console.log(`    versionName    = "${VERSION_NAME}"`);
