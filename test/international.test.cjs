const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const root=path.join(__dirname,'..');
const dict={};
for(const code of ['en','vi','zh-CN']) dict[code]=JSON.parse(fs.readFileSync(path.join(root,'src/ui/i18n',code+'.json'),'utf8'));
test('catalog keys align',()=>{const expected=Object.keys(dict.en).sort();for(const code of ['vi','zh-CN']) assert.deepEqual(Object.keys(dict[code]).sort(),expected);});
test('all translations are non-empty strings',()=>{for(const d of Object.values(dict)) for(const value of Object.values(d)) assert.ok(typeof value==='string' && value.trim());});
test('renderer loads all local i18n scripts',()=>{const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8'); for(const f of ['catalogs.js','translator.js','bridge.js']) assert.ok(html.includes('i18n/'+f));});
test('upstream MIT license remains',()=>assert.ok(fs.readFileSync(path.join(root,'LICENSE'),'utf8').includes('MIT')));
