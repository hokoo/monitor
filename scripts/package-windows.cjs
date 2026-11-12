// Build a portable Windows folder from the pinned Electron distribution.
const {cpSync, copyFileSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, writeFileSync} = require('node:fs');
const {createHash} = require('node:crypto');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const version = require('../package.json').devDependencies.electron;
if (version !== '45.3.1' || require('../package-lock.json').packages['node_modules/electron'].version !== version) throw Error('Electron pin/lock mismatch');
const dist = path.resolve(process.argv[2] || path.join(root, 'node_modules/electron/dist'));
if (readFileSync(path.join(dist, 'version'), 'utf8').trim() !== version) throw Error('Electron distribution version mismatch');
const executable=openSync(path.join(dist,'electron.exe'),'r');
try {
  const dos=Buffer.alloc(64);readSync(executable,dos,0,64,0);
  if (dos.toString('ascii',0,2)!=='MZ') throw Error('Electron runtime is not a Windows executable');
  const pe=Buffer.alloc(6);readSync(executable,pe,0,6,dos.readUInt32LE(0x3c));
  if (pe.toString('ascii',0,4)!=='PE\0\0' || pe.readUInt16LE(4)!==0x8664) throw Error('Electron runtime is not Windows x64');
} finally {closeSync(executable);}
const runtime = ['LICENSE','LICENSES.chromium.html','chrome_100_percent.pak','chrome_200_percent.pak',
  'd3dcompiler_47.dll','dxcompiler.dll','electron.exe','electron_wer.dll','ffmpeg.dll','icudtl.dat',
  'resources.pak','snapshot_blob.bin','v8_context_snapshot.bin','version','vk_swiftshader.dll',
  'vk_swiftshader_icd.json','vulkan-1.dll'];
const listed = readdirSync(dist, {withFileTypes:true});
for (const entry of listed) {
  if (entry.isSymbolicLink()) throw Error(`Unexpected runtime link: ${entry.name}`);
  if (entry.name === 'locales') {
    if (!entry.isDirectory()) throw Error('Invalid Electron locales');
    for (const locale of readdirSync(path.join(dist, 'locales'), {withFileTypes:true})) {
      if (!locale.isFile() || !/^[a-z]{2,3}(?:-(?:[A-Z]{2}|[0-9]{3}))?\.pak$/.test(locale.name)) throw Error(`Unexpected locale: ${locale.name}`);
    }
  } else if (entry.name === 'resources') {
    if (!entry.isDirectory() || readdirSync(path.join(dist, 'resources')).some(name => name !== 'default_app.asar')) throw Error('Unexpected Electron resources');
  } else if (!runtime.includes(entry.name) || !entry.isFile()) throw Error(`Unexpected runtime path: ${entry.name}`);
}
for (const name of runtime) if (!existsSync(path.join(dist, name))) throw Error(`Missing Electron runtime file: ${name}`);
const output = path.join(root, 'dist/resource-monitor-win32-x64');
const staging = `${output}.building`;
rmSync(staging, {recursive:true, force:true});
mkdirSync(path.join(staging, 'resources/app/desktop'), {recursive:true});
try {
  for (const name of runtime) copyFileSync(path.join(dist, name), path.join(staging, name === 'electron.exe' ? 'Resource Monitor.exe' : name === 'electron_wer.dll' ? 'Resource Monitor_wer.dll' : name));
  cpSync(path.join(dist, 'locales'), path.join(staging, 'locales'), {recursive:true});
  const app = path.join(staging, 'resources/app');
  const payload = ['desktop/main.cjs','desktop/position.cjs','desktop/offline.html','desktop/icon.png'];
  const hashes = {};
  for (const name of payload) {
    const source = path.join(root, name), target = path.join(app, name);
    if (!lstatSync(source).isFile()) throw Error(`Invalid app source: ${name}`);
    copyFileSync(source, target);
    hashes[name] = createHash('sha256').update(readFileSync(source)).digest('hex');
  }
  const manifest = {name:'resource-monitor-widget', version:require('../package.json').version, main:'desktop/main.cjs', private:true};
  writeFileSync(path.join(app, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(staging, 'artifact.json'), `${JSON.stringify({electron:version, app:manifest, sourceSha256:hashes}, null, 2)}\n`);
  rmSync(output, {recursive:true, force:true});
  renameSync(staging, output);
  console.log(output);
} catch (error) {rmSync(staging, {recursive:true, force:true}); throw error;}
