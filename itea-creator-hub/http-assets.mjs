import {createHash} from 'node:crypto';
import {mountedHTML} from './app-mount.mjs';
import {gzipSync,createGzip} from 'node:zlib';
// Static assets are prepared once. Large JSON bodies stream through gzip without a response cache.
export function prepareAsset(value){value=mountedHTML(value);const raw=Buffer.isBuffer(value)?value:Buffer.from(value),compressed=raw.length>=1024?gzipSync(raw):null;return {raw,gzip:compressed&&compressed.length<raw.length?compressed:null,etag:createHash('sha256').update(raw).digest('hex')};}
export function acceptsGzip(value){const weights=new Map();for(const item of String(value||'').split(',')){const [name,...params]=item.trim().toLowerCase().split(';');if(!name)continue;const q=params.map(v=>v.trim()).find(v=>v.startsWith('q=')),weight=q===undefined?1:Number(q.slice(2));weights.set(name,Number.isFinite(weight)&&weight>=0&&weight<=1?weight:0);}return (weights.has('gzip')?weights.get('gzip'):weights.get('*')||0)>0;}
export function sendPrepared(req,res,asset,headers){const compressed=asset.gzip&&acceptsGzip(req.headers?.['accept-encoding']),body=compressed?asset.gzip:asset.raw,isScript=/javascript/i.test(headers['Content-Type']||''),etag='"'+asset.etag+(compressed?'-gzip':'-raw')+'"',scriptHeaders=isScript?{'Cache-Control':'private, max-age=0, must-revalidate',ETag:etag}:{};if(isScript&&String(req.headers?.['if-none-match']||'').split(',').map(v=>v.trim().replace(/^W\//,'')).includes(etag)){res.writeHead(304,{...headers,...scriptHeaders,Vary:'Accept-Encoding'});res.end();return;}res.writeHead(200,{...headers,...scriptHeaders,Vary:'Accept-Encoding','Content-Length':body.length,...(compressed?{'Content-Encoding':'gzip'}:{})});res.end(body);}
export function sendJSON(req,res,status,data){
 const body=Buffer.from(JSON.stringify(data)),compressed=body.length>=8192&&acceptsGzip(req?.headers?.['accept-encoding']);
 res.jsonMetrics={rawBytes:body.length,encodedBytes:compressed?0:body.length,gzip:!!compressed};
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Accept-Encoding'};
 if(!compressed){res.writeHead(status,{...headers,'Content-Length':body.length});res.end(body);return;}
 res.writeHead(status,{...headers,'Content-Encoding':'gzip'});
 const stream=createGzip();stream.on('data',chunk=>{res.jsonMetrics.encodedBytes+=chunk.length;});stream.on('error',()=>res.destroy());res.once('close',()=>{if(!res.writableFinished)stream.destroy();});stream.pipe(res);stream.end(body);
}
