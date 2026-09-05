import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcTheme = path.resolve(__dirname, '../src/theme/tokens.css');
const distThemeDir = path.resolve(__dirname, '../dist/theme');

if (fs.existsSync(srcTheme)) {
  fs.mkdirSync(distThemeDir, { recursive: true });
  fs.copyFileSync(srcTheme, path.join(distThemeDir, 'tokens.css'));
  console.log('✅ Copied tokens.css to dist/theme/');
}
