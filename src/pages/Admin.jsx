import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { ROLES, DEFECTS, SEV, DK } from '../data/constants.js';
import { contractorName } from '../lib/engine.js';
import { f1 } from '../lib/format.js';
import { dt, uid } from '../lib/format.js';
import { hashPass, tempPassword } from '../lib/auth.js';
import { Page, Card, Btn, Pill, Table, Modal, Field, Note, Seg } from '../ui.jsx';

const ZONE = (o, s) => o.type === 'contractor' ? `Свои дороги: ${s.nets[s.contractors.find((c) => c.id === o.id).net].roads.filter((r) => r.contractor === o.id).length}` : o.type === 'cud' ? 'Вся сеть' : o.type === 'uad' ? 'Вся сеть, отчёты' : o.type === 'gov' ? 'Сводка и карта' : 'Платформа';
const ROLE_ORG = { dispatcher: ['cud'], inspector: ['cud'], contractor: ['contractor'], head: ['uad'], akimat: ['gov'], admin: ['platform'] };

export function Users() {
  const { state, user, act, toast } = useStore();
  const [tab, setTab] = useState('users');
  const [add, setAdd] = useState(false);
  const [form, setForm] = useState({ name: '', login: '', role: 'dispatcher', org: 'cud' });
  const [issued, setIssued] = useState(null);
  const issue = (u, temp, created) => setIssued({ name: u.name, login: u.login, temp, created });
  const resetPass = (u) => {
    const temp = tempPassword();
    act('Сброс пароля', u.name, 'Выдан временный пароль, смена при следующем входе', (d) => { const x = d.users.find((y) => y.id === u.id); x.passHash = hashPass(x.login, temp); x.mustChange = true; x.failed = 0; x.lockedUntil = 0; });
    issue(u, temp);
  };
  const unlock = (u) => { act('Снята блокировка входа', u.name, '', (d) => { const x = d.users.find((y) => y.id === u.id); x.failed = 0; x.lockedUntil = 0; }); toast('Блокировка входа снята'); };
  const toggle2fa = (u) => { act(u.twoFactor ? 'Отключён второй фактор' : 'Включён второй фактор', u.name, 'Код по SMS при входе', (d) => { const x = d.users.find((y) => y.id === u.id); x.twoFactor = !x.twoFactor; }); };
  const [err, setErr] = useState('');
  const orgsFor = (role) => state.orgs.filter((o) => ROLE_ORG[role].includes(o.type));
  const toggle = (u) => {
    if (u.id === user.id) { toast('Нельзя заблокировать собственную учётную запись', 'err'); return; }
    act(u.active ? 'Доступ отозван' : 'Доступ восстановлен', u.name, ROLES[u.role].name, (d) => { const x = d.users.find((y) => y.id === u.id); x.active = !x.active; });
    toast(u.active ? 'Учётная запись заблокирована, вход закрыт' : 'Доступ восстановлен');
  };
  const changeRole = (u, role) => {
    const org = orgsFor(role).some((o) => o.id === u.org) ? u.org : orgsFor(role)[0].id;
    act('Смена роли', u.name, `${ROLES[u.role].name} → ${ROLES[role].name}`, (d) => { const x = d.users.find((y) => y.id === u.id); x.role = role; x.org = org; if (role === 'inspector' && !x.zone) x.zone = ['k1']; });
    toast('Роль изменена, действует со следующего входа');
  };
  const create = () => {
    if (form.name.trim().split(/\s+/).length < 2) { setErr('Укажите имя и фамилию.'); return; }
    const login = form.login.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(login)) { setErr('Логин: 3–32 символа, латиница, цифры, точка, дефис.'); return; }
    if (state.users.some((u) => u.login.toLowerCase() === login)) { setErr('Такой логин уже занят.'); return; }
    const temp = tempPassword();
    act('Новый пользователь', form.name, `${login}: ${ROLES[form.role].name}, ${state.orgs.find((o) => o.id === form.org).name}`, (d) => { d.users.push({ id: uid('u'), login, name: form.name.trim(), role: form.role, org: form.org, zone: form.role === 'inspector' ? ['k1'] : undefined, active: true, passHash: hashPass(login, temp), mustChange: true, failed: 0, lockedUntil: 0, twoFactor: form.role === 'admin', invitedAt: new Date().toISOString() }); });
    setAdd(false); setForm({ name: '', login: '', role: 'dispatcher', org: 'cud' }); issue({ name: form.name.trim(), login }, temp, true);
  };
  return (
    <Page title="Организации и пользователи" lead="Каждый сотрудник видит только данные своей организации и зоны. Изменения ролей и доступа пишутся в журнал." actions={<Btn kind="pri" onClick={() => { setAdd(true); setErr(''); }}>Добавить пользователя</Btn>}>
      <Seg value={tab} onChange={setTab} items={[['users', 'Пользователи'], ['orgs', 'Организации']]} />
      {tab === 'users' ? (
        <Table keyOf={(u) => u.id} rowClass={(u) => (u.active ? '' : 'done')} cols={[
          { h: 'Сотрудник', r: (u) => <>{u.name}<span className="sub mono">{u.login}{u.id === user.id ? ' · это вы' : ''}</span></> },
          { h: 'Организация', r: (u) => state.orgs.find((o) => o.id === u.org)?.name },
          { h: 'Роль', r: (u) => <select aria-label={`Роль ${u.name}`} value={u.role} onChange={(e) => changeRole(u, e.target.value)} style={{ width: 'auto' }}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select> },
          { h: 'Статус', r: (u) => <>{!u.active ? <Pill kind="bad">заблокирован</Pill> : u.lockedUntil > Date.now() ? <Pill kind="warn">вход заблокирован</Pill> : u.mustChange ? <Pill kind="info">ждёт смены пароля</Pill> : <Pill kind="ok">активен</Pill>}<span className="sub">{u.lastLogin ? `вход ${dt(u.lastLogin)}` : 'ещё не входил'}</span></> },
          { h: '2FA', r: (u) => <label className="btns small"><input type="checkbox" checked={!!u.twoFactor} onChange={() => toggle2fa(u)} /> SMS</label> },
          { h: '', r: (u) => <div className="btns">
            <Btn small onClick={() => resetPass(u)}>Сбросить пароль</Btn>
            {u.lockedUntil > Date.now() && <Btn small onClick={() => unlock(u)}>Разблокировать</Btn>}
            <Btn small kind={u.active ? 'danger' : ''} onClick={() => toggle(u)}>{u.active ? 'Отозвать доступ' : 'Восстановить'}</Btn>
          </div> },
        ]} rows={state.users} />
      ) : (
        <Table keyOf={(o) => o.id} cols={[
          { h: 'Организация', r: (o) => o.name }, { h: 'Зона видимости', r: (o) => ZONE(o, state) },
          { h: 'Сотрудников', num: true, r: (o) => state.users.filter((u) => u.org === o.id && u.active).length },
        ]} rows={state.orgs} />
      )}
      <Note>Зоны инспекторов и подрядчиков настраиваются в разделе «Зоны обслуживания».</Note>
      {issued && (
        <Modal title={issued.created ? 'Пользователь создан' : 'Временный пароль выдан'} onClose={() => setIssued(null)}>
          <p className="small" style={{ margin: 0 }}>{issued.name}</p>
          <div className="card"><div className="row" style={{ gridTemplateColumns: '1fr 1fr' }}><div><span className="small muted">Логин</span><div className="mono">{issued.login}</div></div><div><span className="small muted">Временный пароль</span><div className="mono" style={{ fontWeight: 600 }}>{issued.temp}</div></div></div></div>
          <Note>Пароль показан один раз. Передайте его сотруднику лично; при первом входе система попросит задать постоянный пароль.</Note>
          <div className="btns"><Btn kind="pri" onClick={() => { navigator.clipboard?.writeText(`${issued.login} / ${issued.temp}`).then(() => toast('Скопировано'), () => {}); }}>Скопировать</Btn></div>
        </Modal>
      )}
      {add && (
        <Modal title="Новый пользователь" onClose={() => setAdd(false)}>
          <div className="form">
            <Field label="Имя и фамилия"><input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErr(''); }} placeholder="Айжан Мукашева" /></Field>
            <Field label="Логин" error={err} hint="Временный пароль выдаётся после создания"><input value={form.login} onChange={(e) => { setForm({ ...form, login: e.target.value }); setErr(''); }} placeholder="a.mukasheva" /></Field>
            <Field label="Роль"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, org: orgsFor(e.target.value)[0].id })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></Field>
            <Field label="Организация"><select value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })}>{orgsFor(form.role).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
            <div className="btns"><Btn kind="pri" onClick={create}>Создать</Btn></div>
          </div>
        </Modal>
      )}
    </Page>
  );
}


export function Norms() {
  const { state, act, toast } = useStore();
  const [n, setN] = useState(JSON.parse(JSON.stringify(state.norms)));
  const [err, setErr] = useState('');
  const save = () => {
    for (const k of DK) for (const v of Object.keys(SEV)) { const x = Number(n[k][v]); if (!x || x < 1 || x > 2000) { setErr(`${DEFECTS[k].name}: срок от 1 до 2000 ч.`); return; } }
    const changes = DK.flatMap((k) => Object.keys(SEV).filter((v) => Number(n[k][v]) !== state.norms[k][v]).map((v) => `${DEFECTS[k].short} / ${SEV[v].name}: ${state.norms[k][v]} → ${n[k][v]} ч`));
    if (!changes.length) { toast('Изменений нет'); return; }
    act('Изменены нормативы устранения', 'Справочник', changes.join('; '), (s) => { DK.forEach((k) => Object.keys(SEV).forEach((v) => { s.norms[k][v] = Number(n[k][v]); })); });
    toast('Нормативы сохранены. Действуют для новых нарядов');
  };
  return (
    <Page title="Нормативы устранения" lead="Срок устранения в часах по типу дефекта и степени опасности. Демо-значения — в пилоте их утверждает управление дорог по своим нормам и контрактам." actions={<Btn kind="pri" onClick={save}>Сохранить</Btn>}>
      {err && <span className="field-e">{err}</span>}
      <div className="tbl"><table><thead><tr><th>Дефект</th>{Object.values(SEV).map((v) => <th key={v.name} className="n">{v.name}, ч</th>)}</tr></thead><tbody>
        {DK.map((k) => <tr key={k}><td>{DEFECTS[k].name}</td>{Object.keys(SEV).map((v) => <td key={v} className="n"><input aria-label={`${DEFECTS[k].name} ${SEV[v].name}`} inputMode="numeric" value={n[k][v]} onChange={(e) => { setN({ ...n, [k]: { ...n[k], [v]: e.target.value.replace(/\D/g, '') } }); setErr(''); }} style={{ width: 90, textAlign: 'right' }} /></td>)}</tr>)}
      </tbody></table></div>
      <Note>Изменение не пересчитывает сроки уже выданных нарядов.</Note>
    </Page>
  );
}

export function Zones() {
  const { state, act, toast } = useStore();
  const [net, setNet] = useState('oblast');
  const roads = state.nets[net].roads;
  const cs = state.contractors.filter((c) => c.net === net);
  const setC = (r, cid) => { act('Изменена зона подрядчика', r.name, `${contractorName(state, r.contractor)} → ${contractorName(state, cid)}`, (s) => { s.nets[net].roads.find((x) => x.id === r.id).contractor = cid; }); toast('Зона изменена. Новые дефекты на этой дороге уйдут новому подрядчику'); };
  const inspectors = state.users.filter((u) => u.role === 'inspector');
  const setZone = (u, cid, on) => { act('Изменена зона инспектора', u.name, `${on ? '+' : '−'} ${contractorName(state, cid)}`, (s) => { const x = s.users.find((y) => y.id === u.id); x.zone = on ? [...new Set([...(x.zone || []), cid])] : (x.zone || []).filter((z) => z !== cid); }); };
  return (
    <Page title="Зоны обслуживания" lead="Какая дорога за каким подрядчиком закреплена и какие зоны проверяет инспектор. По зоне дефект передаётся подрядчику автоматически — поэтому передача в работу занимает минуты." actions={<Seg value={net} onChange={setNet} items={[['oblast', 'Областные дороги'], ['city', 'Улицы города']]} />}>
      <Table keyOf={(r) => r.id} cols={[
        { h: 'Дорога', r: (r) => r.name }, { h: 'Км', num: true, r: (r) => f1(r.len) },
        { h: 'Подрядчик', r: (r) => <select aria-label={`Подрядчик ${r.name}`} value={r.contractor} onChange={(e) => setC(r, e.target.value)} style={{ width: 'auto' }}>{cs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> },
      ]} rows={roads.slice(0, net === 'city' ? 25 : 14)} />
      <Card title="Зоны инспекторов">
        <Table keyOf={(u) => u.id} cols={[{ h: 'Инспектор', r: (u) => u.name }, ...state.contractors.map((c) => ({ h: c.name.replace(' (демо)', ''), r: (u) => <input type="checkbox" aria-label={`${u.name}: ${c.name}`} checked={(u.zone || []).includes(c.id)} onChange={(e) => setZone(u, c.id, e.target.checked)} /> }))]} rows={inspectors} />
        <Note>Инспектор с зоной городского подрядчика объезжает улицы, остальные — областные дороги.</Note>
      </Card>
    </Page>
  );
}
