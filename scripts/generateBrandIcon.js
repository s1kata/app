const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function run() {
  const root = process.cwd();
  const input = path.join(root, 'assets/icons/icon-vip.svg');
  const outputDir = path.join(root, '.generated');
  const output = path.join(outputDir, 'icon-vip-1024.png');

  if (!fs.existsSync(input)) {
    throw new Error(`Source SVG not found: ${input}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  await sharp(input)
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(output);

  console.log(`Generated icon: ${output}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

