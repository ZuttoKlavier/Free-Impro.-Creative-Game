import WaveSurfer from 'wavesurfer.js';
import Regions from 'wavesurfer.js/dist/plugins/regions.esm.js';
import * as Tone from 'tone';
import Cropper from 'cropperjs';
import Dexie from 'dexie';
import { SoundTouch, Stretch } from '@soundtouchjs/core';
window.runProbes = async () => {
 const results = {};
 const check = async (key, task) => {try {results[key]={ok:true,...await task()};}catch(e){results[key]={ok:false,error:String(e.stack||e)};}};
 await check('wavesurfer', async()=>{
 const regions=Regions.create();const wave=WaveSurfer.create({container:'#wave',plugins:[regions]});
 await wave.load('',[Float32Array.from({length:44100},(_,i)=>Math.sin(i*.06))],1);
 const region=regions.addRegion({start:.1,end:.8,maxLength:1,drag:true,resize:true});region.setOptions({start:.2,end:.9});
 const result={start:region.start,end:region.end,shadow:!!wave.getWrapper().getRootNode().host};wave.destroy();return result;
 });
 await check('tone',async()=>{
 let events=0;const buffer=await Tone.Offline(({transport})=>{transport.bpm.value=120;transport.swing=.25;transport.scheduleRepeat(time=>{events++;},'16n');transport.start(0);},1);
 return {events,duration:buffer.duration};
 });
 await check('cropper',async()=>{
 const canvas=document.createElement('canvas');canvas.width=200;canvas.height=200;const c=canvas.getContext('2d');c.fillStyle='red';c.fillRect(0,0,200,200);
 const image=new Image();image.src=canvas.toDataURL();await image.decode();document.querySelector('#crop').append(image);
 const cropper=new Cropper(image,{container:'#crop'});await cropper.getCropperImage().$ready();const selection=cropper.getCropperSelection();selection.$change(10,10,100,100);const out=await selection.$toCanvas({width:128,height:128});cropper.destroy();return {width:out.width,height:out.height};
 });
 await check('dexie',async()=>{
 const name='feasibility-'+crypto.randomUUID(); const original=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,2);r.onupgradeneeded=()=>{r.result.createObjectStore('sounds',{keyPath:'id'});r.result.createObjectStore('outbox',{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});original.close();
 const db=new Dexie(name);await db.open();await db.table('sounds').put({id:'probe',blob:new Blob(['audio']),rhythm:{steps:[true,false]}});const value=await db.table('sounds').get('probe');await db.delete();return {blob:await value.blob.text(),steps:value.rhythm.steps};
 });
 await check('soundtouch',async()=>{
 const rate=44100, st=new Stretch({sampleRate:rate,createBuffers:true});st.tempo=.5;
 const input=new Float32Array(rate*2);for(let i=0;i<rate;i++)input[2*i]=input[2*i+1]=Math.sin(2*Math.PI*440*i/rate);
 const start=performance.now();st.inputBuffer.putSamples(input);st.process();
 const frames=st.outputBuffer.frameCount,out=new Float32Array(frames*2);st.outputBuffer.extract(out,0,frames);
 let crossings=0;for(let i=1;i<frames;i++)if(out[(i-1)*2]<=0&&out[i*2]>0)crossings++;
 const hz=crossings/(frames/rate);if(frames<=rate||Math.abs(hz-440)>10)throw new Error('unexpected stretch '+frames+' / '+hz);
 return {inputSeconds:1,outputSeconds:frames/rate,estimatedHz:hz,processingMs:performance.now()-start,tailNeedsFlush:true};
 });
 return results;
};
