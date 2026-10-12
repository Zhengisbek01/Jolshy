import { NETWORK_KM, TOWNS, STREETS_NS, STREETS_EW, CONTRACTORS, ORGS, USERS, DEFAULT_NORMS, CAMERA_TYPES, DK } from './constants.js';
import { cumulative, pointAt, toLatLon } from '../lib/geo.js';
import { hashPass, DEMO_PASSWORD } from '../lib/auth.js';

const H = 36e5, D = 864e5, MIN = 6e4;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const monthStart = (t) => { const d = new Date(t); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function generate(now = Date.now(), seed = 20261012) {
  const R = mulberry32(seed);
  const rnd = (a, b) => a + R() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const wpick = (pairs) => { let x = R() * pairs.reduce((s, p) => s + p[1], 0); for (const [k, w] of pairs) { x -= w; if (x <= 0) return k; } return pairs[0][0]; };
  const origin = { lat: 51.92, lon: 69.41 };

  /* ---------- oblast network ---------- */
  const towns = TOWNS.map((name, i) => { const a = (i / TOWNS.length) * Math.PI * 2 + rnd(-0.18, 0.18); const r = rnd(80, 190); return { name, x: Math.cos(a) * r, y: Math.sin(a) * r * 0.82 }; });
  const center = { name: 'Областной центр', x: 0, y: 0 };
  const line = (A, B, wig) => {
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), n = Math.max(6, Math.ceil(d / 4));
    const nx = -dy / d, ny = dx / d;
    let off = 0; const pts = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n; off = off * 0.82 + gauss() * wig;
      const tp = Math.sin(Math.PI * t);
      pts.push([A.x + dx * t + nx * off * tp, A.y + dy * t + ny * off * tp]);
    }
    return pts;
  };
  const zoneOf = (i) => (i <= 3 ? 'k1' : i <= 6 ? 'k2' : 'k3');
  const proto = towns.map((t, i) => ({ a: center, b: t, cat: 'main', name: `Областной центр — ${t.name}`, contractor: zoneOf(i) }));
  [[0, 1], [3, 4], [5, 6], [8, 9]].forEach(([i, j]) => proto.push({ a: towns[i], b: towns[j], cat: 'local', name: `${towns[i].name} — ${towns[j].name}`, contractor: zoneOf(i) }));
  const raw = proto.map((p) => line(p.a, p.b, p.cat === 'main' ? 2.4 : 1.8));
  const L = raw.reduce((s, pts) => s + cumulative(pts).at(-1), 0);
  const k = NETWORK_KM / L;
  const oRoads = proto.map((p, i) => {
    const pts = raw[i].map(([x, y]) => [Math.round(x * k * 1000) / 1000, Math.round(y * k * 1000) / 1000]);
    const cum = cumulative(pts);
    const code = `ОД-${String(i + 1).padStart(2, '0')}`;
    return { id: `o${i + 1}`, code, name: `${code} «${p.name}»`, short: code, cat: p.cat, pts, cum, len: cum.at(-1), contractor: p.contractor, net: 'oblast' };
  });
  towns.forEach((t) => { t.x *= k; t.y *= k; });
  const bounds = (roads, pad) => {
    const xs = roads.flatMap((r) => r.pts.map((p) => p[0])), ys = roads.flatMap((r) => r.pts.map((p) => p[1]));
    return { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad };
  };

  /* ---------- city network ---------- */
  const cRoads = [];
  const jit = () => rnd(-0.05, 0.05);
  STREETS_NS.forEach((name, i) => { const x = -6.05 + i * 1.1; const pts = Array.from({ length: 9 }, (_, j) => [x + jit(), -5 + j * 1.25]); cRoads.push({ name, pts }); });
  STREETS_EW.forEach((name, i) => { const y = -4.95 + i * 0.9; const pts = Array.from({ length: 11 }, (_, j) => [-6.6 + j * 1.32, y + jit()]); cRoads.push({ name, pts }); });
  cRoads.push({ name: 'пр. Абылай хана', pts: Array.from({ length: 11 }, (_, j) => [-6.2 + j * 1.24, 4.6 - j * 0.92]) });
  const cityRoads = cRoads.map((r, i) => { const cum = cumulative(r.pts); return { id: `c${i + 1}`, code: '', name: r.name, short: r.name.replace(/^(ул\.|пр\.) /, ''), cat: r.name.startsWith('пр.') ? 'main' : 'local', pts: r.pts, cum, len: cum.at(-1), contractor: 'k4', net: 'city' }; });

  const nets = {
    oblast: { id: 'oblast', name: 'Областные дороги', origin, roads: oRoads, towns: [center, ...towns], bounds: bounds(oRoads, 18), unit: 'км' },
    city: { id: 'city', name: 'Улицы областного центра', origin, roads: cityRoads, towns: [], bounds: bounds(cityRoads, 0.8), unit: 'км' },
  };
  const allRoads = [...oRoads, ...cityRoads];
  const roadById = new Map(allRoads.map((r) => [r.id, r]));

  /* ---------- vehicles with cameras ---------- */
  const vehicles = [];
  ['3', '7', '12', '18', '21', '25', '31', '40'].forEach((n) => {
    const route = []; while (route.length < 3) { const r = pick(cityRoads).id; if (!route.includes(r)) route.push(r); }
    vehicles.push({ id: `bus-${n}`, name: `Автобус № ${n}`, kind: 'bus', net: 'city', roads: route, since: now - ri(20, 70) * D });
  });
  [1, 2, 3, 4].forEach((n) => {
    const route = [oRoads[(n - 1) * 3 % 14].id, oRoads[(n * 3 + 1) % 14].id, oRoads[(n * 5 + 2) % 14].id];
    vehicles.push({ id: `deu-${n}`, name: `Машина ДЭУ-${n}`, kind: 'service', net: 'oblast', roads: [...new Set(route)], since: now - ri(15, 50) * D });
  });

  /* ---------- coverage bins ---------- */
  const cov = {}, cam = {};
  oRoads.forEach((r) => { cov[r.id] = Array(Math.ceil(r.len)).fill(0); });
  allRoads.forEach((r) => { cam[r.id] = Array(Math.ceil(r.len)).fill(0); });
  for (const v of vehicles) for (const rid of v.roads) {
    const bins = cam[rid];
    for (let b = 0; b < bins.length; b++) { if (v.kind === 'bus' || R() < 0.7) bins[b] = Math.max(bins[b], now - rnd(0.2, v.kind === 'bus' ? 2 : 6) * D); }
  }

  const ms = monthStart(now);
  const patrols = [];
  const users = USERS.map((u) => ({ ...u, active: true, passHash: hashPass(u.login, DEMO_PASSWORD), mustChange: false, failed: 0, lockedUntil: 0, twoFactor: u.role === 'admin' }));
  const inspOblast = users.filter((u) => u.role === 'inspector' && !u.zone.includes('k4'));
  for (let t = ms; t < startOfDay(now); t += D) {
    if (new Date(t).getDay() === 0) continue;
    for (const ins of inspOblast) {
      const roads = oRoads.filter((r) => ins.zone.includes(r.contractor));
      const r = roads.map((x) => [x, cov[x.id].filter((v) => v < ms).length]).sort((a, b) => b[1] - a[1])[ri(0, 1)][0];
      const bins = cov[r.id];
      const firstFree = Math.max(0, bins.findIndex((v) => v < ms));
      const from = Math.min(firstFree, Math.max(0, bins.length - 10));
      const len = rnd(18, 40), to = Math.min(r.len, from + len);
      const start = t + rnd(9, 10) * H, end = start + (to - from) / 38 * H;
      for (let b = Math.floor(from); b < Math.ceil(to); b++) bins[b] = end;
      patrols.push({ id: `p-${patrols.length + 1}`, inspector: ins.id, road: r.id, from, to, start, end, found: 0 });
    }
  }
  const monthLabel = (off) => { const d = new Date(ms); d.setMonth(d.getMonth() - off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const covHistory = [[3, 0.71], [2, 0.84], [1, 0.93]].map(([o, p]) => ({ month: monthLabel(o), pct: p }));

  /* ---------- defects, 60 days ---------- */
  const norms = JSON.parse(JSON.stringify(DEFAULT_NORMS));
  const defects = [];
  let seq109 = 52310;
  const inspOf = (contractor) => users.find((u) => u.role === 'inspector' && u.zone.includes(contractor));
  const make = (src, net, road, created, type) => {
    const r = roadById.get(road);
    const km = rnd(0.1, r.len - 0.1);
    const xy = pointAt(r, km);
    const sev = type === 'pothole' ? wpick([['high', 0.4], ['mid', 0.45], ['low', 0.15]]) : type === 'sign' ? wpick([['high', 0.35], ['mid', 0.45], ['low', 0.2]]) : wpick([['high', 0.2], ['mid', 0.5], ['low', 0.3]]);
    return { src, net, road, km: Math.round(km * 1000) / 1000, x: xy[0], y: xy[1], ll: toLatLon(nets[net], xy), type, sev, createdAt: created };
  };
  for (let day = 59; day >= 0; day--) {
    const d0 = startOfDay(now) - day * D;
    const weekday = new Date(d0).getDay() !== 0;
    const at = (h1, h2) => d0 + rnd(h1, h2) * H;
    const items = [];
    for (let n = ri(4, 6); n-- > 0;) items.push(['camera', 'city', at(6.5, 21)]);
    for (let n = ri(2, 4); n-- > 0;) items.push(['camera', 'oblast', at(8, 19)]);
    if (weekday) for (let n = ri(3, 5); n-- > 0;) items.push(['inspector', 'oblast', at(9, 18)]);
    if (weekday) for (let n = ri(0, 2); n-- > 0;) items.push(['inspector', 'city', at(9, 18)]);
    for (let n = ri(2, 4); n-- > 0;) items.push(['c109', 'city', at(8, 22.5)]);
    for (const [src, net, created] of items) {
      if (created > now - 2 * MIN) continue;
      let road, type, vehicle = null, conf = null, fp = false;
      if (src === 'camera') {
        const vs = vehicles.filter((v) => v.net === net && v.since < created);
        if (!vs.length) continue;
        const v = pick(vs); vehicle = v.id; road = pick(v.roads);
        type = wpick([['pothole', 0.6], ['marking', 0.25], ['sign', 0.15]]);
        fp = R() < 0.12;
        conf = fp ? rnd(0.52, 0.8) : Math.min(0.99, 0.62 + Math.abs(gauss()) * 0.16 + R() * 0.12);
      } else if (src === 'inspector') {
        road = pick(nets[net].roads).id;
        type = wpick(DK.map((k) => [k, k === 'pothole' ? 0.34 : k === 'crack' ? 0.16 : k === 'marking' ? 0.12 : 0.095]));
      } else {
        road = pick(cityRoads).id;
        type = wpick([['pothole', 0.7], ['sign', 0.12], ['marking', 0.1], ['edge', 0.08]]);
      }
      const d = make(src, net, road, created, type);
      d.vehicle = vehicle; d.conf = conf ? Math.round(conf * 100) / 100 : null; d.fp = fp;
      const r = roadById.get(road);
      if (src === 'inspector') d.inspector = inspOf(r.contractor)?.id;
      if (src === 'c109') {
        d.t109 = `109-${++seq109}`;
        d.addr = `${r.name}, ${ri(1, 180)}`;
        d.applicant = 'житель (через ЕКЦ 109)';
        const hasCoords = R() < 0.42;
        if (!hasCoords) {
          const tagged = now - created > 30 * D || R() < 0.06;
          if (tagged) { d.geoAt = created + rnd(1, 18) * H; d.geoBy = 'Айдана Жумабекова'; if (d.geoAt > now) d.geoAt = now - MIN; }
          else { d.hint = d.road; d.x = null; d.y = null; d.ll = null; d.road = null; d.km = null; d.status = 'nogeo'; }
        }
      }
      // lifecycle
      if (d.status === 'nogeo') { defects.push(d); continue; }
      if (src === 'camera') {
        if (now - created < 10 * H && (fp || d.conf < 0.9)) { d.status = 'detected'; defects.push(d); continue; }
        if (fp) {
          const dec = created + rnd(10, 140) * MIN;
          if (dec > now) d.status = 'detected'; else { d.status = 'rejected'; d.rejectedAt = dec; d.rejectedBy = pick(['Айдана Жумабекова', 'Арман Сейткали']); d.rejectReason = pick(['Тень или пятно на покрытии', 'Мусор на дороге', 'Свежая заплатка']); }
          defects.push(d); continue;
        }
        if (d.conf >= 0.9) { d.confirmedAt = created; d.confirmedBy = 'ИИ (автоподтверждение ≥ 0,90)'; }
        else { const c = created + rnd(8, 150) * MIN; if (c > now) { d.status = 'detected'; defects.push(d); continue; } d.confirmedAt = c; d.confirmedBy = pick(['Айдана Жумабекова', 'Арман Сейткали']); }
      } else { d.confirmedAt = d.geoAt || created; d.confirmedBy = src === 'inspector' ? 'инспектор' : d.geoAt ? d.geoBy : 'ЕКЦ 109 (координаты заявителя)'; }
      const tw = R() < 0.9 ? rnd(0.3, 4.5) : rnd(6, 40);
      d.assignedAt = Math.min(d.confirmedAt + tw * MIN, now);
      d.contractor = r.contractor;
      d.deadline = d.assignedAt + norms[type][d.sev] * H;
      if (d.net === 'city' && !d.t109) d.t109 = `109-${++seq109}`;
      const sla = norms[type][d.sev] * H;
      const dur = R() < 0.88 ? sla * rnd(0.15, 0.95) : sla * rnd(1.05, 1.9);
      const fixedAt = d.assignedAt + dur;
      const startedAt = d.assignedAt + Math.min(dur * 0.3, rnd(1, 6) * H);
      if (startedAt <= now) d.startedAt = startedAt;
      if (fixedAt > now) { d.status = d.startedAt ? 'in_work' : 'assigned'; defects.push(d); continue; }
      d.fixedAt = fixedAt;
      const ver = fixedAt + rnd(6, 60) * H;
      const insp = inspOf(r.contractor);
      if (ver > now) { d.status = 'fixed'; defects.push(d); continue; }
      if (R() < 0.06 && now - ver < 2 * D) { d.status = 'returned'; d.returns = 1; d.returnedAt = ver; d.returnNote = 'Заплатка просела, края не обрезаны'; d.returnedBy = insp?.name; defects.push(d); continue; }
      if (R() < 0.05) d.returns = 1;
      d.status = 'closed'; d.verifiedAt = ver; d.verifiedBy = insp?.name;
      defects.push(d);
    }
  }
  defects.sort((a, b) => a.createdAt - b.createdAt);
  let nextId = 10001;
  defects.forEach((d) => { d.id = `Д-${nextId++}`; });
  // patrol "found" counts
  for (const p of patrols) p.found = defects.filter((d) => d.src === 'inspector' && d.road === p.road && d.createdAt >= p.start && d.createdAt <= p.end + 2 * H).length;

  // camera-km weekly history (equipment rolled out gradually)
  const camNow = allRoads.reduce((s, r) => s + cam[r.id].reduce((a, v, i) => a + (v >= now - 7 * D ? Math.min(1, r.len - i) : 0), 0), 0);
  const camHistory = Array.from({ length: 8 }, (_, i) => ({ week: now - (8 - i) * 7 * D, km: Math.round(camNow * (0.22 + (i / 8) * 0.72) * (0.95 + R() * 0.08)) }));

  return {
    version: 1, generatedAt: now, seed,
    nets, contractors: CONTRACTORS.map((c) => ({ ...c })), vehicles,
    defects, nextId, seq109,
    cov, cam, patrols, covHistory, camHistory,
    norms, orgs: ORGS.map((o) => ({ ...o })), users,
    sim: null,
    audit: [{ id: 'a-0', at: new Date(now - 2 * H).toISOString(), user: 'система', role: 'system', action: 'Синхронизация', object: 'ЕКЦ 109', details: 'Обмен заявками работает' }],
  };
}
