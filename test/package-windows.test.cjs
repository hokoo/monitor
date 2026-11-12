const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync} = require('node:fs');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {tmpdir} = require('node:os');
const path = require('node:path');

const root=path.resolve(__dirname,'..');
const folder=path.join(root,'dist/resource-monitor-win32-x64');
const app=path.join(folder,'resources/app');
const expected=['desktop/icon.png','desktop/main.cjs','desktop/offline.html','desktop/position.cjs','package.json'];
function files(dir,prefix='') {
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name),`${prefix}${entry.name}/`):[`${prefix}${entry.name}`]).sort();
}
test('portable artifact has only allowlisted app sources and matching digests', () => {
  assert.deepEqual(files(app),expected);
  const manifest=JSON.parse(readFileSync(path.join(folder,'artifact.json')));
  assert.equal(manifest.electron,'45.3.1');
  assert.equal(readFileSync(path.join(folder,'version'),'utf8').trim(),'45.3.1');
  assert.deepEqual(Object.keys(manifest.sourceSha256).sort(),expected.filter(name=>name!=='package.json'));
  for (const [name,digest] of Object.entries(manifest.sourceSha256)) {
    const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.equal(hash(path.join(app,name)),digest);
    assert.equal(hash(path.join(root,name)),digest);
  }
  assert.deepEqual(JSON.parse(readFileSync(path.join(app,'package.json'))),manifest.app);
  assert.ok(files(folder).includes('Resource Monitor.exe'));
  assert.ok(!files(folder).some(name=>/(?:^|\/)(?:config\.json|\.env|\.git|\.monitor-codex|test|profile)(?:\/|$)/i.test(name)));
});

test('packager rejects an extra private file in an Electron distribution', () => {
  const fake=mkdtempSync(path.join(tmpdir(),'monitor-w6-bad-runtime-'));
  try {
    writeFileSync(path.join(fake,'version'),'45.3.1');
    const pe=Buffer.alloc(128);pe.write('MZ');pe.writeUInt32LE(64,0x3c);pe.write('PE\0\0',64);pe.writeUInt16LE(0x8664,68);
    writeFileSync(path.join(fake,'electron.exe'),pe);
    writeFileSync(path.join(fake,'private.txt'),'must not copy');
    const result=spawnSync(process.execPath,[path.join(root,'scripts/package-windows.cjs'),fake],{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Unexpected runtime path: private\.txt/);
  } finally {rmSync(fake,{recursive:true,force:true});}
});
