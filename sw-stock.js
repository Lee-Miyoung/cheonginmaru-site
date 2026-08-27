// ===== 청인마루 재고관리(stock.html) 전용 서비스워커 =====
// 이 파일은 stock.html에서만 등록되고 적용 범위(scope)도 stock.html로 한정되어 있어서
// 마루견적서(index.html)나 파트너가격(price.html)에는 전혀 영향을 주지 않습니다.

const CACHE_NAME = 'cm-stock-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting(); // 새 버전 있으면 바로 활성화
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 네트워크가 되면 항상 최신 파일을 가져오고(=구글시트/코드 수정사항 즉시 반영),
// 네트워크가 안 되면 그때만 마지막으로 저장해둔 버전을 대신 보여줌
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return; // 저장(POST 등)은 그대로 통과, 오프라인 대기열은 앱 코드가 처리

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/stock.html');
          }
          return new Response('', { status: 503 });
        })
      )
  );
});
