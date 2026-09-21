
// server.js
// 入場整理券システム: サーバーのメモリ上でデータを保持するバックエンド。
// 25組/時間、9:00-16:00固定、日本時間(JST)基準で日付を扱う。
// 外部データベースへの依存がないため、Render / Railway / Fly.io など
// どの環境でも追加設定なしでそのまま動きます。
//
// 注意: メモリ上に保持しているだけなので、サーバーを再起動（再デプロイ・
// 無料プランのスリープからの復帰など）すると、その時点のデータは消えます。
// 再起動をまたいでデータを残したい場合は、Renderの無料PostgreSQLなど
// 外部データベースへの保存に変更してください（対応も可能です）。
 
const express = require('express');
const path = require('path');
const crypto = require('node:crypto');
 
// date -> array of tickets, "date_hour" -> next ticket number
const store = { tickets: {}, counters: {} };
 
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
 
const HOURS_START = 9;
const HOURS_END = 16; // 9:00-16:00 (exclusive end)
const CAPACITY = 25;
 
// ---- simple in-process mutex so concurrent requests for the same
//      date+hour never hand out the same ticket number ----
const locks = new Map();
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const run = () => Promise.resolve().then(fn);
  const next = prev.then(run, run);
  locks.set(key, next.catch(() => {}));
  return next;
}
 
function isValidDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}
function counterKey(date, hour) { return `${date}_${hour}`; }
 
function getTickets(date) {
  if (!store.tickets[date]) store.tickets[date] = [];
  return store.tickets[date];
}
function setTickets(date, list) {
  store.tickets[date] = list;
}
function getCounter(date, hour) {
  return store.counters[counterKey(date, hour)] || 1;
}
function setCounter(date, hour, value) {
  store.counters[counterKey(date, hour)] = value;
}
 
function groupByHour(tickets) {
  const byHour = {};
  for (const t of tickets) {
    const h = String(t.hour);
    if (!byHour[h]) byHour[h] = [];
    byHour[h].push(t);
  }
  for (const h in byHour) byHour[h].sort((a, b) => a.num - b.num);
  return byHour;
}
 
// GET /api/tickets?date=YYYY-MM-DD  -> { ticketsByHour, capacity, hoursStart, hoursEnd }
app.get('/api/tickets', async (req, res) => {
  const date = req.query.date;
  if (!isValidDate(date)) return res.status(400).json({ ok: false, error: 'invalid_date' });
  try {
    const tickets = getTickets(date);
    res.json({
      ok: true,
      ticketsByHour: groupByHour(tickets),
      capacity: CAPACITY,
      hoursStart: HOURS_START,
      hoursEnd: HOURS_END
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});
 
// POST /api/register { date, hour, name, size } -> { ok, ticket } | { ok:false, error }
app.post('/api/register', async (req, res) => {
  const { date, hour, name, size } = req.body || {};
  const h = Number(hour);
  if (!isValidDate(date) || !Number.isInteger(h) || h < HOURS_START || h >= HOURS_END) {
    return res.status(400).json({ ok: false, error: 'invalid_request' });
  }
  try {
    const result = await withLock(`${date}:${h}`, () => {
      const tickets = getTickets(date);
      const countForHour = tickets.filter(t => t.hour === h).length;
      if (countForHour >= CAPACITY) return { ok: false, error: 'full' };
 
      const nextNum = getCounter(date, h);
      const ticket = {
        id: crypto.randomUUID(),
        hour: h,
        num: nextNum,
        name: typeof name === 'string' ? name.trim().slice(0, 80) : '',
        size: Number.isFinite(Number(size)) && Number(size) > 0 ? Math.floor(Number(size)) : null,
        time: nowTimeStrJST()
      };
      tickets.push(ticket);
      setTickets(date, tickets);
      setCounter(date, h, nextNum + 1);
      return { ok: true, ticket };
    });
    if (!result.ok) return res.status(409).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});
 
// POST /api/cancel { date, id } -> { ok:true } | { ok:false, error }
app.post('/api/cancel', async (req, res) => {
  const { date, id } = req.body || {};
  if (!isValidDate(date) || typeof id !== 'string') {
    return res.status(400).json({ ok: false, error: 'invalid_request' });
  }
  try {
    await withLock(`${date}:cancel`, () => {
      const tickets = getTickets(date);
      const filtered = tickets.filter(t => t.id !== id);
      setTickets(date, filtered);
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});
 
function nowTimeStrJST() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const jst = new Date(utcMs + 9 * 60 * 60000);
  return String(jst.getUTCHours()).padStart(2, '0') + ':' + String(jst.getUTCMinutes()).padStart(2, '0');
}
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`整理券サーバー起動: http://localhost:${PORT}`);
});
 
