// Browser QA: record the actual decoded buffers started by Web Audio, by source
// file hash (also works when Vite inlines a short MP3 as a data URL).
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
const directory=new URL('../node_modules/lino-ui/src/ds/sounds/',import.meta.url);
export const soundFingerprints=Object.fromEntries(readdirSync(directory).filter(f=>f.endsWith('.mp3')).map(file=>[
  createHash('sha256').update(readFileSync(new URL(file,directory))).digest('hex'),file,
]));
export function installSoundProbe(fingerprints) {
  window.__soundPlays=[];window.__decodedSounds=[];
  const bytesToFile=new WeakMap(),buffersToFile=new WeakMap();
  const originalFetch=window.fetch;
  window.fetch=async function(...args) {
    const response=await originalFetch.apply(this,args);
    const url=String(args[0]?.url??args[0]);
    if(url.includes('.mp3')||url.startsWith('data:audio/')) {
      const arrayBuffer=response.arrayBuffer.bind(response);
      response.arrayBuffer=async()=>{
        const data=await arrayBuffer();
        const digest=await crypto.subtle.digest('SHA-256',data);
        const hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
        bytesToFile.set(data,fingerprints[hash]??'unknown-audio');return data;
      };
    }
    return response;
  };
  const decode=AudioContext.prototype.decodeAudioData;
  AudioContext.prototype.decodeAudioData=function(data,success,error) {
    const file=bytesToFile.get(data);
    return decode.call(this,data).then(buffer=>{
      buffersToFile.set(buffer,file);window.__decodedSounds.push(file);success?.(buffer);return buffer;
    },e=>{error?.(e);throw e;});
  };
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args) {
    window.__soundPlays.push(buffersToFile.get(this.buffer)??'unknown-audio');return start.apply(this,args);
  };
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function() {
    window.__soundPlays.push(decodeURIComponent(this.src.split('/').pop()));return play.call(this);
  };
}
