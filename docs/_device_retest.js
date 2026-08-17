const { execSync } = require('child_process');
const fs = require('fs');
const adb = process.env.ADB || 'C:\\Users\\Ильяс\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const out = 'D:\\mobile-app\\app\\docs\\device-test-aug12';
function sh(c){return execSync(c,{encoding:'utf8'});}
function sleep(ms){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);}
function dump(n){sh(`"${adb}" shell uiautomator dump /sdcard/th_ui.xml`);sh(`"${adb}" pull /sdcard/th_ui.xml "${out}\\${n}-ui.xml"`);return fs.readFileSync(`${out}\\${n}-ui.xml`,'utf8');}
function shot(n){sh(`"${adb}" shell screencap -p /sdcard/th.png`);sh(`"${adb}" pull /sdcard/th.png "${out}\\${n}.png"`);}
function center(b){const m=b.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);return [Math.floor((+m[1]+ +m[3])/2),Math.floor((+m[2]+ +m[4])/2)];}
function findTap(xml,text){for(const n of [...xml.matchAll(/<node [^>]*?>/g)].map(x=>x[0])){if(n.includes(`text="${text}"`)||(n.includes('content-desc="')&&n.includes(text))){const b=n.match(/bounds="(\[[^"]+)"/);if(b)return center(b[1]);}}return null;}
function texts(xml){return [...xml.matchAll(/text="([^"]+)"/g)].map(m=>m[1]).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);}
function tap(xy,l){if(!xy){console.log('MISS',l);return false;}console.log('TAP',l,xy.join(','));sh(`"${adb}" shell input tap ${xy[0]} ${xy[1]}`);return true;}

// Force stop + relaunch to pick OTA after publish (user may need reopen; we try)
sh(`"${adb}" shell am force-stop com.iliastravelhub.app`);
sleep(800);
sh(`"${adb}" shell monkey -p com.iliastravelhub.app -c android.intent.category.LAUNCHER 1`);
sleep(5000);
shot('11-relaunch');
let xml=dump('11-relaunch');
console.log('RELAUNCH:', texts(xml).slice(0,25).join(' | '));

// Navigate popular hotels via Главная then approximate banner CTA
tap(findTap(xml,'Главная')||[105,1408],'Главная');
sleep(1500);
xml=dump('home2');
// scroll a bit? banner CTA - try content-desc
if(!tap(findTap(xml,'Сначала отель — сразу туры'),'banner')){
  // mid-screen banner area on 720x1600
  tap([360,520],'banner-approx');
}
sleep(2500);
shot('12-hotels-after-fix');
xml=dump('12-hotels');
console.log('HOTELS:', texts(xml).slice(0,30).join(' | '));
tap(findTap(xml,'Туры')||[600,1200],'Туры');
sleep(4000);
// scroll down to load tours
sh(`"${adb}" shell input swipe 360 1200 360 500 400`);
sleep(3000);
shot('13-hotel-details-loaded');
xml=dump('13-hotel');
console.log('DETAILS:', texts(xml).slice(0,50).join(' | '));
console.log('done');
