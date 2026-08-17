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

// Go Home
let xml = dump('flow0');
tap(findTap(xml, 'Главная') || [72, 1408], 'Главная');
sleep(1200);
xml = dump('flow-home');
shot('06-home-refresh');

// Hotels banner
if (!tap(findTap(xml, 'Выбрать отель'), 'Выбрать отель')) {
  tap(findTap(xml, 'Сначала отель — сразу туры'), 'banner');
}
sleep(2500);
shot('07-popular-hotels');
xml = dump('07-popular-hotels');
console.log('HOTELS:', texts(xml).slice(0, 40).join(' | '));

// Open first hotel if Туры button exists
if (tap(findTap(xml, 'Туры'), 'Туры on card')) {
  sleep(2500);
  shot('08-hotel-details');
  xml = dump('08-hotel-details');
  console.log('HOTEL DETAILS:', texts(xml).slice(0, 45).join(' | '));
  // back
  sh(`"${adb}" shell input keyevent 4`);
  sleep(1000);
}

// Back to home then search
sh(`"${adb}" shell input keyevent 4`);
sleep(800);
xml = dump('back');
tap(findTap(xml, 'Поиск') || [232, 1408], 'Поиск');
sleep(1200);
xml = dump('search2');
shot('09-search-again');

// Select country if possible
if (tap(findTap(xml, 'Куда') || findTap(xml, 'Выберите страну'), 'Куда')) {
  sleep(1200);
  xml = dump('country-modal');
  console.log('COUNTRY MODAL:', texts(xml).slice(0, 30).join(' | '));
  const pick =
    findTap(xml, 'Турция') ||
    findTap(xml, 'Египет') ||
    findTap(xml, 'ОАЭ') ||
    findTap(xml, 'Абхазия');
  if (tap(pick, 'country')) {
    sleep(1000);
  } else {
    sh(`"${adb}" shell input keyevent 4`);
    sleep(500);
  }
}

xml = dump('search3');
if (tap(findTap(xml, 'Найти туры'), 'Найти туры')) {
  sleep(3500);
  shot('10-search-result-or-alert');
  xml = dump('10-search-result-or-alert');
  console.log('AFTER SEARCH:', texts(xml).slice(0, 40).join(' | '));
  // dismiss alert if any
  if (texts(xml).some((t) => /Ошибка|error|обязательн/i.test(t))) {
    tap(findTap(xml, 'OK') || findTap(xml, 'ОК'), 'dismiss');
    sleep(500);
  }
}

console.log('flow done');
