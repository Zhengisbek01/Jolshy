import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { DEFECTS, SEV, DK } from '../data/constants.js';
import { roadOf, assign, addDefect, contractorName, coverShare, D, H } from '../lib/engine.js';
import { monthStart } from '../data/generate.js';
import { pointAt, toLatLon, fmtKm } from '../lib/geo.js';
import { f0, f1, pct, dt, uid } from '../lib/format.js';
import { imageToDataUrl } from '../lib/files.js';
import { Page, Card, Btn, Pill, Table, Modal, Field, Note, Stats, Empty, Chips } from '../ui.jsx';
import MapView from '../components/MapView.jsx';
import { DefectCard, where } from './Shared.jsx';

function useZone() {
  const { state, user } = useStore();
  const net = user.zone.includes('k4') ? 'city' : 'oblast';
  const roads = state.nets[net].roads.filter((r) => user.zone.includes(r.contractor));
  return { net, roads };
}

export function Patrol() {
  const { state, user, act, toast } = useStore();
  const { net, roads } = useZone();
  const ms = monthStart(Date.now());
  const uncovered = (r) => (state.cov[r.id] || []).filter((v) => v < ms).length || (state.cov[r.id] ? 0 : Math.ceil(r.len));
  const [rid, setRid] = useState([...roads].sort((a, b) => uncovered(b) - uncovered(a))[0].id);
  const [run, setRun] = useState(null);
  const [fix, setFix] = useState(false);
  const timer = useRef(null);
  const runRef = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  const road = roadOf(state, rid);
  const step = net === 'city' ? 0.12 : 1.4;

  const start = () => {
    const bins = state.cov[rid];
    const from = bins ? Math.max(0, bins.findIndex((v) => v < ms)) : 0;
    const r0 = { rid, from, km: from, startedAt: Date.now(), track: [pointAt(road, from)], found: 0 };
    runRef.current = r0; setRun({ ...r0 });
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      const r = runRef.current; if (!r) return;
      const km = Math.min(road.len, r.km + step);
      const prev = r.km;
      r.km = km; r.track = [...r.track, pointAt(road, km)];
      act('GPS', road.code, '', (s) => {
        if (!s.cov[rid]) s.cov[rid] = Array(Math.ceil(road.len)).fill(0);
        for (let b = Math.floor(prev); b < Math.ceil(km); b++) if (b < s.cov[rid].length) s.cov[rid][b] = Date.now();
      }, true);
      setRun({ ...r });
      if (km >= road.len) { clearInterval(timer.current); toast('Конец дороги. Завершите объезд.'); }
    }, 600);
  };
  const stop = () => {
    clearInterval(timer.current);
    const r = runRef.current; if (!r) return;
    act('Объезд завершён', road.name, `${fmtKm(r.from)} — ${fmtKm(r.km)}, ${f1(r.km - r.from)} км, дефектов: ${r.found}`, (s) => {
      s.patrols.push({ id: uid('p'), inspector: user.id, road: rid, from: r.from, to: r.km, start: r.startedAt, end: Date.now(), found: r.found, track: true });
    });
    runRef.current = null; setRun(null);
    toast('Объезд сохранён, покрытие сети обновлено');
  };
  const pos = run ? pointAt(road, run.km) : null;
  const cov = coverShare(state, state.cov, roads.filter((r) => state.cov[r.id]), ms);
  const zoneDefects = state.defects.filter((d) => d.net === net && d.road && roads.some((r) => r.id === d.road) && ['assigned', 'in_work', 'returned', 'fixed'].includes(d.status));
  return (
    <Page title="Объезд" lead="Выберите дорогу и начните объезд: GPS пишет трек, покрытие сети считается автоматически. Дефект фиксируется в одно касание — координаты и километр подставляются сами.">
      <Card><Stats items={[
        { v: pct(cov.share), l: `моей зоны объехано в этом месяце (${f0(cov.got)} км)` },
        { v: run ? f1(run.km - run.from) : '—', l: 'км в текущем объезде' },
        { v: run ? run.found : '—', l: 'дефектов зафиксировано' },
        { v: run ? 'пишется' : 'выключен', l: 'GPS-трек (демо)', color: run ? 'var(--good)' : undefined },
      ]} /></Card>
      <div className="split">
        <MapView net={state.nets[net]} coverage={state.cov} covSince={ms} highlight={[rid]} me={pos} track={run?.track} defects={zoneDefects} focus={pos && net === 'city' ? pos : null} height={560} legend="объехано в этом месяце" />
        <div className="form phone">
          <Card>
            <div className="form">
              <Field label="Дорога"><select value={rid} onChange={(e) => setRid(e.target.value)} disabled={!!run}>{roads.map((r) => <option key={r.id} value={r.id}>{r.name} · {f1(r.len)} км</option>)}</select></Field>
              {run ? <p className="small" style={{ margin: 0 }}>Вы на <b>{road.net === 'oblast' ? road.code : road.name}, {fmtKm(run.km)}</b></p> : <p className="small muted" style={{ margin: 0 }}>Объезд начнётся с первого необъеханного в этом месяце километра.</p>}
              {!run ? <Btn kind="pri" className="btn pri big-btn" onClick={start}>Начать объезд</Btn> : (
                <>
                  <button type="button" className="btn pri big-btn" onClick={() => setFix(true)}>Зафиксировать дефект</button>
                  <Btn onClick={stop}>Завершить объезд</Btn>
                </>
              )}
            </div>
          </Card>
          <Note>В пилоте GPS-трек имитируется: инспектор едет со скоростью около 140 км/ч в ускоренном режиме. В рабочей версии трек пишет телефон или GPS-трекер машины.</Note>
        </div>
      </div>
      {fix && run && <FixForm road={road} km={run.km} onClose={() => setFix(false)} onDone={() => { runRef.current.found += 1; setRun({ ...runRef.current }); setFix(false); }} />}
    </Page>
  );
}

function FixForm({ road, km, onClose, onDone }) {
  const { state, user, act, toast } = useStore();
  const [type, setType] = useState('pothole');
  const [sev, setSev] = useState('mid');
  const [photo, setPhoto] = useState(null);
  const [note, setNote] = useState('');
  const save = () => {
    const xy = pointAt(road, km); const now = Date.now();
    act('Дефект зафиксирован инспектором', road.name, `${DEFECTS[type].name}, ${fmtKm(km)}`, (s) => {
      const d = { src: 'inspector', net: road.net, road: road.id, km: Math.round(km * 1000) / 1000, x: xy[0], y: xy[1], ll: toLatLon(s.nets[road.net], xy), type, sev, createdAt: now, inspector: user.id, photo, note, confirmedAt: now, confirmedBy: 'инспектор' };
      assign(s, d, now + 40 * 1000);
      addDefect(s, d);
    });
    toast(`Передано подрядчику ${contractorName(state, road.contractor)} — срок ${state.norms[type][sev]} ч${road.net === 'city' ? ', создана заявка в 109' : ''}`);
    onDone();
  };
  return (
    <Modal title="Новый дефект" onClose={onClose}>
      <p className="small" style={{ margin: 0 }}>{road.name} · <b>{fmtKm(km)}</b> · координаты подставлены по GPS</p>
      <div className="chips">{DK.map((k) => <button key={k} type="button" className="chip" aria-pressed={type === k} onClick={() => setType(k)}>{DEFECTS[k].short}</button>)}</div>
      <div className="radio-list">{Object.entries(SEV).map(([k, v]) => <label key={k}><input type="radio" checked={sev === k} onChange={() => setSev(k)} /> {v.name} · устранить за {state.norms[type][k]} ч</label>)}</div>
      <Field label="Фото" hint="С телефона откроется камера"><input type="file" accept="image/*" capture="environment" onChange={async (e) => { const f = e.target.files[0]; if (f) setPhoto(await imageToDataUrl(f)); }} /></Field>
      {photo && <img src={photo} alt="Фото дефекта" className="thumb" />}
      <Field label="Комментарий"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: глубина около 8 см, правая полоса" /></Field>
      <div className="btns"><Btn kind="pri" onClick={save}>Сохранить и передать подрядчику</Btn></div>
    </Modal>
  );
}

export function Accept() {
  const { state, user, act, toast } = useStore();
  const [ret, setRet] = useState(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const list = state.defects.filter((d) => d.status === 'fixed' && user.zone.includes(d.contractor)).sort((a, b) => a.fixedAt - b.fixedAt);
  const accept = (d) => { act('Устранение принято', d.id, `${DEFECTS[d.type].name}, ${where(state, d)}`, (s) => { const x = s.defects.find((y) => y.id === d.id); x.status = 'closed'; x.verifiedAt = Date.now(); x.verifiedBy = user.name; }); toast('Принято'); };
  const doReturn = () => {
    if (note.trim().length < 5) { setErr('Опишите, что не так.'); return; }
    act('Возвращено подрядчику', ret.id, note, (s) => { const x = s.defects.find((y) => y.id === ret.id); x.status = 'returned'; x.returns = (x.returns || 0) + 1; x.returnedAt = Date.now(); x.returnNote = note; x.returnedBy = user.name; });
    setRet(null); setNote(''); toast('Возвращено на доработку');
  };
  return (
    <Page title="Приёмка работ" lead="Подрядчик сообщил об устранении. Сравните фото до и после, примите работу или верните на доработку.">
      {list.length === 0 ? <Empty title="Нечего принимать" text="Работы появятся здесь, когда подрядчик отметит дефект устранённым." /> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
          {list.map((d) => <Card key={d.id}><DefectCard s={state} d={d}><div className="btns"><Btn kind="pri" onClick={() => accept(d)}>Принять</Btn><Btn onClick={() => { setRet(d); setErr(''); }}>Вернуть</Btn></div></DefectCard></Card>)}
        </div>
      )}
      {ret && <Modal title={`Вернуть ${ret.id}`} onClose={() => setRet(null)}><Field label="Что исправить" error={err}><textarea value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} placeholder="Края заплатки не обрезаны, вода стоит" /></Field><div className="btns"><Btn kind="pri" onClick={doReturn}>Вернуть подрядчику</Btn></div></Modal>}
    </Page>
  );
}

export function Routes() {
  const { state, user } = useStore();
  const { roads } = useZone();
  const ms = monthStart(Date.now());
  const mine = state.patrols.filter((p) => p.inspector === user.id).sort((a, b) => b.start - a.start);
  return (
    <Page title="Мои объезды" lead="Каждый объезд с GPS-треком: какая дорога, какие километры, сколько дефектов найдено.">
      <Table keyOf={(r) => r.id} cols={[
        { h: 'Дорога', r: (r) => r.name }, { h: 'Длина', num: true, r: (r) => `${f1(r.len)} км` },
        { h: 'Объехано в месяце', num: true, r: (r) => { const c = coverShare(state, state.cov, [r], ms); return <Pill kind={c.share > 0.95 ? 'ok' : c.share > 0.4 ? 'warn' : 'bad'}>{pct(c.share)}</Pill>; } },
      ]} rows={roads} />
      <Table keyOf={(p) => p.id} empty="Объездов пока нет" cols={[
        { h: 'Дата', r: (p) => dt(new Date(p.start).toISOString()) }, { h: 'Дорога', r: (p) => roadOf(state, p.road).name },
        { h: 'Участок', r: (p) => `${fmtKm(p.from)} — ${fmtKm(p.to)}` }, { h: 'Км', num: true, r: (p) => f1(p.to - p.from) }, { h: 'Дефектов', num: true, r: (p) => p.found },
      ]} rows={mine} />
    </Page>
  );
}
