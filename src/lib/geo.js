/* Network geometry: x — km east, y — km south of the origin. */
export function cumulative(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
}
export function pointAt(road, km) {
  const { pts, cum } = road;
  const k = Math.max(0, Math.min(km, cum[cum.length - 1]));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < k) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (k - cum[i - 1]) / seg;
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
}
export function subPolyline(road, a, b) {
  const out = [pointAt(road, a)];
  road.cum.forEach((c, i) => { if (c > a && c < b) out.push(road.pts[i]); });
  out.push(pointAt(road, b));
  return out;
}
export function nearest(roads, x, y) {
  let best = null;
  for (const r of roads) {
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      const px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py);
      if (!best || d < best.dist) best = { road: r, km: r.cum[i - 1] + Math.sqrt(L2) * t, dist: d, pt: [px, py] };
    }
  }
  return best;
}
export function toLatLon(net, [x, y]) {
  const lat = net.origin.lat - y / 110.574;
  const lon = net.origin.lon + x / (111.32 * Math.cos((net.origin.lat * Math.PI) / 180));
  return [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5];
}
export const fmtKm = (km) => {
  const k = Math.floor(km), m = Math.round((km - k) * 1000);
  return `км ${k}+${String(m === 1000 ? 999 : m).padStart(3, '0')}`;
};
export const fmtLL = (ll) => (ll ? `${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}` : '—');
