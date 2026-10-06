import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { buildStudentDocument } from './ios-offline-build.js';
mkdirSync('ios/Generated', { recursive: true });
writeFileSync('ios/Generated/student.html', await buildStudentDocument());

const config = JSON.parse(readFileSync('data/https/config.json', 'utf8'));
const text = readFileSync('data/https/classroom-ca.crt', 'utf8');
const pem = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/.exec(text);
if (!pem) throw new Error('请先执行 npm run setup:https 准备课堂 CA 公钥。');
mkdirSync('ios/Generated/Assets.xcassets/AppIcon.appiconset', { recursive: true });
writeFileSync('ios/Generated/classroom-ca.der', Buffer.from(pem[1].replace(/\s/g, ''), 'base64'));
writeFileSync('ios/Generated/classroom.json', JSON.stringify({ url: `https://${config.preferredHost}:${config.httpsPort || 8443}/` }, null, 2));
const images = [];
// Render the existing music-note identity as native app-icon sizes, without external artwork.
for (const [size, scale, idiom] of [[20,2,'iphone'],[20,3,'iphone'],[29,2,'iphone'],[29,3,'iphone'],[40,2,'iphone'],[40,3,'iphone'],[60,2,'iphone'],[60,3,'iphone'],[1024,1,'ios-marketing']]) {
  const width = size * scale, png = new PNG({ width, height: width });
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const u = x / width * 512, v = y / width * 512;
    const circle = (u-256)**2 + (v-256)**2 < 174**2;
    const note = (Math.abs(u-218)<14 && v>174 && v<300) || (Math.abs(u-355)<14 && v>147 && v<276) || (u>218 && u<355 && Math.abs(v-(174-(u-218)*27/137))<14) || ((u-187)/43)**2+((v-304)/32)**2<1 || ((u-324)/43)**2+((v-277)/32)**2<1;
    const dot = (u-346)**2 + (v-358)**2 < 400;
    const color = dot ? [238,113,75] : circle && !note ? [229,237,221] : [44,105,91];
    png.data.set([...color,255], (y*width+x)*4);
  }
  const filename = `icon-${size}-${scale}.png`; writeFileSync(`ios/Generated/Assets.xcassets/AppIcon.appiconset/${filename}`, PNG.sync.write(png));
  images.push({ size: `${size}x${size}`, scale: `${scale}x`, idiom, filename });
}
writeFileSync('ios/Generated/Assets.xcassets/AppIcon.appiconset/Contents.json', JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2));
writeFileSync('ios/Generated/Assets.xcassets/Contents.json', JSON.stringify({ info: { author: 'xcode', version: 1 } }));
mkdirSync('ios/Generated/Assets.xcassets/LaunchLogo.imageset', { recursive: true });
const logos = [];
for (const scale of [1, 2, 3]) {
  const width = 104 * scale, png = new PNG({ width, height: width });
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    let shade = 0, opacity = 0;
    // Supersample the same music-note identity for smooth, neutral edges.
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const u = (x + (sx + .5) / 4) / width * 512, v = (y + (sy + .5) / 4) / width * 512;
      const dx = Math.max(32 - u, u - 480, 0), dy = Math.max(32 - v, v - 480, 0);
      if (dx * dx + dy * dy > 32 * 32) continue;
      const circle = (u - 256) ** 2 + (v - 256) ** 2 < 174 ** 2;
      const note = (Math.abs(u - 218) < 14 && v > 174 && v < 300) || (Math.abs(u - 355) < 14 && v > 147 && v < 276) || (u > 218 && u < 355 && Math.abs(v - (174 - (u - 218) * 27 / 137)) < 14) || ((u - 187) / 43) ** 2 + ((v - 304) / 32) ** 2 < 1 || ((u - 324) / 43) ** 2 + ((v - 277) / 32) ** 2 < 1;
      shade += (u - 346) ** 2 + (v - 358) ** 2 < 400 ? 160 : circle && !note ? 244 : 80; opacity++;
    }
    const c = opacity ? Math.round(shade / opacity) : 0;
    png.data.set([c, c, c, Math.round(opacity / 16 * 255)], (y * width + x) * 4);
  }
  const filename = `logo-${scale}.png`; writeFileSync(`ios/Generated/Assets.xcassets/LaunchLogo.imageset/${filename}`, PNG.sync.write(png));
  logos.push({ idiom: 'universal', scale: `${scale}x`, filename });
}
writeFileSync('ios/Generated/Assets.xcassets/LaunchLogo.imageset/Contents.json', JSON.stringify({ images: logos, info: { author: 'xcode', version: 1 } }));
mkdirSync('ios/Generated/Assets.xcassets/LaunchBackground.colorset', { recursive: true });
writeFileSync('ios/Generated/Assets.xcassets/LaunchBackground.colorset/Contents.json', JSON.stringify({ colors: [{ idiom: 'universal', color: { 'color-space': 'srgb', components: { red: '1.000', green: '1.000', blue: '1.000', alpha: '1.000' } } }], info: { author: 'xcode', version: 1 } }));
console.log('已准备 iPhone 离线学生页面、白灰启动 Logo、课堂公钥和默认地址；未包含教师页面或私钥。');
