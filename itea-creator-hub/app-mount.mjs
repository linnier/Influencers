// Keep a mounted application inside its own URL and cookie namespace.
export function basePath(value=process.env.APP_BASE_PATH||''){
 if(value===''||value==='/')return '';
 const base=String(value).replace(/\/$/,'');
 if(!/^\/(?:[a-zA-Z0-9_-]+)(?:\/[a-zA-Z0-9_-]+)*$/.test(base))throw Error('APP_BASE_PATH must be a simple absolute path, for example /creators');
 return base;
}
export function mountedHTML(value,base=basePath()){
 if(!base)return value;
 const html=Buffer.isBuffer(value)?value.toString('utf8'):String(value);
 if(!/^\s*<!doctype html/i.test(html))return value;
 return html.replace(/\b(src|href|action)="\/(?!\/)/g,(_,attr)=>attr+'="'+base+'/').replace(/<script\b/i,'<script src="'+base+'/app-path.js"></script><script');
}
export function mountRequest(req,res,base){
 if(!base)return false;
 const raw=req.url||'/',q=raw.indexOf('?'),path=q<0?raw:raw.slice(0,q);
 if(path===base){res.writeHead(308,{Location:base+'/'+(q<0?'':raw.slice(q)),'Cache-Control':'no-store'});res.end();return true;}
 if(!path.startsWith(base+'/')){res.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Not found"}');return true;}
 req.url=raw.slice(base.length);
 const namespace='itea_mount_'+Buffer.from(base).toString('hex')+'_';
 req.headers.cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(namespace)).map(s=>'itea_'+s.slice(namespace.length)).join('; ');
 const local=value=>typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')?base+value:value;
 const cookie=value=>String(value).replace(/^itea_/,namespace).replace(/\bPath=(\/[^;]*)/gi,(_,path)=>'Path='+base+(path==='/'?'/':path));
 const header=(name,value)=>name.toLowerCase()==='location'?local(value):name.toLowerCase()==='set-cookie'?(Array.isArray(value)?value.map(cookie):cookie(value)):value;
 const set=res.setHeader,write=res.writeHead;
 res.setHeader=function(name,value){return set.call(this,name,header(name,value));};
 res.writeHead=function(status,...args){
  const i=typeof args[0]==='string'?1:0,headers=args[i];
  if(headers){if(Array.isArray(headers)){args[i]=headers.map((v,j)=>j%2?header(headers[j-1],v):v);}else args[i]=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k,header(k,v)]));}
  // writeHead internally calls setHeader on responses that already have headers.
  this.setHeader=set;
  try{return write.call(this,status,...args);}finally{this.setHeader=function(name,value){return set.call(this,name,header(name,value));};}
 };
 return false;
}
