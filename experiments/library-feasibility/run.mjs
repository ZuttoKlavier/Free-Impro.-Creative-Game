import {createServer,build} from 'vite';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {Server} from 'socket.io';
import {io as client} from 'socket.io-client';
import {createServer as http} from 'node:http';
import {once} from 'node:events';
const root=new URL('.',import.meta.url).pathname;
const vite=await createServer({configFile:false,root,server:{host:'127.0.0.1',port:4199,strictPort:true}});await vite.listen();
const browser=await chromium.launch({channel:'chrome',headless:true});let results;
try {const page=await browser.newPage();await page.goto('http://127.0.0.1:4199');await page.waitForFunction(()=>!!window.runProbes);results=await page.evaluate(()=>window.runProbes());}finally{await browser.close();await vite.close();}
const server=http();const io=new Server(server);io.on('connection',s=>s.on('submit',(data,ack)=>ack({id:data.id,received:true})));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const socket=client(`http://127.0.0.1:${server.address().port}`,{transports:['websocket']});
try {await once(socket,'connect');const ack=await socket.timeout(2000).emitWithAck('submit',{id:'probe'});results.socket={ok:ack.received,transport:socket.io.engine.transport.name};}finally{socket.disconnect();await new Promise(r=>io.close(r));}
try {await build({configFile:false,root,logLevel:'warn',build:{outDir:'dist'}});results.build={ok:true};}catch(e){results.build={ok:false,error:String(e)};}
await writeFile(root+'results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
if(Object.values(results).some(x=>!x.ok))process.exitCode=1;
