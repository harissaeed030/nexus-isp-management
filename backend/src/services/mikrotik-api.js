import net from "node:net";
import tls from "node:tls";
import { once } from "node:events";

function encodeLength(n){if(n<0x80)return Buffer.from([n]);if(n<0x4000)return Buffer.from([(n>>8)|0x80,n&255]);if(n<0x200000)return Buffer.from([(n>>16)|0xc0,(n>>8)&255,n&255]);if(n<0x10000000)return Buffer.from([(n>>24)|0xe0,(n>>16)&255,(n>>8)&255,n&255]);return Buffer.from([0xf0,(n>>24)&255,(n>>16)&255,(n>>8)&255,n&255]);}
function word(v){const b=Buffer.from(String(v));return Buffer.concat([encodeLength(b.length),b]);}
function sentence(words){return Buffer.concat([...words.map(word),Buffer.from([0])]);}
class RouterSocket {
 constructor(socket,timeout){this.socket=socket;this.timeout=timeout;this.buffer=Buffer.alloc(0);socket.setTimeout(timeout);}
 async readWord(){while(true){if(this.buffer.length){const a=this.buffer[0];let n=0,h=1;if(a<0x80)n=a;else if((a&0xc0)===0x80){if(this.buffer.length<2){await this.more();continue;}n=((a&0x3f)<<8)|this.buffer[1];h=2;}else if((a&0xe0)===0xc0){if(this.buffer.length<3){await this.more();continue;}n=((a&0x1f)<<16)|(this.buffer[1]<<8)|this.buffer[2];h=3;}else if((a&0xf0)===0xe0){if(this.buffer.length<4){await this.more();continue;}n=((a&15)*0x1000000)+(this.buffer[1]<<16)+(this.buffer[2]<<8)+this.buffer[3];h=4;}else{if(this.buffer.length<5){await this.more();continue;}n=this.buffer.readUInt32BE(1);h=5;}if(this.buffer.length>=h+n){const out=this.buffer.subarray(h,h+n);this.buffer=this.buffer.subarray(h+n);return out.toString();}}await this.more();}}
 async more(){const chunk=await new Promise((resolve,reject)=>{const onData=b=>{cleanup();resolve(b)},onErr=e=>{cleanup();reject(e)},onEnd=()=>{cleanup();reject(new Error("Router closed connection"))},cleanup=()=>{this.socket.off("data",onData);this.socket.off("error",onErr);this.socket.off("end",onEnd)};this.socket.once("data",onData);this.socket.once("error",onErr);this.socket.once("end",onEnd);});this.buffer=Buffer.concat([this.buffer,chunk]);}
 async readSentence(){const words=[];while(true){const w=await this.readWord();if(w==="")return words;words.push(w);}}
 async write(words){this.socket.write(sentence(words));}
 async command(words){await this.write(words);const rows=[];while(true){const s=await this.readSentence();if(s[0]==="!re"){const row={};for(const x of s.slice(1)){if(x.startsWith("=")){const i=x.indexOf("=",1);if(i>0)row[x.slice(1,i)]=x.slice(i+1);}}rows.push(row);}else if(s[0]==="!trap"||s[0]==="!fatal"){const msg=s.find(x=>x.startsWith("=message="))?.slice(9)||"RouterOS command failed";throw new Error(msg);}else if(s[0]==="!done")return rows;}}
 close(){this.socket.destroy();}
}
export class MikroTikApi {
 constructor({host,port=8729,username,password,timeout=8000,tlsOptions={}}){this.config={host,port,username,password,timeout,tlsOptions};}
 async connect(){const c=this.config,socket=c.port===8728?net.connect({host:c.host,port:c.port}):tls.connect({host:c.host,port:c.port,servername:c.host,...c.tlsOptions});await Promise.race([once(socket,"connect"),once(socket,"secureConnect"),new Promise((_,r)=>setTimeout(()=>r(new Error("Router connection timed out")),c.timeout))]);this.client=new RouterSocket(socket,c.timeout);try{await this.client.command(["/login", "="+ "name="+c.username, "="+ "password="+c.password]);return this;}catch(e){this.client.close();throw e;}}
 async command(path,params={}){if(!this.client)throw new Error("Router is not connected");const words=[path,...Object.entries(params).map(([k,v])=>"="+k+"="+String(v))];return this.client.command(words);}
 async test(){await this.connect();try{const rows=await this.command("/system/resource/print");return {identity:(await this.command("/system/identity/print"))[0]?.name||"MikroTik",version:rows[0]?.version||"unknown",board:rows[0]?.board_name||"unknown"};}finally{this.close();}}
 close(){this.client?.close();this.client=null;}
}
export function createMikroTikAdapter(config){return new MikroTikApi(config);}
export const safeRouterError=e=>{const message=String(e?.message||"Router operation failed");return message.replace(/(password|passphrase|secret|token)=[^\s]+/gi,"$1=[REDACTED]").slice(0,240);};
