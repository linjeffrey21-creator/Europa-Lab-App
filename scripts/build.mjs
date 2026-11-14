/**
 * Lab4All — Build & Verification Script (Node.js v24+ native TypeScript compiler)
 *
 * Compiles all `.ts` files in `src/` using Node's built-in `module.stripTypeScriptTypes`,
 * rewrites `.ts` relative imports to `.js` for native browser ES Modules, copies `styles.css`,
 * and generates `dist/index.html` with an ESM import map for `react`, `react-dom/client`, and `three`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function walkTsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

ensureDir(distDir);
ensureDir(path.join(distDir, 'src'));

const buildVersion = Date.now();
const tsFiles = walkTsFiles(srcDir);
let compiledCount = 0;

for (const filePath of tsFiles) {
  const relPath = path.relative(srcDir, filePath);
  const outRelPath = relPath.replace(/\.ts$/, '.js');
  const outFullPath = path.join(distDir, 'src', outRelPath);
  ensureDir(path.dirname(outFullPath));

  const rawTs = fs.readFileSync(filePath, 'utf8');
  const strippedJs = stripTypeScriptTypes(rawTs, { mode: 'strip', sourceUrl: relPath });

  // Rewrite relative `.ts` imports to `.js?v=...` for browser ESM resolution and cache busting
  const browserJs = strippedJs.replace(
    /(from\s+['"])(\.[^'"]+?)\.ts(['"])/g,
    `$1$2.js?v=${buildVersion}$3`
  );

  fs.writeFileSync(outFullPath, browserJs, 'utf8');
  compiledCount++;
  console.log(`Compiled: src/${relPath.replace(/\\/g, '/')} -> dist/src/${outRelPath.replace(/\\/g, '/')}`);
}

// Copy styles.css
const cssSrc = path.join(srcDir, 'styles.css');
const cssOut = path.join(distDir, 'styles.css');
fs.copyFileSync(cssSrc, cssOut);
console.log('Copied: src/styles.css -> dist/styles.css');

// Copy assets
const assetsSrc = path.join(srcDir, 'assets');
const assetsOut = path.join(distDir, 'assets');
if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, assetsOut, { recursive: true });
  console.log('Copied: src/assets -> dist/assets');
}

// Generate dist/index.html
const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Europa Lab — Interactive Virtual Mechanics Laboratory</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600&family=Roboto:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
      crossorigin="anonymous"
    />
    <script
      src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"
      crossorigin="anonymous"
    ></script>
    <link rel="stylesheet" href="./styles.css" />
    <script type="importmap">
      {
        "imports": {
          "react": "https://esm.sh/react@18.3.1",
          "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
          "three": "https://esm.sh/three@0.169.0",
          "@vercel/analytics": "https://esm.sh/@vercel/analytics@1.3.1"
        }
      }
    </script>
  </head>
  <body>
    <!-- Boreal — Aurora Borealis Loading Screen -->
    <div id="callisto-loader">
      <div class="boreal-aurora-bg"></div>
      <div class="boreal-aurora-glow-overlay"></div>

      <!-- Europa Lab — Aurora Loading Screen -->
      <div class="callisto-ge-branding">
        <img class="callisto-ge-mascot" src="./assets/penguin-mascot.png" alt="" width="96" height="96" fetchpriority="high" />
        <h1 class="callisto-ge-logo">Europa Lab</h1>
        <p class="callisto-ge-description">A virtual lab for projectile motion</p>
        <span class="callisto-ge-status" aria-hidden="true">Loading lab…</span>
        <div class="callisto-ge-track" role="progressbar" aria-label="Loading Europa Lab">
          <div class="callisto-ge-fill"></div>
        </div>
      </div>
    </div>
    <script>
      if (new URLSearchParams(window.location.search).get('dismiss_loader') === '1') {
        var loaderEl = document.getElementById('callisto-loader');
        if (loaderEl) loaderEl.remove();
      }
    </script>
    <div id="root"></div>
    <section id="startup-error" hidden role="alert" style="max-width: 36rem; margin: 3rem auto; padding: 1rem;">
      <h1>Europa Lab couldn’t load</h1>
      <p>Check your connection and try reloading the lab.</p>
      <button type="button" onclick="window.location.reload()">Reload lab</button>
    </section>
    <script type="module">
      import("./src/main.js?v=${buildVersion}").catch((error) => {
        console.error("Europa Lab startup failed:", error);
        document.getElementById("callisto-loader")?.remove();
        document.getElementById("startup-error").hidden = false;
      });
    </script>
  </body>
</html>
`;

fs.writeFileSync(path.join(distDir, 'index.html'), indexHtml, 'utf8');
// Also copy dist/ files to docs/ so GitHub Pages can deploy immediately from main:/docs
const docsDir = path.join(rootDir, 'docs');
fs.cpSync(distDir, docsDir, { recursive: true });
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '', 'utf8');
console.log(`Generated: dist/index.html and docs/index.html (${compiledCount} TypeScript modules compiled cleanly)`);
