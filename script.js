const $ = id => document.getElementById(id);
const TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', ATTR = '© OpenStreetMap';
const PAGES = ['home', 'login', 'register', 'run', 'activity', 'profile'];

// ---------- Data aktivitas yang sedang ditampilkan (contoh, diganti hasil lari asli) ----------
let D = { title: 'Lari pagi', name: '@raya', date: '28 Oktober 2026', km: '1,02', time: '6:10', pace: '6:03',
  route: [[-6.8605,107.5900],[-6.8610,107.5912],[-6.8618,107.5920],[-6.8628,107.5918],[-6.8634,107.5906],[-6.8630,107.5894],[-6.8620,107.5888],[-6.8611,107.5893],[-6.8605,107.5900]] };

// ---------- Router sederhana berbasis hash ----------
function route() {
  const r = location.hash.replace('#/', '') || 'home', p = PAGES.includes(r) ? r : 'home';
  PAGES.forEach(x => $('page-' + x).classList.toggle('active', x === p));
  document.body.classList.toggle('runpage', p === 'run');
  window.scrollTo(0, 0);
  if (p === 'run') initRun();
  if (p === 'activity') showActivity();
}
addEventListener('hashchange', route);
document.querySelectorAll('form[data-go]').forEach(f => f.onsubmit = e => { e.preventDefault(); location.hash = f.dataset.go; });
document.querySelectorAll('.like[data-n]').forEach(b => b.onclick = () => {
  const on = b.classList.toggle('on'), n = +b.dataset.n + (on ? 1 : 0);
  b.textContent = (on ? 'Disukai · ' : 'Suka · ') + n;
});

// ---------- Pelacak lari ----------
const R = 6371000, rad = x => x * Math.PI / 180;
function hav(a, b) { // jarak dua titik GPS (meter), rumus Haversine
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const MAX_ACC = 30, MIN_STEP = 3, MAX_SPEED = 12; // meter, meter, m/s
const pad = n => String(n).padStart(2, '0');
const fmt = s => (s >= 3600 ? Math.floor(s / 3600) + ':' + pad(Math.floor(s % 3600 / 60)) : Math.floor(s / 60)) + ':' + pad(s % 60);
const fmtPace = (m, s) => { if (m < 50) return '-'; const p = Math.round(s / (m / 1000)); return Math.floor(p / 60) + ':' + pad(p % 60); };

let runMap = null, line, me = null, st = 'idle', pts = [], dist = 0, last = null, t0 = 0, acc = 0, segStart = 0, watch = null, lock = null, tick = null;
const elapsed = () => Math.floor((acc + (st === 'run' ? Date.now() - segStart : 0)) / 1000);

function render() {
  const s = elapsed();
  $('dist').textContent = (dist / 1000).toFixed(2);
  $('time').textContent = fmt(s);
  $('pace').textContent = fmtPace(dist, s);
}
function ui() {
  $('start').hidden = st === 'run';
  $('start').textContent = st === 'pause' ? 'Lanjut' : 'Mulai';
  $('pause').hidden = st !== 'run';
  $('finish').hidden = st === 'idle';
  $('title').hidden = st !== 'idle';
}
function onPos(p) {
  const c = p.coords;
  if (c.accuracy > MAX_ACC) { $('gps').textContent = 'Sinyal GPS lemah, tunggu sebentar…'; return; }
  $('gps').textContent = 'GPS siap';
  const q = { lat: c.latitude, lng: c.longitude, t: p.timestamp };
  me ? me.setLatLng([q.lat, q.lng]) : (me = L.circleMarker([q.lat, q.lng], { radius: 8, color: '#fff', fillColor: '#FFD84D', fillOpacity: 1 }).addTo(runMap));
  runMap.panTo([q.lat, q.lng]);
  if (st !== 'run') return;
  if (last) {
    const d = hav(last, q), dt = (q.t - last.t) / 1000;
    if (d < MIN_STEP || (dt > 0 && d / dt > MAX_SPEED)) return; // abaikan jitter dan lonjakan GPS
    dist += d;
  }
  pts.push(q); last = q; line.addLatLng([q.lat, q.lng]); render();
}
function onErr(e) {
  $('gps').textContent = e.code === 1 ? 'Izin lokasi ditolak. Aktifkan lokasi di pengaturan browser.' : 'Lokasi tidak tersedia.';
}
const watchOn = () => { if (watch === null) watch = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }); };
const watchOff = () => { if (watch !== null) navigator.geolocation.clearWatch(watch); watch = null; };
async function wake() { try { lock = await navigator.wakeLock.request('screen'); } catch (e) {} }

function initRun() {
  if (runMap) { setTimeout(() => runMap.invalidateSize(), 0); return; }
  runMap = L.map('runmap', { zoomControl: false }).setView([-6.86, 107.59], 16);
  L.tileLayer(TILE, { attribution: ATTR, maxZoom: 19 }).addTo(runMap);
  line = L.polyline([], { color: '#FF4F8B', weight: 6 }).addTo(runMap);
  if (!navigator.geolocation) $('gps').textContent = 'Browser ini tidak mendukung lokasi.'; else watchOn();
  ui();
}
$('start').onclick = () => {
  if (!navigator.geolocation) return;
  if (!t0) t0 = Date.now();
  st = 'run'; segStart = Date.now(); last = null; watchOn();
  wake(); clearInterval(tick); tick = setInterval(render, 1000); ui();
};
$('pause').onclick = () => { acc += Date.now() - segStart; st = 'pause'; last = null; ui(); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && st === 'run') wake(); });

$('finish').onclick = () => {
  if (st === 'run') acc += Date.now() - segStart;
  st = 'done'; watchOff(); clearInterval(tick); if (lock) lock.release();
  if (dist < 50) { alert('Jarak kurang dari 50 m, lari tidak disimpan.'); location.reload(); return; }
  const step = Math.ceil(pts.length / 400), secs = Math.round(acc / 1000), h = new Date(t0).getHours();
  D = {
    title: $('title').value.trim() || (h < 11 ? 'Lari pagi' : h < 15 ? 'Lari siang' : h < 18 ? 'Lari sore' : 'Lari malam'),
    name: '@kamu', date: new Date(t0).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
    km: (dist / 1000).toFixed(2).replace('.', ','), time: fmt(secs), pace: fmtPace(dist, secs),
    route: pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(p => [p.lat, p.lng])
  };
  st = 'idle'; pts = []; dist = 0; last = null; t0 = 0; acc = 0; line.setLatLngs([]); $('dist').textContent = '0.00'; $('time').textContent = '0:00'; $('pace').textContent = '-'; ui();
  location.hash = '#/activity';
};

// ---------- Detail aktivitas + poster ----------
let actMap = null, actLine = null;
function showActivity() {
  $('a-title').textContent = D.title;
  $('a-meta').textContent = 'oleh ' + D.name + ' · ' + D.date;
  $('a-km').textContent = D.km; $('a-time').textContent = D.time; $('a-pace').textContent = D.pace;
  if (!actMap) { actMap = L.map('actmap', { zoomControl: false }); L.tileLayer(TILE, { attribution: ATTR, maxZoom: 19 }).addTo(actMap); }
  if (actLine) actLine.remove();
  actLine = L.polyline(D.route, { color: '#FF4F8B', weight: 6 }).addTo(actMap);
  setTimeout(() => { actMap.invalidateSize(); actMap.fitBounds(actLine.getBounds(), { padding: [24, 24] }); }, 0);
  renderPreview();
}
let style = 'transparan', photoImg = null;
// Gambar 1080x1920 (rasio Story): jarak, pace, waktu, dan bentuk rute di tengah
async function drawPoster() {
  try { await Promise.all([document.fonts.load('800 100px "Bricolage Grotesque"'), document.fonts.load('600 40px "Figtree"')]); } catch (e) {}
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  if (style === 'gelap' || (style === 'foto' && !photoImg)) { x.fillStyle = '#1E1B4B'; x.fillRect(0, 0, W, H); }
  if (style === 'foto' && photoImg) { // foto dipotong menutupi seluruh gambar, lalu digelapkan sedikit
    const s = Math.max(W / photoImg.width, H / photoImg.height), w = photoImg.width * s, h = photoImg.height * s;
    x.drawImage(photoImg, (W - w) / 2, (H - h) / 2, w, h);
    x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(0, 0, W, H);
  }
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 14;
  const row = (label, val, y) => {
    x.font = '600 44px Figtree, sans-serif'; x.fillText(label, W / 2, y);
    x.font = '800 104px "Bricolage Grotesque", sans-serif'; x.fillText(val, W / 2, y + 105);
  };
  row('Jarak', D.km + ' km', 480); row('Pace', D.pace + ' /km', 700); row('Waktu', D.time, 920);

  const box = { x: 190, y: 1130, w: 700, h: 520 }, k = Math.cos(D.route[0][0] * Math.PI / 180);
  const P = D.route.map(([la, ln]) => [ln * k, -la]), xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const sc = Math.min(box.w / ((Math.max(...xs) - minX) || 1e-6), box.h / ((Math.max(...ys) - minY) || 1e-6));
  const ox = box.x + (box.w - (Math.max(...xs) - minX) * sc) / 2, oy = box.y + (box.h - (Math.max(...ys) - minY) * sc) / 2;
  const T = p => [ox + (p[0] - minX) * sc, oy + (p[1] - minY) * sc];
  x.strokeStyle = '#FF4F8B'; x.lineWidth = 14; x.lineJoin = x.lineCap = 'round'; x.beginPath();
  P.forEach((p, i) => { const [a, b] = T(p); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.stroke();
  [[P[0], '#FFD84D'], [P[P.length - 1], '#fff']].forEach(([p, col]) => { const [a, b] = T(p); x.fillStyle = col; x.beginPath(); x.arc(a, b, 18, 0, 7); x.fill(); });

  x.fillStyle = '#fff'; x.font = '800 52px "Bricolage Grotesque", sans-serif'; x.fillText('Pelari Kalcer', W / 2, 1790);
  x.font = '600 30px Figtree, sans-serif'; x.fillText(D.name + '  ·  ' + D.date, W / 2, 1845);
  return c;
}
async function renderPreview() {
  const c = await drawPoster(), p = $('preview'), x = p.getContext('2d');
  x.clearRect(0, 0, p.width, p.height); x.drawImage(c, 0, 0, p.width, p.height);
}
const poster = async () => { const c = await drawPoster(); return new Promise(r => c.toBlob(r, 'image/png')); };

document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
  style = b.dataset.style;
  document.querySelectorAll('.seg button').forEach(o => o.classList.toggle('on', o === b));
  $('photo-wrap').hidden = style !== 'foto';
  $('seg-tip').textContent = { transparan: 'PNG transparan: tempel di atas fotomu saat membuat Story.',
    foto: 'Pilih fotomu, hasilnya sudah menyatu dengan data lari.', gelap: 'Latar polos berwarna indigo.' }[style];
  renderPreview();
});
$('photo').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const im = new Image(); im.onload = () => { photoImg = im; renderPreview(); }; im.src = URL.createObjectURL(f);
};

const fname = () => 'pelari-kalcer-' + Date.now() + '.png';
function save(b) { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fname(); a.click(); }
$('dl').onclick = async () => save(await poster());
$('sh').onclick = async () => {
  const b = await poster(), f = new File([b], fname(), { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: D.title }); } catch (e) {} }
  else save(b); // laptop: unduh saja
};

route();
