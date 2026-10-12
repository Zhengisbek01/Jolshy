import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { DEFECTS, SOURCES, STATUS, OPEN, CAMERA_TYPES } from '../data/constants.js';
import { roadOf, assign, addDefect, contractorName, isOverdue, kpis, coverShare, D, H, MIN } from '../lib/engine.js';
import { nearest, toLatLon, pointAt, fmtKm } from '../lib/geo.js';
import { f0, f1, pct, dt, hash } from '../lib/format.js';
import { exportXlsx } from '../lib/files.js';
import { Page, Card, Btn, Pill, Table, Modal, Field, Note, Stats, Tag, Chips, Empty, Conf } from '../ui.jsx';
import MapView from '../components/MapView.jsx';
import Frame from '../components/Frame.jsx';
import { DefectCard, StatusPill, SrcTag, SevPill, Sla, NetSeg, where } from './Shared.jsx';

const REJECT = ['Тень или пятно на покрытии', 'Мусор на дороге', 'Свежая заплатка', 'Дефект уже в работе', 'Другое'];

export function useConfirm() {
  const { state, user, act, toast } = useStore();
  return (d) => {
    const t = Date.now();
    act('Подтверждена детекция ИИ', d.id, `${DEFECTS[d.type].name}, ${where(state, d)}`, (s) => {
      const x = s.defects.find((y) => y.id === d.id); if (!x || x.status !== 'detected') return false;
      x.confirmedAt = t; x.confirmedBy = user.name; assign(s, x, t + 20 * 1000);
    });
    const r = roadOf(state, d.road);
    toast(`Передан подрядчику ${contractorName(state, r.contractor)}${d.net === 'city' ? ', создана заявка в 109' : ''}`);
  };
}

export function MapPage() {
  const { state, act, toast } = useStore();
  const confirm = useConfirm();
  const [net, setNet] = useState('oblast');
  const [f, setF] = useState('open');
  const [sel, setSel] = useState(null);
  const [rej, setRej] = useState(null);
  const t = Date.now();
  const all = state.defects.filter((d) => d.net === net);
  const FILTERS = {
    open: (d) => OPEN.includes(d.status) || d.status === 'fixed' || d.status === 'detected',
    detected: (d) => d.status === 'detected',
    overdue: (d) => isOverdue(d, t),
    month: (d) => d.createdAt >= t - 30 * D && d.status !== 'rejected',
  };
  const list = all.filter(FILTERS[f]);
  const d = state.defects.find((x) => x.id === sel);
  return (
    <Page title="Карта дефектов" lead="Все дефекты с камер, от инспекторов и из 109 на одной карте. Нажмите точку, чтобы открыть карточку." actions={<NetSeg value={net} onChange={(v) => { setNet(v); setSel(null); }} />}>
      <Chips value={f} onChange={setF} items={[['open', 'В работе', all.filter(FILTERS.open).length], ['detected', 'ИИ: на проверке', all.filter(FILTERS.detected).length], ['overdue', 'Просрочены', all.filter(FILTERS.overdue).length], ['month', 'Все за 30 дней', all.filter(FILTERS.month).length]]} />
      <div className="split">
        <MapView net={state.nets[net]} defects={list} selected={sel} onSelect={(x) => setSel(x.id)} height={600} />
        <Card>
          {d ? (
            <DefectCard s={state} d={d}>
              {d.status === 'detected' && <div className="btns"><Btn kind="pri" onClick={() => confirm(d)}>Подтвердить и передать</Btn><Btn onClick={() => setRej(d)}>Ложное</Btn></div>}
            </DefectCard>
          ) : <Empty title="Выберите дефект на карте" text={`${list.length} дефектов в выборке. Колесо мыши — масштаб, перетаскивание — сдвиг.`} />}
        </Card>
      </div>
      {rej && <RejectModal d={rej} onClose={() => setRej(null)} />}
    </Page>
  );
}

function RejectModal({ d, onClose }) {
  const { user, act, toast } = useStore();
  const [reason, setReason] = useState(REJECT[0]);
  const save = () => {
    act('Ложное срабатывание ИИ', d.id, reason, (s) => { const x = s.defects.find((y) => y.id === d.id); x.status = 'rejected'; x.rejectedAt = Date.now(); x.rejectedBy = user.name; x.rejectReason = reason; });
    toast('Отклонено. Кадр ушёл в выборку для дообучения модели'); onClose();
  };
  return (
    <Modal title={`Ложное срабатывание · ${d.id}`} onClose={onClose}>
      <div className="radio-list">{REJECT.map((r) => <label key={r}><input type="radio" checked={reason === r} onChange={() => setReason(r)} /> {r}</label>)}</div>
      <div className="btns"><Btn kind="pri" onClick={save}>Отклонить</Btn></div>
    </Modal>
  );
}

export function AiQueue() {
  const { state } = useStore();
  const confirm = useConfirm();
  const [rej, setRej] = useState(null);
  const queue = state.defects.filter((d) => d.status === 'detected').sort((a, b) => b.conf - a.conf);
  const P = Date.now() - 30 * D;
  const checked = state.defects.filter((d) => d.src === 'camera' && (d.confirmedAt >= P || d.rejectedAt >= P));
  const auto = checked.filter((d) => (d.confirmedBy || '').startsWith('ИИ')).length;
  const rejN = checked.filter((d) => d.status === 'rejected').length;
  return (
    <Page title="Проверка детекций ИИ" lead="Модель находит ямы, стёртую разметку и повреждённые знаки на кадрах с камер автобусов и машин ДЭУ. Детекции с уверенностью от 0,90 подтверждаются автоматически, остальные — здесь.">
      <Card><Stats items={[
        { v: queue.length, l: 'ждут проверки' },
        { v: checked.length, l: 'детекций за 30 дней' },
        { v: pct(auto / (checked.length || 1)), l: 'подтверждено автоматически' },
        { v: pct(1 - rejN / (checked.length || 1)), l: 'точность модели (подтверждено)' },
      ]} /></Card>
      {queue.length === 0 ? <Empty title="Очередь пуста" text="Новые детекции появятся, когда камеры проедут по маршрутам. Запустите смену в разделе «Камеры и транспорт»." /> : queue.map((d) => (
        <Card key={d.id}>
          <div className="queue-card">
            <Frame d={d} roadName={roadOf(state, d.road).net === 'oblast' ? roadOf(state, d.road).code : ''} />
            <div className="form" style={{ gap: 8 }}>
              <div className="btns" style={{ justifyContent: 'space-between' }}><b>{DEFECTS[d.type].name}</b><Conf v={d.conf} /></div>
              <span className="small">{where(state, d)}</span>
              <span className="small muted">{state.vehicles.find((v) => v.id === d.vehicle)?.name} · {dt(new Date(d.createdAt).toISOString())}</span>
              <span className="small">Подрядчик по зоне: {contractorName(state, roadOf(state, d.road).contractor)}{d.net === 'city' ? ' · будет создана заявка в 109' : ''}</span>
              <div className="btns"><Btn kind="pri" onClick={() => confirm(d)}>Подтвердить и передать</Btn><Btn onClick={() => setRej(d)}>Ложное</Btn></div>
            </div>
          </div>
        </Card>
      ))}
      {rej && <RejectModal d={rej} onClose={() => setRej(null)} />}
    </Page>
  );
}

export function NoGeo() {
  const { state, user, act, toast } = useStore();
  const list = state.defects.filter((d) => d.status === 'nogeo').sort((a, b) => b.createdAt - a.createdAt);
  const [sel, setSel] = useState(list[0]?.id);
  const [pin, setPin] = useState(null);
  const d = list.find((x) => x.id === sel) || list[0];
  const k = kpis(state);
  const save = () => {
    const r = pin.road; const ll = toLatLon(state.nets.city, pin.pt);
    act('Геопривязка обращения', d.id, `${d.t109}: ${r.name}, ${f1(pin.km)} км`, (s) => {
      const x = s.defects.find((y) => y.id === d.id); const t = Date.now();
      Object.assign(x, { road: r.id, km: Math.round(pin.km * 1000) / 1000, x: pin.pt[0], y: pin.pt[1], ll, geoAt: t, geoBy: user.name, confirmedAt: t, confirmedBy: user.name });
      assign(s, x, t + 15 * 1000);
    });
    toast(`Привязано к карте и передано: ${contractorName(state, r.contractor)}`);
    setPin(null); const next = list.find((x) => x.id !== d.id); setSel(next?.id);
  };
  return (
    <Page title="Обращения без геопривязки" lead="Жители сообщили о дефекте в 109 только адресом. Улица из обращения подсвечена на карте: нажмите точное место, сохраните — дефект уйдёт подрядчику.">
      <Card><Stats items={[{ v: list.length, l: 'без координат' }, { v: pct(k.geo), l: 'дефектов с геопривязкой (цель ≥ 90%)', color: k.geo >= 0.9 ? 'var(--good)' : 'var(--warn)' }]} /></Card>
      {list.length === 0 ? <Empty title="Все обращения привязаны к карте" /> : (
        <div className="split" style={{ gridTemplateColumns: 'minmax(0, 340px) minmax(0, 1fr)' }}>
          <div className="tbl" style={{ maxHeight: 600, overflowY: 'auto' }}>
            <table><tbody>{list.map((x) => (
              <tr key={x.id} className={`click ${x.id === d.id ? 'sel' : ''}`} onClick={() => { setSel(x.id); setPin(null); }}>
                <td><b className="mono small">{x.t109}</b><span className="sub">{x.addr}</span><span className="sub">{DEFECTS[x.type].name} · {dt(new Date(x.createdAt).toISOString())}</span></td>
              </tr>
            ))}</tbody></table>
          </div>
          <div className="form">
            <MapView net={state.nets.city} defects={pin ? [{ id: 'pin', x: pin.pt[0], y: pin.pt[1], status: 'nogeo' }] : []} selected="pin" picking onPick={([x, y]) => setPin(nearest(state.nets.city.roads, x, y))} highlight={d.hint ? [d.hint] : []} focus={d.hint ? pointAt(roadOf(state, d.hint), roadOf(state, d.hint).len / 2) : null} hint="Нажмите место дефекта на карте" height={480} legend={false} />
            <Card>
              <dl className="kv"><dt>Обращение</dt><dd className="mono">{d.t109}</dd><dt>Адрес со слов</dt><dd>{d.addr}</dd><dt>Дефект</dt><dd>{DEFECTS[d.type].name} · <SevPill s={d.sev} /></dd>
                <dt>Точка</dt><dd>{pin ? `${pin.road.name}, ${f1(pin.km)} км от начала улицы` : <span className="muted">не выбрана</span>}</dd></dl>
              <div className="btns" style={{ marginTop: 10 }}><Btn kind="pri" disabled={!pin} onClick={save}>Сохранить и передать подрядчику</Btn></div>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}

export function Defects() {
  const { state } = useStore();
  const [f, setF] = useState('open');
  const [src, setSrc] = useState('all');
  const [q, setQ] = useState('');
  const [view, setView] = useState(null);
  const t = Date.now();
  const F = { open: (d) => OPEN.includes(d.status), overdue: (d) => isOverdue(d, t), fixed: (d) => d.status === 'fixed', closed: (d) => d.status === 'closed', all: () => true };
  const list = state.defects.filter((d) => F[f](d) && (src === 'all' || d.src === src) && (!q || `${d.id} ${d.t109 || ''} ${d.road ? roadOf(state, d.road).name : d.addr}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (f === 'open' || f === 'overdue' ? a.deadline - b.deadline : b.createdAt - a.createdAt));
  const exp = () => exportXlsx('jolshy_defects.xlsx', { 'Дефекты': list.map((d) => ({ 'ID': d.id, 'Дата': dt(new Date(d.createdAt).toISOString()), 'Источник': SOURCES[d.src].name, 'Тип': DEFECTS[d.type].name, 'Место': where(state, d), 'Широта': d.ll?.[0] ?? '', 'Долгота': d.ll?.[1] ?? '', 'Статус': STATUS[d.status].name, 'Подрядчик': d.contractor ? contractorName(state, d.contractor) : '', 'Срок': d.deadline ? dt(new Date(d.deadline).toISOString()) : '', '109': d.t109 || '' })) });
  return (
    <Page title="Реестр дефектов" lead="Все дефекты со сроками устранения. Просроченные видно сразу." actions={<Btn onClick={exp}>Выгрузить в Excel</Btn>}>
      <div className="btns" style={{ justifyContent: 'space-between' }}>
        <Chips value={f} onChange={setF} items={[['open', 'У подрядчиков', state.defects.filter(F.open).length], ['overdue', 'Просрочены', state.defects.filter(F.overdue).length], ['fixed', 'Ждут приёмки', state.defects.filter(F.fixed).length], ['closed', 'Приняты', state.defects.filter(F.closed).length], ['all', 'Все', state.defects.length]]} />
        <div className="btns"><select value={src} onChange={(e) => setSrc(e.target.value)} style={{ width: 'auto' }} aria-label="Источник"><option value="all">Все источники</option>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select><input placeholder="Поиск: ID, дорога, 109" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} /></div>
      </div>
      <Table keyOf={(d) => d.id} onRow={setView} cols={[
        { h: 'ID', r: (d) => <span className="mono">{d.id}</span> }, { h: 'Дефект', r: (d) => <>{DEFECTS[d.type].short}<span className="sub"><SrcTag s={d.src} /></span></> },
        { h: 'Место', r: (d) => <span className="desc">{where(state, d)}</span> }, { h: 'Подрядчик', r: (d) => (d.contractor ? <span className="small">{contractorName(state, d.contractor)}</span> : '—') },
        { h: 'Срок', r: (d) => <Sla d={d} /> }, { h: 'Статус', r: (d) => <StatusPill s={d.status} /> },
      ]} rows={list.slice(0, 200)} />
      {list.length > 200 && <p className="small muted">Показаны первые 200 из {list.length}. Полный список — в выгрузке.</p>}
      {view && <Modal title="Карточка дефекта" onClose={() => setView(null)} wide><DefectCard s={state} d={state.defects.find((x) => x.id === view.id)} /></Modal>}
    </Page>
  );
}

export function Tickets109() {
  const { state } = useStore();
  const st109 = (d) => (d.status === 'closed' ? ['ok', 'Выполнена'] : d.status === 'fixed' ? ['info', 'Выполнена, на проверке'] : OPEN.includes(d.status) ? ['warn', 'Принята в работу'] : d.status === 'nogeo' ? ['bad', 'Ожидает уточнения адреса'] : ['neutral', 'Отклонена']);
  const list = state.defects.filter((d) => d.t109).sort((a, b) => (b.assignedAt || b.createdAt) - (a.assignedAt || a.createdAt));
  const P = Date.now() - 30 * D;
  return (
    <Page title="Заявки ЕКЦ 109" lead="Подтверждённый дефект на улицах города автоматически создаёт заявку в 109 с координатами и ссылкой на карту. Статус в 109 обновляется вместе со статусом работ.">
      <Card><Stats items={[
        { v: list.filter((d) => d.src !== 'c109' && d.assignedAt >= P).length, l: 'создано автоматически за 30 дней' },
        { v: list.filter((d) => d.src === 'c109' && d.createdAt >= P).length, l: 'пришло от жителей' },
        { v: list.filter((d) => d.ll).length, l: 'с координатами' }, { v: 'работает', l: 'обмен с 109 (тест)' },
      ]} /></Card>
      <Table keyOf={(d) => d.id} cols={[
        { h: '№ 109', r: (d) => <span className="mono">{d.t109}</span> }, { h: 'Создана', r: (d) => <span className="small">{dt(new Date(d.src === 'c109' ? d.createdAt : d.assignedAt || d.createdAt).toISOString())}</span> },
        { h: 'Откуда', r: (d) => (d.src === 'c109' ? 'житель' : d.src === 'camera' ? 'видеофиксация' : 'инспектор') },
        { h: 'Место', r: (d) => <span className="desc">{where(state, d)}</span> }, { h: 'Дефект', r: (d) => DEFECTS[d.type].short },
        { h: 'Статус в 109', r: (d) => { const [c, l] = st109(d); return <Pill kind={c}>{l}</Pill>; } },
      ]} rows={list.slice(0, 150)} />
    </Page>
  );
}

export function Fleet() {
  const { state, act, toast } = useStore();
  const [net, setNet] = useState('city');
  const [veh, setVeh] = useState(state.vehicles.find((v) => v.net === 'city').id);
  const [run, setRun] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  const t = Date.now();
  const vehicles = state.vehicles.filter((v) => v.net === net);
  const cov7 = coverShare(state, state.cam, state.nets[net].roads, t - 7 * D);
  const vStats = (v) => ({ km: v.roads.reduce((a, rid) => { const r = roadOf(state, rid); return a + state.cam[rid].reduce((s2, ts, i) => s2 + (ts >= t - 7 * D ? Math.min(1, r.len - i) : 0), 0); }, 0), det: state.defects.filter((d) => d.vehicle === v.id && d.createdAt >= t - 30 * D).length });
  const start = () => {
    const v = state.vehicles.find((x) => x.id === veh);
    const plan = v.roads.flatMap((rid) => { const r = roadOf(state, rid); const step = r.net === 'city' ? 0.4 : 3; return Array.from({ length: Math.floor(r.len / step) }, (_, i) => ({ rid, km: i * step + step / 2 })); }).slice(0, 36);
    let i = 0, found = 0; const startAt = Date.now();
    setRun({ v: v.id, i: 0, found: 0, total: plan.length, pos: null });
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      if (i >= plan.length) {
        clearInterval(timer.current);
        act('Смена камеры завершена', v.name, `${plan.length} точек маршрута, детекций: ${found}`);
        setRun((r) => ({ ...r, done: true })); toast(`Смена завершена: ${found} новых детекций`);
        return;
      }
      const p = plan[i]; const r = roadOf(state, p.rid); const xy = pointAt(r, p.km);
      const h = hash(`${startAt}-${i}`);
      const detect = h < 0.3;
      act('Детекция', v.name, '', (s) => {
        const bins = s.cam[p.rid]; const b = Math.min(bins.length - 1, Math.floor(p.km)); bins[b] = Date.now();
        if (!detect) return undefined;
        const type = CAMERA_TYPES[Math.floor(hash(`${startAt}t${i}`) * 3)];
        const conf = Math.round((0.6 + hash(`${startAt}c${i}`) * 0.39) * 100) / 100;
        const now = Date.now();
        const d = { src: 'camera', net: r.net, road: r.id, km: Math.round(p.km * 1000) / 1000, x: xy[0], y: xy[1], ll: toLatLon(s.nets[r.net], xy), type, sev: conf > 0.85 ? 'high' : 'mid', createdAt: now, vehicle: v.id, conf, status: 'detected' };
        if (conf >= 0.9) { d.confirmedAt = now; d.confirmedBy = 'ИИ (автоподтверждение ≥ 0,90)'; assign(s, d, now + 5000); }
        addDefect(s, d);
        return undefined;
      }, true);
      if (detect) found++;
      i++;
      setRun({ v: v.id, i, found, total: plan.length, pos: xy, done: false });
    }, 650);
  };
  const v = state.vehicles.find((x) => x.id === veh);
  return (
    <Page title="Камеры и транспорт" lead="Камеры на автобусах и машинах ДЭУ снимают дорогу на ходу, модель ищет дефекты на кадрах. Зелёным — участки, проверенные камерами за 7 дней." actions={<NetSeg value={net} onChange={(x) => { setNet(x); setVeh(state.vehicles.find((y) => y.net === x).id); }} />}>
      <Card><Stats items={[{ v: `${f0(cov7.got)} км`, l: `под мониторингом за 7 дней (${pct(cov7.share)} сети)` }, { v: vehicles.length, l: 'единиц с камерами' }, { v: state.defects.filter((d) => d.src === 'camera' && d.net === net && d.createdAt >= t - 30 * D).length, l: 'детекций за 30 дней' }]} /></Card>
      <div className="split">
        <MapView net={state.nets[net]} coverage={state.cam} covSince={t - 7 * D} highlight={v ? v.roads : []} vehicles={run && run.pos && !run.done ? [{ id: run.v, x: run.pos[0], y: run.pos[1], label: v.name }] : []} defects={state.defects.filter((d) => d.status === 'detected' && d.net === net)} height={540} legend="проверено камерами за 7 дней" />
        <Card title="Демонстрация смены">
          <div className="form">
            <Field label="Транспорт"><select value={veh} onChange={(e) => setVeh(e.target.value)} disabled={run && !run.done}>{vehicles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <p className="small muted" style={{ margin: 0 }}>Маршрут подсвечен синим. Машина проедет его ускоренно: каждый кадр обновляет покрытие, найденные дефекты появятся в очереди проверки. Детекции с уверенностью от 0,90 сразу уходят подрядчику.</p>
            <div className="btns"><Btn kind="pri" onClick={start} disabled={run && !run.done}>{run && !run.done ? `Едет… ${run.i}/${run.total}` : 'Запустить смену'}</Btn></div>
            {run && <Stats items={[{ v: `${run.i}/${run.total}`, l: 'точек маршрута' }, { v: run.found, l: 'детекций' }]} />}
          </div>
        </Card>
      </div>
      <Table keyOf={(x) => x.id} cols={[
        { h: 'Транспорт', r: (x) => x.name }, { h: 'Маршрут', r: (x) => <span className="small">{x.roads.map((rid) => roadOf(state, rid).short).join(' · ')}</span> },
        { h: 'Км за 7 дней', num: true, r: (x) => f0(vStats(x).km) }, { h: 'Детекций за 30 дней', num: true, r: (x) => vStats(x).det },
        { h: 'Камера с', r: (x) => new Date(x.since).toLocaleDateString('ru-RU') },
      ]} rows={vehicles} />
    </Page>
  );
}
