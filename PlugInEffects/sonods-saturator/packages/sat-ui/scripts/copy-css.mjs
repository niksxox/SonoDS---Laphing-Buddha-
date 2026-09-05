import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.resolve(__dirname, '../src');
const distDir = path.resolve(__dirname, '../dist');

function copyFiles(src, dist, ext) {
  if (!fs.existsSync(src)) return;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const distPath = path.join(dist, entry.name);
    if (entry.isDirectory()) {
      if (!fs.existsSync(distPath)) fs.mkdirSync(distPath, { recursive: true });
      copyFiles(srcPath, distPath, ext);
    } else if (entry.name.endsWith(ext)) {
      if (!fs.existsSync(path.dirname(distPath))) fs.mkdirSync(path.dirname(distPath), { recursive: true });
      fs.copyFileSync(srcPath, distPath);
    }
  }
}

copyFiles(srcDir, distDir, '.css');
console.log('✅ Copied CSS files to dist/');
