import { OPEN, NETWORK_KM } from '../data/constants.js';
import { monthStart } from '../data/generate.js';

export const H = 36e5, D = 864e5, MIN = 6e4;

const idx = new WeakMap();
export function roadOf(s, id) {
  let m = idx.get(s.nets);
  if (!m) { m = new Map([...s.nets.oblast.roads, ...s.nets.city.roads].map((r) => [r.id, r])); idx.set(s.nets, m); }
  return m.get(id);
}
export const median = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
export const isOverdue = (d, t = Date.now()) => OPEN.includes(d.status) && d.deadline < t;
export const userName = (s, id) => s.users.find((u) => u.id === id)?.name || id || '—';
export const contractorName = (s, id) => s.contractors.find((c) => c.id === id)?.name || '—';

/* Mutating helpers, called inside act() on a draft state. */
export function assign(s, d, t) {
  const r = roadOf(s, d.road);
  d.contractor = r.contractor;
  d.assignedAt = t;
  d.deadline = t + s.norms[d.type][d.sev] * H;
  d.status = 'assigned';
  if (d.net === 'city' && !d.t109) { s.seq109 += 1; d.t109 = `109-${s.seq109}`; }
}
export function addDefect(s, d) {
  const id = `Д-${s.nextId++}`;
  s.defects.push({ ...d, id });
  return id;
}

/** Coverage share of bins touched since `since`, weighted by bin length. */
export function coverShare(s, store, roads, since) {
  let got = 0, total = 0;
  for (const r of roads) {
    const bins = store[r.id]; if (!bins) continue;
    for (let i = 0; i < bins.length; i++) { const w = Math.min(1, r.len - i); total += w; if (bins[i] >= since) got += w; }
  }
  return { got, total, share: total ? got / total : 0 };
}
export function runs(bins, since, len) {
  const out = []; let a = null;
  for (let i = 0; i <= bins.length; i++) {
    const on = i < bins.length && bins[i] >= since;
    if (on && a == null) a = i;
    if (!on && a != null) { out.push([a, Math.min(i, len)]); a = null; }
  }
  return out;
}

export function kpis(s, t = Date.now()) {
  const P = 30 * D;
  const live = s.defects.filter((d) => d.status !== 'rejected');
  const recent = live.filter((d) => d.createdAt >= t - P);
  const geo = recent.filter((d) => d.x != null).length / (recent.length || 1);
  const insp = recent.filter((d) => d.src === 'inspector' && d.assignedAt).map((d) => (d.assignedAt - d.createdAt) / MIN);
  const allTw = recent.filter((d) => d.assignedAt && d.confirmedAt).map((d) => (d.assignedAt - d.confirmedAt) / MIN);
  const due = live.filter((d) => d.deadline && d.deadline >= t - P && d.deadline <= t);
  const onTime = due.filter((d) => d.fixedAt && d.fixedAt <= d.deadline && d.status !== 'returned').length / (due.length || 1);
  const ms = monthStart(t);
  const dim = new Date(new Date(t).getFullYear(), new Date(t).getMonth() + 1, 0).getDate();
  const cov = coverShare(s, s.cov, s.nets.oblast.roads, ms);
  const plan = (new Date(t).getDate() - 1 + new Date(t).getHours() / 24) / dim;
  const camAll = coverShare(s, s.cam, [...s.nets.oblast.roads, ...s.nets.city.roads], t - 7 * D);
  const camFix = live.filter((d) => d.src === 'camera' && d.fixedAt && d.fixedAt >= t - P).map((d) => (d.fixedAt - d.createdAt) / H);
  const allFix = live.filter((d) => d.fixedAt && d.fixedAt >= t - P).map((d) => (d.fixedAt - d.createdAt) / H);
  return {
    geo, geoMissing: live.filter((d) => d.status === 'nogeo').length, recentN: recent.length,
    twInsp: median(insp), twInspShare: insp.filter((m) => m <= 5).length / (insp.length || 1), twAll: median(allTw),
    onTime, dueN: due.length,
    cov: cov.share, covKm: cov.got, plan, totalKm: NETWORK_KM,
    camKm: camAll.got, camShare: camAll.share,
    camFixH: median(camFix), allFixH: median(allFix),
    open: live.filter((d) => OPEN.includes(d.status)).length,
    overdue: live.filter((d) => isOverdue(d, t)).length,
    detected: s.defects.filter((d) => d.status === 'detected').length,
    toAccept: s.defects.filter((d) => d.status === 'fixed').length,
  };
}

export function contractorStats(s, t = Date.now()) {
  const P = 30 * D;
  return s.contractors.map((c) => {
    const mine = s.defects.filter((d) => d.contractor === c.id && d.status !== 'rejected');
    const due = mine.filter((d) => d.deadline >= t - P && d.deadline <= t);
    const ok = due.filter((d) => d.fixedAt && d.fixedAt <= d.deadline && d.status !== 'returned').length;
    const fixH = mine.filter((d) => d.fixedAt && d.fixedAt >= t - P).map((d) => (d.fixedAt - d.assignedAt) / H);
    return {
      c, onTime: ok / (due.length || 1), dueN: due.length,
      open: mine.filter((d) => OPEN.includes(d.status)).length,
      overdue: mine.filter((d) => isOverdue(d, t)).length,
      returns: mine.filter((d) => d.returns && d.fixedAt >= t - P).length,
      fixH: median(fixH), km: [...s.nets.oblast.roads, ...s.nets.city.roads].filter((r) => r.contractor === c.id).reduce((a, r) => a + r.len, 0),
    };
  });
}

export function dailyBySource(s, days = 30, t = Date.now()) {
  const d0 = new Date(t); d0.setHours(0, 0, 0, 0);
  const start = d0.getTime() - (days - 1) * D;
  const out = Array.from({ length: days }, (_, i) => ({ day: start + i * D, camera: 0, inspector: 0, c109: 0 }));
  for (const d of s.defects) { if (d.status === 'rejected' || d.createdAt < start) continue; const i = Math.floor((d.createdAt - start) / D); if (out[i]) out[i][d.src]++; }
  return out;
}

export function slaLabel(d, t = Date.now()) {
  if (!d.deadline) return null;
  if (d.fixedAt && !OPEN.includes(d.status)) return { text: d.fixedAt <= d.deadline ? 'в срок' : `с опозданием ${dur(d.fixedAt - d.deadline)}`, cls: d.fixedAt <= d.deadline ? 'ok' : 'bad' };
  const left = d.deadline - t;
  if (left < 0) return { text: `просрочен на ${dur(-left)}`, cls: 'bad' };
  return { text: `осталось ${dur(left)}`, cls: left < 6 * H ? 'warn' : 'neutral' };
}
export function dur(ms) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${Math.max(m, 0)} мин`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} ч${m % 60 ? ` ${m % 60} мин` : ''}`;
  return `${Math.floor(h / 24)} дн ${h % 24} ч`;
}
export const hoursFmt = (h) => (h == null ? '—' : h < 48 ? `${h.toFixed(1).replace('.', ',')} ч` : `${(h / 24).toFixed(1).replace('.', ',')} дн`);
