var CACHE="hbnf-guest-v1-staging";
var APP=[
  "./hbnf-guest.html",
  "./hbnf-guest.css",
  "./hbnf-guest.js",
  "./hbnf-guest-manifest.webmanifest",
  "./hbnf-guest-icon-180.png",
  "./hbnf-guest-icon-192.png",
  "./hbnf-guest-icon-512.png"
];
self.addEventListener("install",function(event){
  event.waitUntil(caches.open(CACHE).then(function(cache){return cache.addAll(APP);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener("activate",function(event){
  event.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(key){if(key!==CACHE&&key.indexOf("hbnf-guest-")===0)return caches.delete(key);}));
  }).then(function(){return self.clients.claim();}));
});
self.addEventListener("fetch",function(event){
  if(event.request.method!=="GET")return;
  event.respondWith(fetch(event.request).then(function(response){
    var copy=response.clone();
    caches.open(CACHE).then(function(cache){cache.put(event.request,copy);});
    return response;
  }).catch(function(){
    return caches.match(event.request).then(function(hit){
      return hit||caches.match("./hbnf-guest.html");
    });
  }));
});