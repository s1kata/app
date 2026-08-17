const fs = require('fs');
const { execSync } = require('child_process');

const adb =
  process.env.ADB ||
  'C:\\Users\\Ильяс\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const out = process.env.OUT || 'D:\\mobile-app\\app\\docs\\device-test-aug12';

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' });
}

function dump(name) {
  sh(`"${adb}" shell uiautomator dump /sdcard/th_ui.xml`);
  sh(`"${adb}" pull /sdcard/th_ui.xml "${out}\\${name}-ui.xml"`);
  return fs.readFileSync(`${out}\\${name}-ui.xml`, 'utf8');
}

function shot(name) {
  sh(`"${adb}" shell screencap -p /sdcard/th.png`);
  sh(`"${adb}" pull /sdcard/th.png "${out}\\${name}.png"`);
}

function center(bounds) {
  const m = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  return [Math.floor((+m[1] + +m[3]) / 2), Math.floor((+m[2] + +m[4]) / 2)];
}

function findTap(xml, text) {
  const nodes = [...xml.matchAll(/<node [^>]*?>/g)].map((x) => x[0]);
  for (const n of nodes) {
    if (n.includes(`text="${text}"`) || (n.includes('content-desc="') && n.includes(text))) {
      const b = n.match(/bounds="(\[[^"]+)"/);
      if (b) return center(b[1]);
    }
  }
  return null;
}

function texts(xml) {
  return [...xml.matchAll(/text="([^"]+)"/g)]
    .map((m) => m[1])
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}

function tap(xy, label) {
  if (!xy) {
    console.log('MISS', label);
    return false;
  }
  console.log('TAP', label, xy.join(','));
  sh(`"${adb}" shell input tap ${xy[0]} ${xy[1]}`);
  return true;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

fs.mkdirSync(out, { recursive: true });

let xml = dump('cur');
console.log('HOME TEXTS:', texts(xml).slice(0, 40).join(' | '));

const flow = [
  ['Поиск', '02-search'],
  ['Избранное', '03-favorites'],
  ['Бронирования', '04-bookings'],
  ['Профиль', '05-profile'],
];

for (const [tab, name] of flow) {
  if (!tap(findTap(xml, tab), tab)) {
    // fallback approximate tab positions for 1080-wide phones
    const approx = {
      Поиск: [324, 2200],
      Избранное: [540, 2200],
      Бронирования: [756, 2200],
      Профиль: [972, 2200],
      Главная: [108, 2200],
    };
    tap(approx[tab], tab + '-approx');
  }
  sleep(1800);
  shot(name);
  xml = dump(name);
  console.log(name, 'TEXTS:', texts(xml).slice(0, 35).join(' | '));
}

console.log('done');
