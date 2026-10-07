// Yaniv multijoueur — serveur sans dépendance (Node 18+)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const MAX = 7;                    // on peut annoncer Yaniv avec une main de MAX points ou moins (7 inclus)
const ASSAF = 30;                 // pénalité d'Assaf
const LOSE = 200;                 // on perd au-delà de ce score
const BONUS = [50, 100, 150, 200]; // pile sur ces scores : -50
const rooms = {};
const SUITS = ['♠', '♥', '♦', '♣'], LABEL = ['', 'A', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K'];

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const newDeck = () => { const d = []; let n = 0; for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ id: n++, s, r }); d.push({ id: n++, s: 'J', r: 0 }, { id: n++, s: 'J', r: 0 }); return shuffle(d); };
const val = c => Math.min(c.r, 10);              // joker = 0, figures = 10
const total = h => h.reduce((t, c) => t + val(c), 0);
const show = c => c.r ? LABEL[c.r] + c.s : 'Joker';

// Combinaison valide ? Renvoie les cartes rangées dans l'ordre, ou null.
function arrange(cs) {
  if (cs.length === 1) return cs;
  const nj = cs.filter(c => c.r), jk = cs.filter(c => !c.r);
  if (!nj.length) return cs.length <= 4 ? cs : null;
  if (cs.length <= 4 && nj.every(c => c.r === nj[0].r)) return cs;      // même valeur
  if (cs.length < 3 || !nj.every(c => c.s === nj[0].s)) return null;     // suite : 3+ cartes, même symbole
  nj.sort((a, b) => a.r - b.r);
  for (let i = 1; i < nj.length; i++) if (nj[i].r === nj[i - 1].r) return null;
  const out = []; const js = [...jk];
  for (let i = 0; i < nj.length; i++) {
    if (i) { const gap = nj[i].r - nj[i - 1].r - 1; if (gap > js.length) return null; for (let k = 0; k < gap; k++) out.push(js.pop()); }
    out.push(nj[i]);
  }
  let lo = nj[0].r, hi = nj[nj.length - 1].r;
  while (js.length) { if (hi < 13) { out.push(js.pop()); hi++; } else if (lo > 1) { out.unshift(js.pop()); lo--; } else return null; }
  return out;
}
const isRun = set => { const nj = set.filter(c => c.r); return nj.length >= 2 && new Set(nj.map(c => c.r)).size > 1; };
const takeable = pile => !pile || !pile.cards.length ? [] : pile.run ? [pile.cards[0].id, pile.cards[pile.cards.length - 1].id] : pile.cards.map(c => c.id);

function addPlayer(R, name) {
  if (R.phase !== 'lobby') throw 'La partie a déjà commencé';
  if (R.players.length >= 4) throw 'Le salon est complet (4 joueurs maximum)';
  const p = { id: crypto.randomBytes(8).toString('hex'), name: String(name || 'Joueur').trim().slice(0, 16) || 'Joueur', hand: [], score: 0, ready: false, res: null };
  R.players.push(p); return p;
}
function createRoom(name, solo) {
  let code; do code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join(''); while (rooms[code]);
  const R = { code, players: [], phase: 'lobby', starter: 0, turn: 0, deck: [], dead: [], pile: null, log: '', result: null, ev: null, evn: 0, timer: null, t: Date.now() };
  rooms[code] = R; const p = addPlayer(R, name);
  if (solo) { const b = addPlayer(R, 'Ordinateur'); b.bot = true; startGame(R); }
  return { R, p };
}
function startRound(R) {
  R.deck = newDeck(); R.dead = [];
  R.players.forEach(p => { p.hand = R.deck.splice(0, 5); p.ready = false; });
  R.pile = { cards: [R.deck.pop()], run: false };
  R.phase = 'play'; R.result = null; R.ev = null; R.turn = R.starter; R.log = 'Nouvelle manche';
}
function startGame(R) {
  if (R.phase !== 'lobby') throw 'La partie a déjà commencé';
  if (R.players.length < 2) throw 'Il faut au moins 2 joueurs';
  R.starter = 0; startRound(R);
}
function endRound(R, caller) {
  const ct = total(caller.hand), others = R.players.filter(p => p !== caller);
  const min = Math.min(...others.map(p => total(p.hand))), assaf = min <= ct;
  const rows = R.players.map(p => {
    const t = total(p.hand);
    const gain = p === caller ? (assaf ? ASSAF : 0) : (assaf && t === min ? 0 : t);
    let s = p.score + gain, bonus = false;
    if (BONUS.includes(s)) { s -= 50; bonus = true; }
    p.score = s;
    return { name: p.name, hand: p.hand, total: t, gain, bonus, score: s, caller: p === caller };
  });
  const over = R.players.some(p => p.score > LOSE);
  const sorted = [...R.players].sort((a, b) => a.score - b.score);
  R.result = { caller: caller.name, callerTotal: ct, assaf, rows, over, winner: over ? sorted[0].name : null, loser: over ? sorted[sorted.length - 1].name : null };
  R.phase = over ? 'over' : 'roundEnd'; R.ev = null;
  R.players.forEach(p => p.ready = false);
}
function act(R, p, a) {
  if (R.phase !== 'play') throw "Ce n'est pas le moment";
  if (R.players[R.turn] !== p) throw "Ce n'est pas ton tour";
  if (a.type === 'yaniv') {
    if (total(p.hand) > MAX) throw `Il faut ${MAX} points ou moins pour annoncer Yaniv`;
    return endRound(R, p);
  }
  const ids = a.cards || [], cs = ids.map(id => p.hand.find(c => c.id === id));
  if (!cs.length || cs.some(c => !c) || new Set(ids).size !== ids.length) throw 'Choisis les cartes à poser';
  const set = arrange(cs); if (!set) throw 'Combinaison non autorisée';
  let taken, from;
  if (a.take === 'deck') {
    if (!R.deck.length) { R.deck = shuffle(R.dead); R.dead = []; }
    if (!R.deck.length) throw 'La pioche est vide';
    taken = R.deck.pop(); from = 'la pioche';
  } else {
    if (!takeable(R.pile).includes(a.take)) throw 'Tu ne peux pas prendre cette carte';
    taken = R.pile.cards.find(c => c.id === a.take); from = show(taken);
    R.pile.cards = R.pile.cards.filter(c => c !== taken);
  }
  R.dead.push(...R.pile.cards);
  p.hand = p.hand.filter(c => !cs.includes(c)); p.hand.push(taken);
  R.pile = { cards: set, run: isRun(set) };
  R.log = `${p.name} pose ${set.map(show).join(' ')} et prend ${from}`;
  R.ev = { n: ++R.evn, by: p, set: set.map(c => c.id), took: a.take === 'deck' ? 'deck' : taken.id };
  R.turn = (R.turn + 1) % R.players.length;
}
function ready(R, p) {
  if (R.phase !== 'roundEnd' && R.phase !== 'over') throw "Ce n'est pas le moment";
  p.ready = true;
  if (R.players.every(q => q.ready)) {
    if (R.phase === 'over') { R.players.forEach(q => q.score = 0); R.starter = 0; } else R.starter = (R.starter + 1) % R.players.length;
    startRound(R);
  }
}
function view(R, p) {
  const myTurn = R.phase === 'play' && R.players[R.turn] === p;
  return {
    room: R.code, phase: R.phase, myTurn, deck: R.deck.length, log: R.log, result: R.result, max: MAX,
    me: { name: p.name, hand: p.hand, score: p.score, host: R.players[0] === p, ready: p.ready },
    players: R.players.map((q, i) => ({ name: q.name, count: q.hand.length, score: q.score, turn: R.phase === 'play' && i === R.turn, ready: q.ready, me: q === p })),
    ev: R.ev ? { n: R.ev.n, mine: R.ev.by === p, took: R.ev.took, set: R.ev.set } : null,
    pile: R.pile ? R.pile.cards : [], takeable: takeable(R.pile), canYaniv: myTurn && total(p.hand) <= MAX,
  };
}
const send = (R, p) => { if (p.res) p.res.write(`data: ${JSON.stringify(view(R, p))}\n\n`); };
const broadcast = R => { botCheck(R); R.players.forEach(p => send(R, p)); };

// Ordinateur (mode solo) : il pose ses cartes les plus lourdes et prend une carte basse si elle est dans la défausse
function botPlay(R) {
  const b = R.players[R.turn];
  if (R.phase !== 'play' || !b || !b.bot) return;
  if (total(b.hand) <= MAX && (total(b.hand) <= 4 || Math.random() < 0.8)) return act(R, b, { type: 'yaniv' });
  let best = null, bs = -1e9;
  for (let m = 1; m < 1 << b.hand.length; m++) {
    const cs = b.hand.filter((_, i) => m >> i & 1);
    if (!arrange(cs)) continue;
    const sc = cs.reduce((t, c) => t + val(c), 0) + cs.length * 0.1 - 4 * cs.filter(c => !c.r).length;
    if (sc > bs) { bs = sc; best = cs; }
  }
  const ok = takeable(R.pile), low = R.pile.cards.filter(c => ok.includes(c.id)).sort((x, y) => val(x) - val(y))[0];
  act(R, b, { type: 'play', cards: best.map(c => c.id), take: low && val(low) <= 3 ? low.id : 'deck' });
}
function botCheck(R) {
  const b = R.players.find(p => p.bot); if (!b) return;
  if ((R.phase === 'roundEnd' || R.phase === 'over') && !b.ready) ready(R, b);
  if (R.phase === 'play' && R.players[R.turn] === b && !R.timer)
    R.timer = setTimeout(() => { R.timer = null; try { botPlay(R); } catch (e) { console.error(e); } broadcast(R); }, 1000 + Math.random() * 500);
}

function handle(a) {
  if (a.action === 'create') { const { R, p } = createRoom(a.name, !!a.solo); broadcast(R); return { room: R.code, id: p.id }; }
  if (a.action === 'join') {
    const R = rooms[String(a.room || '').trim().toUpperCase()]; if (!R) throw 'Salon introuvable : vérifie le code';
    const p = addPlayer(R, a.name); broadcast(R); return { room: R.code, id: p.id };
  }
  const R = rooms[a.room], p = R && R.players.find(q => q.id === a.id);
  if (!p) throw 'Session inconnue : recrée ou rejoins un salon';
  R.t = Date.now();
  if (a.action === 'start') { if (R.players[0] !== p) throw 'Seul le créateur du salon peut lancer la partie'; startGame(R); }
  else if (a.action === 'play') act(R, p, a);
  else if (a.action === 'ready') ready(R, p);
  else throw 'Action inconnue';
  broadcast(R); return { ok: true };
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/events') {
    const R = rooms[u.searchParams.get('room')], p = R && R.players.find(q => q.id === u.searchParams.get('id'));
    if (!p) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    p.res = res; req.on('close', () => { if (p.res === res) p.res = null; });
    return send(R, p);
  }
  if (req.method === 'POST' && u.pathname === '/api') {
    let b = ''; req.on('data', d => { b += d; if (b.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let out;
      try { out = handle(JSON.parse(b || '{}')); }
      catch (e) { out = { error: typeof e === 'string' ? e : 'Erreur du serveur' }; if (typeof e !== 'string') console.error(e); }
      res.writeHead(out.error ? 400 : 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
    });
    return;
  }
  if (u.pathname === '/' || u.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  res.writeHead(404); res.end('Introuvable');
});

setInterval(() => { for (const c in rooms) { rooms[c].players.forEach(p => p.res && p.res.write(':\n\n')); if (Date.now() - rooms[c].t > 6 * 3600e3) delete rooms[c]; } }, 25000).unref();

if (require.main === module) server.listen(PORT, () => console.log('Yaniv prêt sur http://localhost:' + PORT));
module.exports = { server, rooms, botPlay, arrange, total, createRoom, addPlayer, startGame, act, ready, takeable, view, MAX, BONUS };
