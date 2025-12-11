import archiver from 'archiver';
import { createWriteStream, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const platform = process.argv[2]; // windows, macos, or linux

if (!platform || !['windows', 'macos', 'linux'].includes(platform)) {
  console.error('❌ Please specify platform: windows, macos, or linux');
  process.exit(1);
}

const distElectronDir = resolve(__dirname, '..', 'dist-electron', platform);
const docsDir = resolve(__dirname, '..', 'docs');

if (!existsSync(distElectronDir)) {
  console.error(`❌ Build directory not found: ${distElectronDir}`);
  process.exit(1);
}

// Ensure docs directory exists
if (!existsSync(docsDir)) {
  mkdirSync(docsDir, { recursive: true });
}

const zipPath = resolve(docsDir, `${platform}.zip`);
const output = createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`✓ Created ${platform}.zip in docs/ (${sizeMB} MB)`);
});

archive.on('error', (err) => {
  console.error('❌ Error creating zip:', err);
  process.exit(1);
});

archive.pipe(output);

// Add all files from dist-electron/{platform}
const files = readdirSync(distElectronDir);
for (const file of files) {
  const filePath = join(distElectronDir, file);
  const stat = statSync(filePath);
  
  if (stat.isDirectory()) {
    archive.directory(filePath, file);
  } else {
    archive.file(filePath, { name: file });
  }
}

archive.finalize();
