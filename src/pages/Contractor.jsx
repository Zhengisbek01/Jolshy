import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { DEFECTS, OPEN } from '../data/constants.js';
import { isOverdue, contractorStats, hoursFmt, D } from '../lib/engine.js';
import { f0, f1, pct, dt } from '../lib/format.js';
import { imageToDataUrl } from '../lib/files.js';
import { Page, Card, Btn, Pill, Table, Modal, Field, Note, Stats, Chips, Kpi, Grid, Empty } from '../ui.jsx';
import MapView from '../components/MapView.jsx';
import { DefectCard, StatusPill, Sla, SevPill, where } from './Shared.jsx';

export function Orders() {
  const { state, user, act, toast } = useStore();
  const [f, setF] = useState('open');
  const [view, setView] = useState(null);
  const [done, setDone] = useState(null);
  const t = Date.now();
  const mine = state.defects.filter((d) => d.contractor === user.org);
  const F = { open: (d) => OPEN.includes(d.status), overdue: (d) => isOverdue(d, t), returned: (d) => d.status === 'returned', fixed: (d) => d.status === 'fixed', closed: (d) => d.status === 'closed' && d.verifiedAt >= t - 30 * D };
  const list = mine.filter(F[f]).sort((a, b) => a.deadline - b.deadline);
  const startWork = (d) => { act('Начаты работы', d.id, where(state, d), (s) => { const x = s.defects.find((y) => y.id === d.id); x.status = 'in_work'; x.startedAt = Date.now(); }); toast('Статус: в работе'); };
  return (
    <Page title="Наряды" lead="Дефекты в вашей зоне со сроками устранения. Отметьте начало работ и сообщите об устранении с фото — инспектор проверит и примет.">
      <Chips value={f} onChange={setF} items={[['open', 'В работе', mine.filter(F.open).length], ['overdue', 'Просрочены', mine.filter(F.overdue).length], ['returned', 'Возвращены', mine.filter(F.returned).length], ['fixed', 'На приёмке', mine.filter(F.fixed).length], ['closed', 'Приняты за 30 дней', mine.filter(F.closed).length]]} />
      <Table keyOf={(d) => d.id} onRow={setView} empty="Нарядов в этом статусе нет" cols={[
        { h: 'Наряд', r: (d) => <><span className="mono">{d.id}</span><span className="sub">{d.t109 || ''}</span></> },
        { h: 'Дефект', r: (d) => <>{DEFECTS[d.type].name}<span className="sub"><SevPill s={d.sev} /></span></> },
        { h: 'Место', r: (d) => <span className="desc">{where(state, d)}</span> },
        { h: 'Срок', r: (d) => <Sla d={d} /> }, { h: 'Статус', r: (d) => <StatusPill s={d.status} /> },
        { h: '', r: (d) => <div className="btns" onClick={(e) => e.stopPropagation()}>
          {d.status === 'assigned' && <Btn small onClick={() => startWork(d)}>Начать</Btn>}
          {OPEN.includes(d.status) && <Btn small kind="pri" onClick={() => setDone(d)}>Устранено</Btn>}
        </div> },
      ]} rows={list} />
      {view && <Modal title="Наряд" onClose={() => setView(null)} wide><DefectCard s={state} d={state.defects.find((x) => x.id === view.id)}>{view.returnNote && view.status === 'returned' && <Note>Замечание инспектора: {view.returnNote}</Note>}</DefectCard></Modal>}
      {done && <DoneForm d={done} onClose={() => setDone(null)} />}
    </Page>
  );
}

function DoneForm({ d, onClose }) {
  const { state, act, toast } = useStore();
  const [photo, setPhoto] = useState(null);
  const [note, setNote] = useState('');
  const save = () => {
    act('Подрядчик сообщил об устранении', d.id, `${DEFECTS[d.type].name}, ${where(state, d)}${photo ? ', с фото' : ''}`, (s) => {
      const x = s.defects.find((y) => y.id === d.id); const t = Date.now();
      Object.assign(x, { status: 'fixed', fixedAt: t, fixPhoto: photo, fixNote: note, startedAt: x.startedAt || t });
    });
    toast(Date.now() <= d.deadline ? 'Устранено в срок. Ждёт приёмки инспектором' : 'Устранено с опозданием. Ждёт приёмки инспектором');
    onClose();
  };
  return (
    <Modal title={`Устранено · ${d.id}`} onClose={onClose}>
      <p className="small" style={{ margin: 0 }}>{DEFECTS[d.type].name} · {where(state, d)}</p>
      <Field label="Фото после ремонта" hint="Инспектор сравнит его с фото дефекта"><input type="file" accept="image/*" capture="environment" onChange={async (e) => { const f = e.target.files[0]; if (f) setPhoto(await imageToDataUrl(f)); }} /></Field>
      {photo && <img src={photo} alt="Фото после ремонта" className="thumb" />}
      <Field label="Что сделано"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Вырубка и укладка горячей смеси, 1,2 м²" /></Field>
      <div className="btns"><Btn kind="pri" onClick={save}>Отправить на приёмку</Btn></div>
    </Modal>
  );
}

export function ZoneMap() {
  const { state, user } = useStore();
  const c = state.contractors.find((x) => x.id === user.org);
  const net = state.nets[c.net];
  const roads = net.roads.filter((r) => r.contractor === c.id);
  const [sel, setSel] = useState(null);
  const list = state.defects.filter((d) => d.contractor === c.id && (OPEN.includes(d.status) || d.status === 'fixed'));
  const d = state.defects.find((x) => x.id === sel);
  return (
    <Page title="Карта зоны" lead={`${c.name}: ${roads.length} ${c.net === 'city' ? 'улиц' : 'дорог'}, ${f0(roads.reduce((a, r) => a + r.len, 0))} км. Открытые наряды на карте.`}>
      <div className="split">
        <MapView net={net} highlight={roads.map((r) => r.id)} defects={list} selected={sel} onSelect={(x) => setSel(x.id)} height={560} />
        <Card>{d ? <DefectCard s={state} d={d} /> : <Empty title="Выберите наряд на карте" text={`${list.length} открытых нарядов`} />}</Card>
      </div>
    </Page>
  );
}

export function MyStats() {
  const { state, user } = useStore();
  const st = contractorStats(state).find((x) => x.c.id === user.org);
  return (
    <Page title="Показатели подрядчика" lead="Эти же цифры видит управление дорог в рейтинге подрядчиков. Период — 30 дней.">
      <Grid min={240}>
        <Kpi title="Устранено в срок" value={f1(st.onTime * 100)} unit="%" progress={st.onTime} target={0.95} ok={st.onTime >= 0.95} foot={`${st.dueN} нарядов со сроком в периоде`} right="цель ≥ 95%" />
        <Kpi title="Просрочено сейчас" value={st.overdue} status={false} foot={`открыто ${st.open}`} />
        <Kpi title="Возвраты инспектором" value={st.returns} status={false} foot="за 30 дней" />
        <Kpi title="Среднее время устранения" value={hoursFmt(st.fixH)} status={false} foot="медиана, от передачи наряда" />
      </Grid>
    </Page>
  );
}
