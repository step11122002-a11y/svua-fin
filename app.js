// SVUA Fin — долги, платежи и зарплаты Степана и Юлии. Все данные хранятся только на этом телефоне.
"use strict";

const $ = s => document.querySelector(s);
const VERSION = 1;
const KEY = "svuafin.v1";
const PEOPLE = { stepan: "Степан", yulia: "Юлия" };
const DEBT_TYPES = { credit: "Кредит", card: "Кредитка", mfo: "МФО", installment: "Рассрочка", mortgage: "Ипотека", loan: "Займ", other: "Другое" };
const EXP_CATS = { rent: "Аренда", utilities: "Коммуналка", phone: "Связь и интернет", transport: "Транспорт", subs: "Подписки", food: "Продукты", other: "Другое" };
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

// ---------- Данные ----------
const blank = () => ({ debts: [], expenses: [], incomes: [], paid: {}, over: {}, exported: {}, remindHour: 9, remindBefore: true });
let D = load();
const UI = { tab: lsGet("tab", "summary"), who: lsGet("who", "all"), month: null };

function lsGet(k, d) { try { const v = localStorage.getItem("svuafin." + k); return v == null ? d : JSON.parse(v); } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem("svuafin." + k, JSON.stringify(v)); } catch {} }
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return Object.assign(blank(), JSON.parse(raw)); } catch {}
  return blank();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(D)); }
  catch { toast("Не удалось сохранить: память браузера переполнена. Сохраните резервную копию."); }
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------- Даты и деньги ----------
const pad = n => String(n).padStart(2, "0");
const ymOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const today0 = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const TODAY_YM = () => ymOf(new Date());
function addM(ym, n) { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return ymOf(d); }
function daysIn(ym) { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); }
function dateIn(ym, day) { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, Math.min(day, daysIn(ym))); }
const monthTitle = ym => { const [y, m] = ym.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
const monthShort = ym => MONTHS_SHORT[Number(ym.slice(5)) - 1];
const dayLabel = d => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
const sameDay = (a, b) => a.getTime() === b.getTime();
const rub = n => (Math.round(n) || 0).toLocaleString("ru-RU") + " ₽";
const rubSigned = n => (n > 0 ? "+" : n < 0 ? "−" : "") + rub(Math.abs(n));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const parseMoney = v => { const n = Number(String(v).replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : NaN; };

// ---------- Расписание платежей ----------
// Экземпляр платежа: { key, item, kind, ym, date, amount, paid, paidAmount }
function debtSchedule(d) {
  const out = [];
  if (d.freq === "once") {
    const key = d.id + "|" + d.start; const p = D.paid[key];
    out.push({ key, item: d, kind: "debt", ym: d.start, date: dateIn(d.start, d.day), amount: p ? p.amount : d.total, paid: !!p });
    return out;
  }
  let cum = 0, ym = d.start;
  for (let i = 0; i < 600 && cum < d.total - 0.5; i++, ym = addM(ym, 1)) {
    const key = d.id + "|" + ym; const p = D.paid[key];
    const planned = D.over[key] ?? d.payment;
    const amount = p ? p.amount : Math.min(planned, d.total - cum);
    if (!p && amount <= 0) break;
    cum += amount;
    out.push({ key, item: d, kind: "debt", ym, date: dateIn(ym, d.day), amount, paid: !!p });
  }
  return out;
}
function recurring(item, kind, fromYM, toYM) {
  const out = [];
  let ym = item.start && item.start > fromYM ? item.start : fromYM;
  for (; ym <= toYM; ym = addM(ym, 1)) {
    if (item.end && ym > item.end) break;
    const key = item.id + "|" + ym; const p = D.paid[key];
    const amount = p ? p.amount : (D.over[key] ?? item.amount);
    out.push({ key, item, kind, ym, date: dateIn(ym, item.day), amount, paid: !!p });
  }
  return out;
}
const mine = it => UI.who === "all" || it.person === UI.who;
const byPerson = (it, who) => who === "all" || it.person === who;

/** Все платежи (долги + расходы) и доходы в диапазоне месяцев. */
function events(fromYM, toYM, who = UI.who) {
  const ev = [];
  for (const d of D.debts) if (byPerson(d, who)) for (const x of debtSchedule(d)) if (x.ym >= fromYM && x.ym <= toYM) ev.push(x);
  for (const e of D.expenses) if (byPerson(e, who)) ev.push(...recurring(e, "expense", fromYM, toYM));
  for (const i of D.incomes) if (byPerson(i, who)) ev.push(...recurring(i, "income", fromYM, toYM));
  return ev.sort((a, b) => a.date - b.date || (a.kind === "income" ? -1 : 1));
}
const debtPaid = d => debtSchedule(d).filter(x => x.paid).reduce((s, x) => s + x.amount, 0);
const debtLeft = d => Math.max(0, d.total - debtPaid(d));
const debtNext = d => debtSchedule(d).find(x => !x.paid);
const debtEnd = d => { const s = debtSchedule(d); return s.length ? s[s.length - 1].ym : null; };

function monthStats(ym, who) {
  const ev = events(ym, ym, who);
  const s = { income: 0, debt: 0, expense: 0, debtLeftToPay: 0, paid: 0 };
  for (const x of ev) {
    if (x.kind === "income") s.income += x.amount;
    else { s[x.kind] += x.amount; if (x.paid) s.paid += x.amount; }
  }
  s.out = s.debt + s.expense;
  s.free = s.income - s.out;
  s.leftToPay = s.out - s.paid;
  return s;
}
function totals(who) {
  const ds = D.debts.filter(d => byPerson(d, who));
  const left = ds.reduce((s, d) => s + debtLeft(d), 0);
  const active = ds.filter(d => debtLeft(d) > 0.5);
  const end = active.map(debtEnd).filter(Boolean).sort().pop() || null;
  return { left, count: active.length, end };
}
function dueNow(who = "all") {
  const t = today0(); const from = addM(TODAY_YM(), -6);
  const ev = events(from, TODAY_YM(), who).filter(x => x.kind !== "income" && !x.paid && x.date <= t);
  return { today: ev.filter(x => sameDay(x.date, t)), late: ev.filter(x => x.date < t) };
}

// ---------- Отрисовка ----------
const TITLES = { summary: "Сводка", month: "Месяц", salary: "Зарплаты", list: "Список" };
function render() {
  $("#title").textContent = UI.tab === "summary" ? "SVUA Fin" : TITLES[UI.tab];
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === UI.tab));
  for (const t of Object.keys(TITLES)) $("#view-" + t).hidden = t !== UI.tab;
  $("#month-switch").hidden = !(UI.tab === "month" || UI.tab === "salary");
  $("#month-label").textContent = monthTitle(UI.month);
  const due = dueNow(); const n = due.today.length + due.late.length;
  $("#due-count").hidden = !n; $("#due-count").textContent = n;
  ({ summary: renderSummary, month: renderMonth, salary: renderSalary, list: renderList })[UI.tab]();
}

const whoSwitch = () => `<div class="who">${[["all", "Все"], ["stepan", "Степан"], ["yulia", "Юлия"]].map(([v, t]) =>
  `<button data-act="who" data-who="${v}" class="${UI.who === v ? "on" : ""}">${t}</button>`).join("")}</div>`;
const personChip = p => `<span class="chip ${p}">${PEOPLE[p] || ""}</span>`;
const icoText = x => x.kind === "income" ? "₽" : x.kind === "debt" ? (DEBT_TYPES[x.item.type] || "Д").slice(0, 2) : (EXP_CATS[x.item.cat] || "Р").slice(0, 2);

function itemRow(x, { showDate = true } = {}) {
  const t = today0();
  const st = x.kind === "income" ? "" : x.paid ? `<span class="chip ok">оплачено</span>` : x.date < t ? `<span class="chip late">просрочен</span>` : sameDay(x.date, t) ? `<span class="chip today">сегодня</span>` : "";
  const fl = x.item.floating && !x.paid ? `<span class="chip float">плавающий</span>` : "";
  const sub = [showDate ? dayLabel(x.date) : "", x.kind === "debt" ? DEBT_TYPES[x.item.type] : x.kind === "expense" ? EXP_CATS[x.item.cat] : "доход"].filter(Boolean).join(" · ");
  return `<button class="item ${x.paid ? "paid" : ""}" data-act="pay" data-key="${x.key}">
    <span class="ico ${x.kind}">${icoText(x)}</span>
    <span class="mid"><b>${esc(x.item.name)}</b><small>${sub} ${personChip(x.item.person)} ${st} ${fl}</small></span>
    <span class="amt num" style="color:${x.kind === "income" ? "var(--mint)" : ""}">${x.kind === "income" ? "+" : ""}${rub(x.amount)}</span></button>`;
}

function emptyStart() {
  return `<div class="card empty"><h3>Добавьте первый долг или зарплату</h3>
    <p>Нажмите «+» внизу. Начните с зарплат и долгов — приложение само построит график платежей и покажет, с какой зарплаты что платить.</p>
    <button class="btn primary" data-act="add">Добавить</button></div>`;
}

function renderSummary() {
  const box = $("#view-summary");
  const nothing = !D.debts.length && !D.expenses.length && !D.incomes.length;
  if (nothing) { box.innerHTML = emptyStart(); return; }
  const ym = TODAY_YM();
  const due = dueNow(UI.who);
  let html = whoSwitch();

  if (due.late.length || due.today.length) {
    const list = [...due.late, ...due.today];
    html += `<div class="alert ${due.late.length ? "over" : "today"}"><b>${due.late.length ? `Просрочено: ${due.late.length}` : "Сегодня платёж"}${due.today.length && due.late.length ? `, сегодня: ${due.today.length}` : ""}</b>
      <div class="list">${list.slice(0, 4).map(x => itemRow(x)).join("")}</div></div>`;
  }

  const T = totals(UI.who), M = monthStats(ym, UI.who);
  html += `<div class="card hero"><h2>Всего долгов${UI.who !== "all" ? " · " + PEOPLE[UI.who] : ""}</h2>
    <div class="big num">${rub(T.left)}</div>
    <div class="sub">${T.count ? `${T.count} ${plural(T.count, "активный долг", "активных долга", "активных долгов")} · последний платёж — ${T.end ? monthTitle(T.end) : "—"}` : "Активных долгов нет"}</div></div>`;

  html += `<div class="card"><h2>${monthTitle(ym)}</h2><div class="kpis">
    <div class="kpi inc"><b class="num">${rub(M.income)}</b><span>доход</span></div>
    <div class="kpi debt"><b class="num">${rub(M.leftToPay)}</b><span>осталось заплатить</span></div>
    <div class="kpi debt"><b class="num">${rub(M.debt)}</b><span>платежи по долгам</span></div>
    <div class="kpi exp"><b class="num">${rub(M.expense)}</b><span>бытовые расходы</span></div>
    <div class="kpi"><b class="num">${rub(M.out)}</b><span>всего к выплате</span></div>
    <div class="kpi free"><b class="num ${M.free < 0 ? "neg" : ""}">${rubSigned(M.free)}</b><span>${M.free < 0 ? "не хватает" : "свободно"}</span></div>
  </div></div>`;

  if (UI.who === "all") {
    html += `<div class="people">${["stepan", "yulia"].map(p => {
      const t = totals(p), m = monthStats(ym, p);
      return `<div class="person"><div class="name"><i class="dot ${p}"></i>${PEOPLE[p]}</div>
        <div class="row"><span>Долгов</span><b class="num">${rub(t.left)}</b></div>
        <div class="row"><span>В этом месяце</span><b class="num">${rub(m.out)}</b></div>
        <div class="row"><span>Осталось</span><b class="num">${rub(m.leftToPay)}</b></div>
        <div class="row"><span>Доход</span><b class="num" style="color:var(--mint)">${rub(m.income)}</b></div>
        <div class="row"><span>Свободно</span><b class="num" style="color:${m.free < 0 ? "var(--red)" : "var(--text)"}">${rubSigned(m.free)}</b></div></div>`;
    }).join("")}</div>`;
  }

  const t = today0();
  const upcoming = events(ym, addM(ym, 2)).filter(x => x.kind !== "income" && !x.paid && x.date >= t).slice(0, 6);
  if (upcoming.length) html += `<div class="card"><h2>Ближайшие платежи</h2><div class="list">${upcoming.map(x => itemRow(x)).join("")}</div></div>`;

  html += `<div class="card"><h2>График на 12 месяцев</h2>${chart12()}
    <div class="legend"><span><i style="background:var(--coral)"></i>долги</span><span><i style="background:var(--amber)"></i>расходы</span><span><i style="background:var(--mint)"></i>доход</span></div></div>`;

  const byType = {};
  for (const d of D.debts.filter(mine)) { const l = debtLeft(d); if (l > 0.5) byType[d.type] = (byType[d.type] || 0) + l; }
  const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  if (types.length) {
    const max = types[0][1];
    html += `<div class="card"><h2>Долги по типам</h2>${types.map(([k, v]) => `<div style="display:flex;flex-direction:column;gap:4px">
      <div style="display:flex;justify-content:space-between;font-size:14px"><span>${DEBT_TYPES[k]}</span><b class="num">${rub(v)}</b></div>
      <div class="bar"><i style="width:${(v / max) * 100}%;background:var(--coral)"></i></div></div>`).join("")}</div>`;
  }
  html += `<button class="btn full" data-act="claude">🤖 Выгрузить данные для Claude</button>`;
  box.innerHTML = html;
}
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };

function chart12() {
  const start = TODAY_YM(); const months = Array.from({ length: 12 }, (_, i) => addM(start, i));
  const data = months.map(ym => monthStats(ym, UI.who));
  const max = Math.max(1, ...data.map(s => Math.max(s.out, s.income)));
  const W = 340, H = 190, top = 18, bottom = 22, left = 4, colW = (W - left) / 12, bw = colW * 0.58;
  const y = v => top + (H - top - bottom) * (1 - v / max);
  const short = v => v >= 1e6 ? (v / 1e6).toFixed(1).replace(".0", "") + "м" : v >= 1000 ? Math.round(v / 1000) + "к" : Math.round(v);
  let g = "";
  months.forEach((ym, i) => {
    const s = data[i]; const x = left + i * colW + (colW - bw) / 2;
    const yd = y(s.debt), ye = y(s.debt + s.expense);
    g += `<g data-act="goto-month" data-ym="${ym}" style="cursor:pointer">`;
    g += `<rect x="${x - 2}" y="${top}" width="${bw + 4}" height="${H - top - bottom}" fill="transparent"/>`;
    if (s.debt) g += `<rect x="${x}" y="${yd}" width="${bw}" height="${H - bottom - yd}" rx="3" fill="var(--coral)"/>`;
    if (s.expense) g += `<rect x="${x}" y="${ye}" width="${bw}" height="${yd - ye}" rx="3" fill="var(--amber)"/>`;
    if (s.income) g += `<line x1="${x - 3}" x2="${x + bw + 3}" y1="${y(s.income)}" y2="${y(s.income)}" stroke="var(--mint)" stroke-width="2.5" stroke-linecap="round"/>`;
    if (s.out) g += `<text class="val" x="${x + bw / 2}" y="${Math.min(ye, s.income ? y(s.income) : ye) - 4}" text-anchor="middle">${short(s.out)}</text>`;
    g += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" ${i === 0 ? 'style="fill:var(--text)"' : ""}>${monthShort(ym)}</text></g>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Платежи по месяцам"><line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" stroke="var(--line)"/>${g}</svg>`;
}

function renderMonth() {
  const box = $("#view-month");
  const ym = UI.month; const ev = events(ym, ym);
  const s = monthStats(ym, UI.who);
  let html = whoSwitch();
  html += `<div class="kpis">
    <div class="kpi"><b class="num">${rub(s.out)}</b><span>всего к выплате</span></div>
    <div class="kpi debt"><b class="num">${rub(s.leftToPay)}</b><span>осталось заплатить</span></div>
    <div class="kpi inc"><b class="num">${rub(s.income)}</b><span>доход</span></div>
    <div class="kpi free"><b class="num ${s.free < 0 ? "neg" : ""}">${rubSigned(s.free)}</b><span>${s.free < 0 ? "не хватает" : "свободно"}</span></div></div>`;
  if (!ev.length) html += `<div class="card empty"><h3>В этом месяце платежей нет</h3><p>Добавьте долги, расходы или зарплаты кнопкой «+».</p></div>`;
  else {
    let cur = ""; let list = "";
    for (const x of ev) {
      const dl = dayLabel(x.date);
      if (dl !== cur) { if (cur) list += `</div>`; cur = dl; list += `<p class="day-head">${dl}${sameDay(x.date, today0()) ? " · сегодня" : ""}</p><div class="list">`; }
      list += itemRow(x, { showDate: false });
    }
    html += `<div class="card">${list}</div></div>`;
  }
  box.innerHTML = html;
}

/** Раскладка платежей месяца по зарплатам: каждый платёж — с последней зарплаты до его даты; остаток переносится дальше. */
function renderSalary() {
  const box = $("#view-salary");
  const ym = UI.month, prev = addM(ym, -1);
  let html = whoSwitch();
  if (!D.incomes.some(mine)) {
    box.innerHTML = html + `<div class="card empty"><h3>Укажите зарплаты</h3><p>Добавьте, в какие дни и сколько приходит зарплата (и аванс), — тогда здесь будет видно, с какой зарплаты что платить.</p>
      <button class="btn primary" data-act="add" data-kind="income">Добавить зарплату</button></div>`;
    return;
  }
  // Платежи до первой зарплаты месяца оплачиваются с последней зарплаты прошлого месяца.
  const prevEv = events(prev, prev), ev = events(ym, ym);
  const prevInc = prevEv.filter(x => x.kind === "income").pop() || null;
  const incomes = [...(prevInc ? [prevInc] : []), ...ev.filter(x => x.kind === "income")];
  const outs = [...(prevInc ? prevEv.filter(x => x.kind !== "income" && x.date >= prevInc.date) : []), ...ev.filter(x => x.kind !== "income")];
  const buckets = [{ income: null, items: [] }, ...incomes.map(i => ({ income: i, items: [] }))];
  for (const o of outs) {
    let b = 0;
    for (let i = 0; i < incomes.length; i++) if (incomes[i].date <= o.date) b = i + 1;
    buckets[b].items.push(o);
  }
  html += `<p class="muted small" style="margin:0">Каждый платёж оплачивается с последней зарплаты до его даты. Что осталось после платежей — переходит на следующую зарплату.</p>`;
  let carry = 0;
  for (const b of buckets) {
    if (!b.income && !b.items.length) continue;
    const need = b.items.reduce((s, x) => s + x.amount, 0);
    const inc = b.income ? b.income.amount : 0;
    const left = inc + carry - need;
    const isPrev = b.income && b.income.ym !== ym;
    const head = b.income
      ? `<div class="bucket-head ${isPrev ? "pre" : ""}"><div><b>${esc(b.income.item.name)} ${personChip(b.income.item.person)}</b><small>${dayLabel(b.income.date)}${isPrev ? " · прошлый месяц" : ""}${carry ? ` · ${carry > 0 ? "плюс остаток" : "минус долг"} ${rub(Math.abs(carry))}` : ""}</small></div><span class="plus num">+${rub(inc)}</span></div>`
      : `<div class="bucket-head pre"><div><b>До первой зарплаты</b><small>зарплат раньше этих дат не указано</small></div></div>`;
    html += `<div class="bucket">${head}<div class="list">${b.items.length ? b.items.map(x => itemRow(x)).join("") : `<p class="muted small" style="padding:10px 0;margin:0">Платежей с этой зарплаты нет</p>`}</div>
      <div class="bucket-foot"><span>Платежи ${rub(need)}</span>${b.income ? `<span class="num ${left < 0 ? "neg" : "pos"}">${left < 0 ? "Не хватает " + rub(-left) : "Останется " + rub(left)}</span>` : `<span class="num neg">Нужно ${rub(need)}</span>`}</div></div>`;
    carry = b.income ? left : 0;
  }
  box.innerHTML = html;
}

function renderList() {
  const box = $("#view-list");
  let html = whoSwitch();
  const ds = D.debts.filter(mine).sort((a, b) => debtLeft(b) - debtLeft(a));
  const es = D.expenses.filter(mine), is = D.incomes.filter(mine);
  html += `<div class="card"><h2>Долги <span class="right num">${rub(ds.reduce((s, d) => s + debtLeft(d), 0))}</span></h2>${ds.length ? ds.map(d => {
    const left = debtLeft(d), pct = d.total ? Math.min(100, ((d.total - left) / d.total) * 100) : 0, nx = debtNext(d);
    return `<button class="debt-card" data-act="edit" data-id="${d.id}">
      <div class="line1"><b>${esc(d.name)}</b><span class="num" style="font-weight:800;color:${left > 0.5 ? "var(--coral)" : "var(--mint)"}">${left > 0.5 ? rub(left) : "Закрыт"}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="line2"><span>${DEBT_TYPES[d.type]} · ${PEOPLE[d.person]}${d.floating ? " · плавающий" : ""}</span><span class="num">${nx ? `${dayLabel(nx.date)} — ${rub(nx.amount)}` : "выплачен"}</span></div></button>`;
  }).join("") : `<p class="muted small" style="margin:0">Пока нет. Нажмите «+».</p>`}</div>`;
  html += `<div class="card"><h2>Регулярные расходы <span class="right num">${rub(es.reduce((s, e) => s + e.amount, 0))}/мес</span></h2>${es.length ? `<div class="list">${es.map(e => `<button class="item" data-act="edit" data-id="${e.id}">
      <span class="ico expense">${(EXP_CATS[e.cat] || "").slice(0, 2)}</span><span class="mid"><b>${esc(e.name)}</b><small>${e.day} числа · ${EXP_CATS[e.cat]} ${personChip(e.person)}${e.floating ? ` <span class="chip float">плавающий</span>` : ""}</small></span>
      <span class="amt num">${rub(e.amount)}</span></button>`).join("")}</div>` : `<p class="muted small" style="margin:0">Аренда, коммуналка, связь — всё, что платится каждый месяц.</p>`}</div>`;
  html += `<div class="card"><h2>Зарплаты <span class="right num">${rub(is.reduce((s, i) => s + i.amount, 0))}/мес</span></h2>${is.length ? `<div class="list">${is.map(i => `<button class="item" data-act="edit" data-id="${i.id}">
      <span class="ico income">₽</span><span class="mid"><b>${esc(i.name)}</b><small>${i.day} числа ${personChip(i.person)}</small></span>
      <span class="amt num" style="color:var(--mint)">+${rub(i.amount)}</span></button>`).join("")}</div>` : `<p class="muted small" style="margin:0">Укажите дни и суммы зарплаты и аванса.</p>`}</div>`;
  html += `<div class="card settings"><h2>Напоминания и данные</h2>
    <button class="btn" data-act="calendar">🔔 Напоминания в Календаре iPhone</button>
    <button class="btn" data-act="claude">🤖 Выгрузить данные для Claude</button>
    <button class="btn" data-act="backup">💾 Сохранить резервную копию</button>
    <button class="btn" data-act="restore">📂 Восстановить из копии</button>
    <button class="btn danger" data-act="wipe">Удалить все данные…</button>
    <p class="muted small" style="margin:0">Все данные хранятся только на этом телефоне. Время от времени сохраняйте резервную копию в «Файлы» или iCloud Drive.</p>
    <p class="muted" style="margin:0;font-size:11px">v${VERSION} · ${screenInfo()}</p></div>`;
  box.innerHTML = html;
}

// ---------- Листы: добавление и правка ----------
function openSheet(html) { $("#sheet-body").innerHTML = html; $("#sheet").hidden = false; $("#sheet-body").scrollTop = 0; }
function closeSheet() { $("#sheet").hidden = true; $("#sheet-body").innerHTML = ""; }

const findItem = id => D.debts.find(x => x.id === id) || D.expenses.find(x => x.id === id) || D.incomes.find(x => x.id === id);
const kindOf = it => D.debts.includes(it) ? "debt" : D.expenses.includes(it) ? "expense" : "income";

let FORM = null; // { kind, id|null, v: {...} }
function openForm(kind = "debt", id = null) {
  const it = id ? findItem(id) : null;
  if (it) kind = kindOf(it);
  const defPerson = UI.who !== "all" ? UI.who : (lsGet("lastPerson", "stepan"));
  const nextYM = TODAY_YM();
  const base = { person: defPerson, name: "", day: "", floating: false };
  const v = it ? { ...it } : kind === "debt" ? { ...base, type: "credit", total: "", payment: "", start: nextYM, freq: "monthly" }
    : kind === "expense" ? { ...base, cat: "rent", amount: "", start: "" } : { ...base, name: "Зарплата", amount: "" };
  FORM = { kind, id, v };
  drawForm();
}
function chips(name, map, val, cls = "") {
  return `<div class="chips ${cls}" data-field="${name}">${Object.entries(map).map(([k, t]) => `<button type="button" data-v="${k}" class="${val === k ? "on" : ""}">${t}</button>`).join("")}</div>`;
}
function drawForm(errors = {}) {
  const { kind, id, v } = FORM;
  const err = f => errors[f] ? `<span class="err">${errors[f]}</span>` : "";
  let h = `<h3>${id ? "Изменить" : "Добавить"}</h3>`;
  if (!id) h += `<div class="seg" data-act-seg>${[["debt", "Долг"], ["expense", "Расход"], ["income", "Зарплата"]].map(([k, t]) => `<button type="button" data-kind="${k}" class="${kind === k ? "on" : ""}">${t}</button>`).join("")}</div>`;
  h += `<div class="field"><span class="lbl">Чей</span>${chips("person", PEOPLE, v.person, "people")}</div>`;
  if (kind === "debt") {
    h += `<div class="field"><label for="f-name">Банк или кредитор</label><input id="f-name" data-f="name" value="${esc(v.name)}" placeholder="Сбербанк, Т-Банк, Займер…" autocomplete="off">${err("name")}</div>
      <div class="field"><span class="lbl">Тип</span>${chips("type", DEBT_TYPES, v.type)}</div>
      <label class="toggle"><span>Разовый платёж<small>Например, МФО: всю сумму вернуть в один день</small></span><input type="checkbox" data-f="once" ${v.freq === "once" ? "checked" : ""}></label>
      <div class="field"><label for="f-total">${v.freq === "once" ? "Сумма к возврату" : "Осталось выплатить всего"}, ₽</label><input id="f-total" data-f="total" inputmode="decimal" value="${v.total}" placeholder="150 000">${err("total")}</div>`;
    if (v.freq !== "once") h += `<div class="field"><label for="f-pay">Платёж в месяц, ₽</label><input id="f-pay" data-f="payment" inputmode="decimal" value="${v.payment}" placeholder="8 500">${err("payment")}</div>
      <label class="toggle"><span>Плавающий платёж<small>Сумма каждый месяц разная — укажите примерную, точную поправите в графике</small></span><input type="checkbox" data-f="floating" ${v.floating ? "checked" : ""}></label>`;
    h += `<div class="row2"><div class="field"><label for="f-day">День платежа</label><input id="f-day" data-f="day" inputmode="numeric" value="${v.day}" placeholder="15">${err("day")}</div>
      <div class="field"><label for="f-start">${v.freq === "once" ? "Месяц" : "Первый платёж"}</label><input id="f-start" type="month" data-f="start" value="${v.start}">${err("start")}</div></div>`;
  } else if (kind === "expense") {
    h += `<div class="field"><label for="f-name">Название</label><input id="f-name" data-f="name" value="${esc(v.name)}" placeholder="Аренда квартиры" autocomplete="off">${err("name")}</div>
      <div class="field"><span class="lbl">Категория</span>${chips("cat", EXP_CATS, v.cat)}</div>
      <div class="row2"><div class="field"><label for="f-amount">Сумма в месяц, ₽</label><input id="f-amount" data-f="amount" inputmode="decimal" value="${v.amount}" placeholder="25 000">${err("amount")}</div>
      <div class="field"><label for="f-day">День оплаты</label><input id="f-day" data-f="day" inputmode="numeric" value="${v.day}" placeholder="1">${err("day")}</div></div>
      <label class="toggle"><span>Сумма плавающая<small>Как коммуналка: в каждом месяце можно вписать точную сумму</small></span><input type="checkbox" data-f="floating" ${v.floating ? "checked" : ""}></label>`;
  } else {
    h += `<div class="field"><label for="f-name">Название</label><input id="f-name" data-f="name" value="${esc(v.name)}" placeholder="Зарплата, аванс…" autocomplete="off">${err("name")}</div>
      <div class="chips" data-quick-name><button type="button" data-v="Зарплата">Зарплата</button><button type="button" data-v="Аванс">Аванс</button><button type="button" data-v="Подработка">Подработка</button></div>
      <div class="row2"><div class="field"><label for="f-amount">Сумма, ₽</label><input id="f-amount" data-f="amount" inputmode="decimal" value="${v.amount}" placeholder="45 000">${err("amount")}</div>
      <div class="field"><label for="f-day">День прихода</label><input id="f-day" data-f="day" inputmode="numeric" value="${v.day}" placeholder="10">${err("day")}</div></div>`;
  }
  h += `<button class="btn primary full" data-act="form-save">${id ? "Сохранить" : "Добавить"}</button>`;
  if (id) {
    if (kind === "debt") h += scheduleEditor(findItem(id));
    else if (findItem(id).floating) h += monthsEditor(findItem(id), kind);
    h += `<button class="btn danger full" data-act="form-delete">Удалить</button><div class="confirm" id="del-confirm" hidden><p>Удалить «${esc(v.name)}» вместе с отметками об оплате? Это нельзя отменить.</p>
      <div class="row2"><button class="btn" data-act="del-no">Отмена</button><button class="btn danger solid" data-act="del-yes">Удалить</button></div></div>`;
  }
  h += `<button class="btn full" data-act="close">Закрыть</button>`;
  openSheet(h);
}
function readForm() {
  document.querySelectorAll("#sheet-body [data-f]").forEach(el => {
    const f = el.dataset.f;
    if (f === "once") FORM.v.freq = el.checked ? "once" : "monthly";
    else if (el.type === "checkbox") FORM.v[f] = el.checked;
    else FORM.v[f] = el.value;
  });
}
function saveForm() {
  readForm();
  const { kind, id, v } = FORM; const e = {};
  const out = { id: id || uid(), person: v.person, name: String(v.name).trim() };
  if (!out.name) e.name = "Укажите название";
  const day = Number(v.day); if (!(day >= 1 && day <= 31)) e.day = "Число от 1 до 31"; out.day = day;
  if (kind === "debt") {
    Object.assign(out, { type: v.type, freq: v.freq === "once" ? "once" : "monthly", floating: v.freq !== "once" && !!v.floating, start: v.start });
    out.total = parseMoney(v.total); if (!(out.total > 0)) e.total = "Введите сумму больше нуля";
    if (out.freq === "monthly") { out.payment = parseMoney(v.payment); if (!(out.payment > 0)) e.payment = "Введите сумму платежа"; }
    else out.payment = out.total;
    if (!/^\d{4}-\d{2}$/.test(out.start || "")) e.start = "Выберите месяц";
  } else {
    out.amount = parseMoney(v.amount); if (!(out.amount > 0)) e.amount = "Введите сумму больше нуля";
    if (kind === "expense") { out.cat = v.cat; out.floating = !!v.floating; out.start = v.start || (id ? findItem(id).start : TODAY_YM()); }
    else out.start = id ? findItem(id).start : TODAY_YM();
  }
  if (Object.keys(e).length) { drawForm(e); return; }
  const arr = kind === "debt" ? D.debts : kind === "expense" ? D.expenses : D.incomes;
  const i = arr.findIndex(x => x.id === out.id);
  if (i >= 0) arr[i] = { ...arr[i], ...out }; else arr.push(out);
  lsSet("lastPerson", out.person);
  save(); closeSheet(); render();
  toast(id ? "Сохранено" : kind === "debt" ? "Долг добавлен" : kind === "expense" ? "Расход добавлен" : "Зарплата добавлена");
}
function deleteItem(id) {
  const it = findItem(id); if (!it) return;
  for (const k of ["debts", "expenses", "incomes"]) D[k] = D[k].filter(x => x.id !== id);
  for (const m of ["paid", "over", "exported"]) for (const key of Object.keys(D[m])) if (key.startsWith(id + "|")) delete D[m][key];
  save(); closeSheet(); render(); toast("Удалено");
}
const checkSvg = `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`;
function scheduleEditor(d) {
  const s = debtSchedule(d); if (!s.length) return "";
  const left = debtLeft(d);
  return `<div class="field"><span class="lbl">График платежей · осталось ${rub(left)}</span>
    <span class="hint">Поменяйте сумму месяца, если платёж плавающий. Галочка — платёж внесён.</span>
    <div class="sched">${s.map(x => `<div class="sched-row ${x.paid ? "paid" : ""}"><span>${monthTitle(x.ym)}<br><small class="muted">${dayLabel(x.date)}</small></span>
      <input inputmode="decimal" data-sched="${x.key}" value="${Math.round(x.amount)}" ${x.paid ? "disabled" : ""}>
      <button class="ok ${x.paid ? "on" : ""}" data-act="toggle-paid" data-key="${x.key}" aria-label="Оплачено">${checkSvg}</button></div>`).join("")}</div></div>`;
}
function monthsEditor(it, kind) {
  const from = TODAY_YM(); const s = recurring(it, kind, addM(from, -1), addM(from, 5));
  return `<div class="field"><span class="lbl">Суммы по месяцам</span><span class="hint">Впишите точную сумму, когда придёт квитанция.</span>
    <div class="sched">${s.map(x => `<div class="sched-row ${x.paid ? "paid" : ""}"><span>${monthTitle(x.ym)}</span>
      <input inputmode="decimal" data-sched="${x.key}" value="${Math.round(x.amount)}" ${x.paid ? "disabled" : ""}>
      <button class="ok ${x.paid ? "on" : ""}" data-act="toggle-paid" data-key="${x.key}" aria-label="Оплачено">${checkSvg}</button></div>`).join("")}</div></div>`;
}

// Лист платежа: отметить оплату, поправить сумму месяца.
function findInstance(key) {
  const [id, ym] = key.split("|"); const it = findItem(id); if (!it) return null;
  const k = kindOf(it);
  const list = k === "debt" ? debtSchedule(it) : recurring(it, k, ym, ym);
  return list.find(x => x.key === key) || null;
}
function openPay(key) {
  const x = findInstance(key); if (!x) return;
  const isInc = x.kind === "income";
  openSheet(`<h3>${esc(x.item.name)}</h3>
    <p class="muted" style="margin:-8px 0 0">${dayLabel(x.date)} · ${isInc ? "доход" : x.kind === "debt" ? DEBT_TYPES[x.item.type] : EXP_CATS[x.item.cat]} · ${PEOPLE[x.item.person]}</p>
    <div class="field"><label for="p-amount">${isInc ? "Сумма в этом месяце" : x.paid ? "Оплачено" : "Сумма платежа в этом месяце"}, ₽</label>
      <input id="p-amount" inputmode="decimal" value="${Math.round(x.amount)}" ${x.paid ? "disabled" : ""}>
      ${!x.paid && !isInc ? `<span class="hint">Если сумма другая (плавающий платёж) — исправьте перед отметкой.</span>` : ""}</div>
    ${isInc ? `<button class="btn primary full" data-act="amount-save" data-key="${key}">Сохранить сумму</button>`
      : x.paid ? `<button class="btn full" data-act="unpay" data-key="${key}">Отменить оплату</button>`
      : `<button class="btn primary full" data-act="mark-paid" data-key="${key}">Оплачено</button><button class="btn full" data-act="amount-save" data-key="${key}">Только изменить сумму</button>`}
    <button class="btn full" data-act="edit" data-id="${x.item.id}">Открыть ${isInc ? "зарплату" : x.kind === "debt" ? "долг" : "расход"}</button>
    <button class="btn full" data-act="close">Закрыть</button>`);
}
function setAmount(key, val) {
  const x = findInstance(key); if (!x) return false;
  const n = parseMoney(val); if (!(n >= 0)) { toast("Введите сумму числом"); return false; }
  const base = x.kind === "debt" ? x.item.payment : x.item.amount;
  if (Math.round(n) === Math.round(base)) delete D.over[key]; else D.over[key] = n;
  return true;
}
function markPaid(key, amount) {
  const x = findInstance(key); if (!x) return;
  D.paid[key] = { amount: amount ?? x.amount, at: Date.now() };
  save();
}

// ---------- Календарь iPhone (.ics) ----------
function icsDate(d, h) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}0000`; }
const icsEsc = s => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
function openCalendar() {
  const from = TODAY_YM(), to = addM(from, 11), t = today0();
  const ev = events(from, to, "all").filter(x => x.kind !== "income" && !x.paid && x.date >= t);
  const fresh = ev.filter(x => D.exported[x.key] !== Math.round(x.amount));
  openSheet(`<h3>Напоминания в Календаре</h3>
    <p style="margin:0">Приложение создаст события в Календаре iPhone на каждый платёж на год вперёд, с уведомлением в день оплаты.</p>
    <div class="field"><label for="c-hour">Во сколько напоминать</label><select id="c-hour">${[7, 8, 9, 10, 11, 12, 18, 20].map(h => `<option value="${h}" ${D.remindHour === h ? "selected" : ""}>${h}:00</option>`).join("")}</select></div>
    <label class="toggle"><span>Ещё и за день до платежа</span><input type="checkbox" id="c-before" ${D.remindBefore ? "checked" : ""}></label>
    <label class="toggle"><span>Только новые и изменённые<small>Новых: ${fresh.length} из ${ev.length}. Выключите, чтобы выгрузить всё заново (в Календаре могут появиться дубли).</small></span><input type="checkbox" id="c-fresh" ${fresh.length ? "checked" : ""}></label>
    <button class="btn primary full" data-act="ics-go">Добавить в Календарь</button>
    <p class="muted small" style="margin:0">Откроется окно Календаря — нажмите «Добавить все». После изменений в графике нажмите эту кнопку ещё раз: добавятся только новые платежи.</p>
    <button class="btn full" data-act="close">Закрыть</button>`);
}
async function exportIcs() {
  D.remindHour = Number($("#c-hour").value); D.remindBefore = $("#c-before").checked;
  const onlyFresh = $("#c-fresh").checked;
  const from = TODAY_YM(), to = addM(from, 11), t = today0();
  let ev = events(from, to, "all").filter(x => x.kind !== "income" && !x.paid && x.date >= t);
  if (onlyFresh) ev = ev.filter(x => D.exported[x.key] !== Math.round(x.amount));
  if (!ev.length) { toast("Новых платежей нет — всё уже в Календаре"); return; }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SVUA Fin//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:SVUA Fin — платежи"];
  for (const x of ev) {
    const what = x.kind === "debt" ? DEBT_TYPES[x.item.type] : EXP_CATS[x.item.cat];
    lines.push("BEGIN:VEVENT", `UID:${x.key.replace("|", "-")}-${Math.round(x.amount)}@svuafin`, `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(x.date, D.remindHour)}`, "DURATION:PT15M",
      `SUMMARY:${icsEsc(`💳 ${x.item.name} — ${rub(x.amount)}`)}`,
      `DESCRIPTION:${icsEsc(`${what} · ${PEOPLE[x.item.person]}${x.item.floating ? " · сумма может отличаться" : ""}\nОтметьте оплату в SVUA Fin.`)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:PT0M", `DESCRIPTION:${icsEsc("Платёж: " + x.item.name)}`, "END:VALARM");
    if (D.remindBefore) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-P1D", `DESCRIPTION:${icsEsc("Завтра платёж: " + x.item.name)}`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  const text = lines.join("\r\n");
  for (const x of ev) D.exported[x.key] = Math.round(x.amount);
  save();
  const file = new File([text], "svua-fin-platezhi.ics", { type: "text/calendar" });
  // iPhone: открываем файл — iOS сам предложит «Добавить все» в Календарь.
  const url = URL.createObjectURL(file);
  const a = document.createElement("a"); a.href = url; a.download = file.name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  closeSheet(); toast(`Платежей в файле: ${ev.length}`, "Поделиться", () => shareFile(file));
}
async function shareFile(file) {
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: file.name }); return true; } } catch (e) { if (e.name === "AbortError") return true; }
  return false;
}

// ---------- Резервная копия ----------
async function backup() {
  const d = new Date(); const name = `svua-fin-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  const file = new File([JSON.stringify({ app: "svua-fin", v: VERSION, savedAt: d.toISOString(), data: D }, null, 1)], name, { type: "application/json" });
  if (await shareFile(file)) { lsSet("lastBackup", Date.now()); return; }
  const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000); lsSet("lastBackup", Date.now());
}
function restoreFrom(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result); const data = j.data || j;
      if (!Array.isArray(data.debts) || !Array.isArray(data.incomes)) throw new Error("bad");
      openSheet(`<h3>Восстановить копию?</h3><p style="margin:0">В копии: долгов ${data.debts.length}, расходов ${(data.expenses || []).length}, зарплат ${data.incomes.length}${j.savedAt ? `, сохранена ${new Date(j.savedAt).toLocaleDateString("ru-RU")}` : ""}. Текущие данные на телефоне будут заменены.</p>
        <button class="btn primary full" data-act="restore-yes">Заменить данными из копии</button><button class="btn full" data-act="close">Отмена</button>`);
      PENDING_RESTORE = data;
    } catch { toast("Это не файл резервной копии SVUA Fin"); }
  };
  r.readAsText(file);
}
let PENDING_RESTORE = null;


// ---------- Выгрузка для Claude ----------
function claudeReport() {
  const now = new Date(), ym = TODAY_YM(), t = today0();
  const L = [];
  const row = cells => "| " + cells.join(" | ") + " |";
  L.push("# SVUA Fin — данные для анализа", "");
  L.push(`Выгружено: ${now.toLocaleString("ru-RU")}. Валюта: рубли. Люди: Степан и Юлия (у каждой записи указано, чья она).`);
  L.push("«Осталось» по долгу = сумма, которую пользователь ввёл как остаток, минус отмеченные в приложении платежи. Проценты отдельно не считаются — они уже внутри платежей.", "");
  L.push("## Итоги", "", row(["Показатель", "Всего", "Степан", "Юлия"]), row(["---", "---:", "---:", "---:"]));
  const W = ["all", "stepan", "yulia"], T = W.map(totals), M = W.map(w => monthStats(ym, w));
  L.push(row(["Долгов осталось выплатить", ...T.map(x => rub(x.left))]));
  L.push(row(["Активных долгов", ...T.map(x => String(x.count))]));
  L.push(row(["Последний платёж по долгам", ...T.map(x => x.end ? monthTitle(x.end) : "—")]));
  L.push(row([`Доход за ${monthTitle(ym)}`, ...M.map(x => rub(x.income))]));
  L.push(row([`Платежи по долгам за ${monthTitle(ym)}`, ...M.map(x => rub(x.debt))]));
  L.push(row([`Бытовые расходы за ${monthTitle(ym)}`, ...M.map(x => rub(x.expense))]));
  L.push(row([`Всего к выплате за ${monthTitle(ym)}`, ...M.map(x => rub(x.out))]));
  L.push(row(["Из них ещё не оплачено", ...M.map(x => rub(x.leftToPay))]));
  L.push(row(["Свободно в этом месяце", ...M.map(x => rubSigned(x.free))]), "");

  L.push("## Долги", "", row(["Чей", "Кредитор", "Тип", "Осталось", "Внесено в приложении как долг", "Платёж/мес", "День", "Плавающий", "Следующий платёж", "Последний платёж"]), row(Array(10).fill("---")));
  for (const d of D.debts) {
    const nx = debtNext(d);
    L.push(row([PEOPLE[d.person], d.name, DEBT_TYPES[d.type], rub(debtLeft(d)), rub(d.total), d.freq === "once" ? "разовый" : rub(d.payment), String(d.day), d.floating ? "да" : "нет",
      nx ? `${nx.date.toLocaleDateString("ru-RU")} — ${rub(nx.amount)}` : "выплачен", debtEnd(d) ? monthTitle(debtEnd(d)) : "—"]));
  }
  L.push("", "### Графики по долгам (неоплаченные платежи)", "");
  for (const d of D.debts) {
    const s = debtSchedule(d).filter(x => !x.paid); if (!s.length) continue;
    L.push(`- **${d.name}** (${PEOPLE[d.person]}): ` + s.map(x => `${x.date.toLocaleDateString("ru-RU")} ${rub(x.amount)}${x.date < t ? " (просрочен)" : ""}`).join("; "));
  }
  L.push("", "## Регулярные расходы", "", row(["Чей", "Название", "Категория", "Сумма/мес", "День", "Плавающая"]), row(Array(6).fill("---")));
  for (const e of D.expenses) L.push(row([PEOPLE[e.person], e.name, EXP_CATS[e.cat], rub(e.amount), String(e.day), e.floating ? "да" : "нет"]));
  L.push("", "## Зарплаты и доходы", "", row(["Чей", "Название", "Сумма", "День"]), row(Array(4).fill("---")));
  for (const i of D.incomes) L.push(row([PEOPLE[i.person], i.name, rub(i.amount), String(i.day)]));

  L.push("", "## План на 12 месяцев", "", row(["Месяц", "Доход", "Долги", "Расходы", "Всего к выплате", "Свободно", "Степан: долги+расходы / доход", "Юлия: долги+расходы / доход"]), row(Array(8).fill("---")));
  for (let k = 0; k < 12; k++) {
    const m = addM(ym, k), a = monthStats(m, "all"), st = monthStats(m, "stepan"), yu = monthStats(m, "yulia");
    L.push(row([monthTitle(m), rub(a.income), rub(a.debt), rub(a.expense), rub(a.out), rubSigned(a.free), `${rub(st.out)} / ${rub(st.income)}`, `${rub(yu.out)} / ${rub(yu.income)}`]));
  }
  const due = dueNow("all");
  if (due.late.length) { L.push("", "## Просроченные платежи", ""); for (const x of due.late) L.push(`- ${x.date.toLocaleDateString("ru-RU")} — ${x.item.name} (${PEOPLE[x.item.person]}): ${rub(x.amount)}`); }
  L.push("", "## Отмеченные оплаты", "");
  const paid = Object.entries(D.paid).map(([k, v]) => { const it = findItem(k.split("|")[0]); return it ? `- ${k.split("|")[1]} — ${it.name} (${PEOPLE[it.person]}): ${rub(v.amount)}` : null; }).filter(Boolean);
  L.push(...(paid.length ? paid : ["- пока нет"]));
  L.push("", "## Исходные данные (JSON)", "", "```json", JSON.stringify({ debts: D.debts, expenses: D.expenses, incomes: D.incomes, paid: D.paid, overrides: D.over }, null, 1), "```", "");
  return L.join("\n");
}
function openClaude() {
  const text = claudeReport();
  openSheet(`<h3>Выгрузка для Claude</h3>
    <p style="margin:0">Отчёт со всеми долгами, графиками, расходами, зарплатами и планом на год. Скопируйте его или сохраните файлом и отправьте Claude вместе с задачей — например, «как быстрее закрыть долги» или «что будет, если взять рассрочку на 30 000».</p>
    <button class="btn primary full" data-act="claude-copy">📋 Скопировать текст</button>
    <button class="btn full" data-act="claude-share">📤 Сохранить или отправить файлом</button>
    <p class="muted small" style="margin:0">В отчёте нет номеров счетов и карт — только названия, суммы и даты. Размер: ${Math.ceil(text.length / 1000)} тыс. знаков.</p>
    <button class="btn full" data-act="close">Закрыть</button>`);
}
async function claudeCopy() {
  const text = claudeReport();
  try { await navigator.clipboard.writeText(text); toast("Скопировано — вставьте в чат с Claude"); }
  catch { if (!(await claudeShare())) toast("Не удалось скопировать — используйте «Сохранить файлом»"); }
}
async function claudeShare() {
  const d = new Date();
  const file = new File([claudeReport()], `svua-fin-dlya-claude-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.md`, { type: "text/markdown" });
  if (await shareFile(file)) return true;
  const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000); return true;
}

// ---------- Тост ----------
let toastT = 0;
function toast(text, action, fn) {
  const t = $("#toast"); t.innerHTML = `<span>${esc(text)}</span>${action ? `<button>${esc(action)}</button>` : ""}`; t.hidden = false;
  if (action) t.querySelector("button").onclick = () => { t.hidden = true; fn(); };
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), action ? 6000 : 2600);
}

// ---------- События ----------
document.addEventListener("click", e => {
  const tab = e.target.closest("#tabs button");
  if (tab) { UI.tab = tab.dataset.tab; lsSet("tab", UI.tab); render(); $("#view-" + UI.tab).scrollTop = 0; return; }
  if (e.target.id === "sheet") { closeSheet(); return; }
  const seg = e.target.closest("[data-act-seg] button");
  if (seg) { readForm(); openForm(seg.dataset.kind); return; }
  const chip = e.target.closest(".chips[data-field] button");
  if (chip) { readForm(); FORM.v[chip.parentElement.dataset.field] = chip.dataset.v; drawForm(); return; }
  const qn = e.target.closest("[data-quick-name] button");
  if (qn) { readForm(); FORM.v.name = qn.dataset.v; drawForm(); return; }
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act;
  if (a === "who") { UI.who = el.dataset.who; lsSet("who", UI.who); render(); }
  else if (a === "month-prev") { UI.month = addM(UI.month, -1); render(); }
  else if (a === "month-next") { UI.month = addM(UI.month, 1); render(); }
  else if (a === "goto-month") { UI.month = el.dataset.ym; UI.tab = "month"; lsSet("tab", "month"); render(); }
  else if (a === "add") openForm(el.dataset.kind || "debt");
  else if (a === "edit") openForm(null, el.dataset.id);
  else if (a === "form-save") saveForm();
  else if (a === "form-delete") $("#del-confirm").hidden = false;
  else if (a === "del-no") $("#del-confirm").hidden = true;
  else if (a === "del-yes") deleteItem(FORM.id);
  else if (a === "close") closeSheet();
  else if (a === "pay") openPay(el.dataset.key);
  else if (a === "mark-paid") { const k = el.dataset.key; if (setAmount(k, $("#p-amount").value)) { markPaid(k, parseMoney($("#p-amount").value)); closeSheet(); render(); toast("Отмечено как оплачено", "Отменить", () => { delete D.paid[k]; save(); render(); }); } }
  else if (a === "unpay") { delete D.paid[el.dataset.key]; save(); closeSheet(); render(); toast("Оплата отменена"); }
  else if (a === "amount-save") { if (setAmount(el.dataset.key, $("#p-amount").value)) { save(); closeSheet(); render(); toast("Сумма месяца изменена"); } }
  else if (a === "toggle-paid") {
    const k = el.dataset.key;
    if (D.paid[k]) delete D.paid[k];
    else { const inp = document.querySelector(`[data-sched="${CSS.escape(k)}"]`); if (inp && !setAmount(k, inp.value)) return; markPaid(k, inp ? parseMoney(inp.value) : undefined); }
    save(); readForm(); drawForm(); render();
  }
  else if (a === "calendar") openCalendar();
  else if (a === "claude") openClaude();
  else if (a === "claude-copy") claudeCopy();
  else if (a === "claude-share") claudeShare();
  else if (a === "ics-go") exportIcs();
  else if (a === "backup") backup();
  else if (a === "restore") $("#import-file").click();
  else if (a === "restore-yes") { if (PENDING_RESTORE) { D = Object.assign(blank(), PENDING_RESTORE); save(); PENDING_RESTORE = null; closeSheet(); render(); toast("Данные восстановлены"); } }
  else if (a === "wipe") openSheet(`<h3>Удалить все данные?</h3><p style="margin:0">Удалятся все долги, расходы, зарплаты и отметки об оплате на этом телефоне. Сначала можно сохранить резервную копию.</p>
      <button class="btn full" data-act="backup">💾 Сохранить копию</button><button class="btn danger solid full" data-act="wipe-yes">Удалить всё</button><button class="btn full" data-act="close">Отмена</button>`);
  else if (a === "wipe-yes") { D = blank(); save(); closeSheet(); render(); toast("Все данные удалены"); }
});
// Сумма месяца в графике — сохраняется при выходе из поля.
document.addEventListener("change", e => {
  if (e.target.dataset?.f === "once") { readForm(); drawForm(); return; }
  const k = e.target.dataset?.sched; if (!k) return;
  if (setAmount(k, e.target.value)) { save(); readForm(); drawForm(); render(); }
});
$("#import-file").addEventListener("change", e => { const f = e.target.files[0]; if (f) restoreFrom(f); e.target.value = ""; });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { render(); fitHeight(); } });

// ---------- iOS 26 «с экрана Домой»: окно короче экрана, лишний нижний отступ убираем ----------
const STANDALONE = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
const IOS = /iP(hone|od|ad)/.test(navigator.platform) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
function fitHeight() {
  const root = document.documentElement;
  if (!(STANDALONE && IOS)) { root.style.removeProperty("--safe-b"); return; }
  const full = Math.abs(window.orientation || 0) === 90 ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
  if (window.innerHeight < full - 20) root.style.setProperty("--safe-b", "0px"); else root.style.removeProperty("--safe-b");
}
function screenInfo() { return `экран ${screen.width}×${screen.height} · окно ${innerWidth}×${innerHeight}${STANDALONE ? " · с экрана Домой" : ""}`; }

// ---------- Запуск ----------
UI.month = TODAY_YM();
fitHeight(); [150, 500, 1200, 2500].forEach(t => setTimeout(fitHeight, t));
addEventListener("resize", fitHeight); visualViewport?.addEventListener("resize", fitHeight);
render();
navigator.storage?.persist?.().catch(() => {});
if ("serviceWorker" in navigator && location.protocol === "https:") {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had) location.reload(); });
  navigator.serviceWorker.register("sw.js").then(r => r.update()).catch(() => {});
}
