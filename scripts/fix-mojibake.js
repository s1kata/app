const fs = require('fs');
const path = process.argv[2];
if (!path) {
  console.error('Usage: node fix-mojibake.js <file>');
  process.exit(1);
}
const raw = fs.readFileSync(path);
// Strip UTF-8 BOM if present
let s = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf
  ? raw.slice(3).toString('utf8')
  : raw.toString('utf8');

function decodeUtf8Mojibake(str) {
  try {
    const bytes = Uint8Array.from([...str].map((ch) => ch.charCodeAt(0) & 0xff));
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return str;
  }
}

// Heuristic: if file contains typical mojibake marker and not normal Cyrillic labels
const hasBad = s.includes('Р“РѕСЂРѕРґ') || s.includes('РџРѕРёСЃРє') || s.includes('Р›СЋР±РѕР№');
const hasGood = s.includes('Город вылета') || s.includes('Поиск тура');
console.log({ path, hasBad, hasGood, len: s.length });

if (hasBad && !hasGood) {
  const fixed = decodeUtf8Mojibake(s);
  // Sanity: fixed should contain readable Russian
  if (fixed.includes('Город') || fixed.includes('Поиск') || fixed.includes('Любой')) {
    fs.writeFileSync(path, fixed, 'utf8');
    console.log('Fixed and written');
  } else {
    console.error('Decode failed sanity check, sample:', fixed.slice(380, 460));
    process.exit(2);
  }
} else {
  console.log('No fix needed');
}
