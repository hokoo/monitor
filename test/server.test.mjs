import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createServer} from '../server.mjs';
import {validateConfig} from '../core.mjs';

test('loopback API projects secrets away and rejects foreign Host and Origin', async () => {
  const config=validateConfig({locale:'ru',accounts:[{id:'a',provider:'Demo',label:'Account',sources:[{id:'s',type:'api',adapter:'demo',authRef:'env:SECRET_TOKEN'}]}]});
  const app=createServer(config,{port:0});
  const address=await app.listen(), base=`http://127.0.0.1:${address.port}`;
  try {
    const state=await (await fetch(`${base}/api/state`)).text();
    assert.equal(state.includes('SECRET_TOKEN'),false);
    assert.equal(state.includes('authRef'),false);
    assert.equal(JSON.parse(state).locale,'ru');
    assert.equal((await (await fetch(base)).text()).includes('lang="ru"'),true);
    const foreignHostStatus=await new Promise((resolve,reject)=>http.get({hostname:'127.0.0.1',port:address.port,path:'/api/state',headers:{Host:'evil.test'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject));
    assert.equal(foreignHostStatus,403);
    assert.equal((await fetch(`${base}/api/state`,{headers:{Origin:'https://evil.test'}})).status,403);
    assert.equal((await fetch(`${base}/api/refresh`,{method:'POST',headers:{Origin:'https://evil.test'}})).status,403);
    assert.equal((await fetch(`${base}/api/refresh`,{method:'POST'})).status,403);
    assert.equal((await fetch(`${base}/api/refresh`,{method:'POST',headers:{Origin:base}})).status,200);
    assert.equal((await fetch(`${base}/api/state`)).headers.get('access-control-allow-origin'),null);
  } finally {await app.close();}
});
