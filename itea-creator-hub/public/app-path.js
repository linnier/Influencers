(function(root){'use strict';
 const script=document.currentScript,base=script?new URL(script.src,location.href).pathname.replace(/\/app-path\.js$/,''):'';
 function url(path){return typeof path==='string'&&path.startsWith('/')&&!path.startsWith('//')&&!(path===base||path.startsWith(base+'/'))?base+path:path;}
 function pathname(path=location.pathname){return base&&path.startsWith(base+'/')?path.slice(base.length):path;}
 const nativeFetch=root.fetch.bind(root);
 root.AppPath={base,url,pathname,fetch:(input,options)=>nativeFetch(typeof input==='string'?url(input):input,options)};
})(window);
