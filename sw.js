// sw.js — แคชหน้าเว็บให้โหลดไวและเปิดได้แม้เน็ตหลุด
// ** ถ้าแก้ไฟล์ html แล้วอยากให้อัปเดต ให้เปลี่ยนเลข v ด้านล่าง (เช่น g-v2) **
const CACHE = 'g-v1';
const SHELL = [
  './',
  'index.html',
  'home.html',
  'manifest.webmanifest'
];

// ติดตั้ง: เก็บไฟล์หลักลงแคช
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(SHELL); })
      .then(function(){ return self.skipWaiting(); })
  );
});

// เปิดใช้งาน: ลบแคชเวอร์ชันเก่าทิ้ง
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if(k !== CACHE) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// ดึงไฟล์: มีในแคชแสดงทันที + อัปเดตพื้นหลัง (stale-while-revalidate)
self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;

  e.respondWith(
    caches.match(req).then(function(cached){
      var network = fetch(req).then(function(res){
        // เก็บเฉพาะไฟล์ในโดเมนเดียวกันที่โหลดสำเร็จ
        try{
          if(res && res.status === 200 && new URL(req.url).origin === self.location.origin){
            var copy = res.clone();
            caches.open(CACHE).then(function(c){ c.put(req, copy); });
          }
        }catch(err){}
        return res;
      }).catch(function(){ return cached; });

      return cached || network;
    })
  );
});
