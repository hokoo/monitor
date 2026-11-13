// Synthetic loopback server for the Windows widget smoke; no live adapters or credentials.
import {createServer} from '../server.mjs';
import {createMonitor, validateConfig} from '../core.mjs';
import {readDemo} from '../demo.mjs';
import http from 'node:http';

const port=Number(process.env.ITRON_AI_RESOURCE_MONITOR_WIDGET_PORT ?? 18765);
if (!Number.isInteger(port)||port<1024||port>65534) throw Error('Invalid fixture port');
let reads=0;
let refreshes=0;
const locale=process.env.MONITOR_WIDGET_LOCALE==='ru'?'ru':'en';
const config=validateConfig({locale,accounts:[{id:'demo',provider:'Demo provider',label:'Fictitious account',sources:[{id:'plan',type:'subscription',adapter:'demo'}]}]});
const adapters={demo:async(...args)=>{reads++;console.log(`synthetic_read=${reads}`);return readDemo(...args);}};
const monitor=createMonitor(config,adapters);
const server=createServer(config,{port,adapters,monitor:{...monitor,refresh(){refreshes++;monitor.refresh();}}});
await server.listen();
const countServer=http.createServer((req,res)=>{if(req.method!=='GET'||!['/reads','/refreshes'].includes(req.url)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end(String(req.url==='/reads'?reads:refreshes));});
await new Promise(resolve=>countServer.listen(port+1,'127.0.0.1',resolve));
console.log(`synthetic_url=http://127.0.0.1:${port}/`);
const stop=()=>{void Promise.all([server.close(),new Promise(resolve=>countServer.close(resolve))]).then(()=>{process.exitCode=0;});};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
