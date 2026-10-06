"use strict";

/* ============ 1. SHOP CONFIG (edit these) ============ */
const SHOP_CONFIG = {
  shopName: "SUBHO MOBILE SHOP",
  campaignName: "DUSSEHRA DHAMAKA",
  campaignSubtitle: "Phone Purchase Kiya? Ab Spin Karo & Reward Jeeto!",
  supportPhone: "",
  termsVersion: "1.0",
  terms: [
    "One eligible purchase = one spin.",
    "A bill number can participate only once.",
    "Rewards are subject to shop campaign terms.",
    "Discounts apply according to shop policy.",
    "Physical gifts are subject to availability.",
    "Showcase items (Phone, Bike) shown on the wheel are promotional visuals and are not redeemable prizes.",
    "The shop reserves the right to verify eligibility."
  ]
};

/* ============ 2. REWARDS (index = wheel position) ============ */
// w = probability weight (sum of winnable = 100). Showcase w = 0 -> can never be selected.
const REWARDS = [
  { key: "1",     label: "1% OFF",  big: "1%",  sub: "OFF", type: "discount", w: 30 },
  { key: "phone", label: "Phone Showcase", icon: "📱", sub: "SHOWCASE", type: "showcase", w: 0 },
  { key: "2",     label: "2% OFF",  big: "2%",  sub: "OFF", type: "discount", w: 25 },
  { key: "3",     label: "3% OFF",  big: "3%",  sub: "OFF", type: "discount", w: 20 },
  { key: "earbuds", label: "Bluetooth Earbuds", icon: "🎧", sub: "EARBUDS", type: "gift", w: 3 },
  { key: "bike",  label: "Bike Showcase", icon: "🏍️", sub: "SHOWCASE", type: "showcase", w: 0 },
  { key: "4",     label: "4% OFF",  big: "4%",  sub: "OFF", type: "discount", w: 10 },
  { key: "5",     label: "5% OFF",  big: "5%",  sub: "OFF", type: "discount", w: 7 },
  { key: "neckband", label: "Neckband", icon: "🎶", sub: "NECKBAND", type: "gift", w: 2 },
  { key: "10",    label: "10% OFF", big: "10%", sub: "OFF", type: "discount", w: 3 }
];
const SEG_COLORS = ["#8c0f24", "#f59a23", "#b3122b", "#ffe3a8"];
const SHOWCASE_BG = "#2a1216";
const SPIN_MS = 5200;
const BIG_WINS = ["5", "10"];

/* ============ 3. STORAGE LAYER (swap this for Firebase/Supabase later) ============ */
const Storage = {
  KEY: "dussehraSpinRecords_v1",
  getAll() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; }
  },
  add(rec) {
    const all = this.getAll(); all.push(rec);
    try { localStorage.setItem(this.KEY, JSON.stringify(all)); } catch (e) { console.error("Save failed", e); }
  },
  findByBill(bill) { return this.getAll().find(r => r.bill === bill); }
};

/* ============ 4. STATE + DOM ============ */
const $ = id => document.getElementById(id);
const state = { customer: null, rotation: 0, spinning: false, sound: true, lastRecord: null };
let audioCtx = null;

/* ============ 5. INIT ============ */
function init() {
  $("shopName").textContent = SHOP_CONFIG.shopName;
  $("footShop").textContent = `© ${SHOP_CONFIG.shopName}` + (SHOP_CONFIG.supportPhone ? ` · Help: ${SHOP_CONFIG.supportPhone}` : "");
  $("campaignName").textContent = SHOP_CONFIG.campaignName;
  $("campaignSub").textContent = SHOP_CONFIG.campaignSubtitle;
  $("termsList").innerHTML = SHOP_CONFIG.terms.map(t => `<li>${esc(t)}</li>`).join("");
  document.title = `${SHOP_CONFIG.campaignName} – Spin & Win`;

  drawWheel();
  makeParticles();
  $("customerForm").addEventListener("submit", onContinue);
  $("resetBtn").addEventListener("click", resetForm);
  $("spinBtn").addEventListener("click", startSpin);
  $("soundBtn").addEventListener("click", toggleSound);
  $("adminBtn").addEventListener("click", showHistory);
  $("doneBtn").addEventListener("click", () => { closeModal("resultModal"); resetForm(); });
  $("saveBtn").addEventListener("click", saveResultFile);
  $("printBtn").addEventListener("click", printResult);
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => closeModal(b.dataset.close)));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") ["dupModal", "histModal"].forEach(closeModal);
  });
  window.addEventListener("resize", sizeFx); sizeFx();
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const normBill = b => b.trim().toUpperCase().replace(/\s+/g, "");
const normMobile = m => m.replace(/[\s\-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");

/* ============ 6. VALIDATION + BILL CHECK ============ */
function validateCustomer() {
  const name = $("cName").value.trim();
  const mobile = normMobile($("cMobile").value);
  const bill = normBill($("cBill").value);
  const errors = {
    Name: name.length < 2 ? "Enter the customer's name." : "",
    Mobile: /^[6-9]\d{9}$/.test(mobile) ? "" : "Enter a valid 10-digit mobile number.",
    Bill: /^[A-Z0-9\-\/]{3,20}$/.test(bill) ? "" : "Enter a valid bill number (letters, numbers, - or /)."
  };
  ["Name", "Mobile", "Bill"].forEach(k => {
    $("e" + k).textContent = errors[k];
    $("c" + k).classList.toggle("bad", !!errors[k]);
  });
  const ok = !Object.values(errors).some(Boolean);
  return ok ? { name, mobile, bill } : null;
}

function checkExistingBill(bill) { return Storage.findByBill(bill); }

function onContinue(e) {
  e.preventDefault();
  ensureAudio(); playClick();
  const c = validateCustomer();
  if (!c) return;
  const prev = checkExistingBill(c.bill);
  if (prev) {
    $("dInfo").textContent = `Bill ${prev.bill} · ${prev.date}, ${prev.time}`;
    openModal("dupModal");
    return;
  }
  state.customer = c;
  ["cName", "cMobile", "cBill"].forEach(id => $(id).disabled = true);
  $("continueBtn").hidden = true; $("resetBtn").hidden = false;
  $("spinBtn").disabled = false;
  $("spinHint").textContent = `Ready, ${c.name}! Press SPIN NOW.`;
  if (document.activeElement) document.activeElement.blur(); // close mobile keyboard
  $("wheelWrap").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm() {
  if (state.spinning) return;
  state.customer = null;
  $("customerForm").reset();
  ["cName", "cMobile", "cBill"].forEach(id => { $(id).disabled = false; $(id).classList.remove("bad"); });
  ["Name", "Mobile", "Bill"].forEach(k => $("e" + k).textContent = "");
  $("continueBtn").hidden = false; $("resetBtn").hidden = true;
  $("spinBtn").disabled = true;
  $("spinHint").textContent = "Enter customer details to unlock the spin.";
}

/* ============ 7. REWARD SELECTION (decided BEFORE the animation) ============ */
function selectReward() {
  const pool = REWARDS.filter(r => r.w > 0);          // showcase excluded
  const total = pool.reduce((s, r) => s + r.w, 0);
  let roll = secureRandom() * total;
  for (const r of pool) { if ((roll -= r.w) < 0) return REWARDS.indexOf(r); }
  return REWARDS.indexOf(pool[0]);
}
function secureRandom() {
  if (window.crypto && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  return Math.random();
}

/* ============ 8. WHEEL DRAWING ============ */
function drawWheel() {
  const cv = $("wheel"), ctx = cv.getContext("2d");
  const LOGICAL = 640, px = (window.devicePixelRatio || 1) > 1.5 ? 960 : 640; // sharper on high-DPI phones
  cv.width = cv.height = px; ctx.setTransform(px / LOGICAL, 0, 0, px / LOGICAL, 0, 0);
  const S = LOGICAL, R = S / 2, n = REWARDS.length, seg = Math.PI * 2 / n;
  ctx.clearRect(0, 0, S, S);
  ctx.save(); ctx.translate(R, R);
  REWARDS.forEach((r, i) => {
    const start = -Math.PI / 2 + i * seg, end = start + seg;
    const showcase = r.type === "showcase";
    const bg = showcase ? SHOWCASE_BG : SEG_COLORS[i % 4];
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R - 4, start, end); ctx.closePath();
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#f6c453"; ctx.stroke();
    if (showcase) { // dashed inner ring marks "not a prize"
      ctx.save(); ctx.setLineDash([8, 8]); ctx.strokeStyle = "rgba(246,196,83,.6)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, R * .62, start + .05, end - .05); ctx.stroke(); ctx.restore();
    }
    // label
    const light = !showcase && (bg === "#ffe3a8" || bg === "#f59a23");
    const fg = showcase ? "#f6c453" : light ? "#4a0610" : "#fff3dc";
    ctx.save(); ctx.rotate(start + seg / 2 + Math.PI / 2);
    ctx.textAlign = "center"; ctx.fillStyle = fg;
    if (r.big) {
      ctx.font = "800 54px Georgia, serif"; ctx.fillText(r.big, 0, -R * .56);
      ctx.font = "700 24px 'Segoe UI', Arial"; ctx.fillText(r.sub, 0, -R * .56 + 28);
    } else {
      ctx.font = "44px 'Segoe UI Emoji','Apple Color Emoji',sans-serif"; ctx.fillText(r.icon, 0, -R * .60);
      ctx.font = `700 ${showcase ? 20 : 22}px 'Segoe UI', Arial`; ctx.fillText(r.sub, 0, -R * .60 + 32);
    }
    ctx.restore();
  });
  // rim studs
  for (let i = 0; i < n * 2; i++) {
    const a = i * seg / 2;
    ctx.beginPath(); ctx.arc(Math.cos(a) * (R - 12), Math.sin(a) * (R - 12), 4, 0, 7);
    ctx.fillStyle = "#fff2b8"; ctx.fill();
  }
  ctx.restore();
}

/* ============ 9. SPIN FLOW ============ */
function startSpin() {
  if (state.spinning || !state.customer) return;
  if (checkExistingBill(state.customer.bill)) { openModal("dupModal"); return; } // re-check
  ensureAudio(); playClick();
  state.spinning = true;
  $("spinBtn").disabled = true; $("resetBtn").disabled = true;
  $("spinHint").textContent = "Good luck… 🤞";

  const idx = selectReward();                 // 1) decide
  const record = saveSpin(state.customer, REWARDS[idx]); // 2) persist immediately (no re-spin by refresh)
  state.lastRecord = record;

  animateWheel(idx).then(() => {              // 3) animate toward chosen segment
    $("spinHint").textContent = "";
    setTimeout(() => {
      playWinSound(BIG_WINS.includes(REWARDS[idx].key));
      launchConfetti(REWARDS[idx].key === "10" ? 300 : BIG_WINS.includes(REWARDS[idx].key) ? 180 : 100);
      showResult(record, REWARDS[idx]);
      state.spinning = false; $("resetBtn").disabled = false;
    }, 700);
  });
}

function animateWheel(idx) {
  return new Promise(resolve => {
    const TAU = Math.PI * 2, seg = TAU / REWARDS.length;
    const wheel = $("wheel"), pointer = $("pointer");
    const from = state.rotation;
    const jitter = (secureRandom() - .5) * seg * .6;            // lands inside segment, not always dead centre
    const centre = idx * seg + seg / 2;
    const need = (((-(centre) + jitter - from) % TAU) + TAU) % TAU;
    const total = TAU * (6 + Math.floor(secureRandom() * 3)) + need;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduce ? 3500 : SPIN_MS;
    let lastTick = Math.floor(from / seg), t0 = null;

    const ease = t => {                                          // slow start -> fast -> long slow-down
      const out = 1 - Math.pow(1 - t, 3.6);
      const u = Math.min(t / .1, 1);
      return out * (u * u * (3 - 2 * u));
    };
    function frame(now) {
      if (t0 === null) t0 = now;
      const t = Math.min((now - t0) / dur, 1);
      const rot = from + total * ease(t);
      wheel.style.transform = `rotate(${rot}rad)`;
      const tick = Math.floor(-rot / seg);                       // segment currently under pointer changes
      if (tick !== lastTick) { lastTick = tick; playTickSound(); pointer.classList.remove("bounce"); void pointer.offsetWidth; pointer.classList.add("bounce"); }
      if (t < 1) requestAnimationFrame(frame);
      else { state.rotation = (from + total) % TAU; wheel.style.transform = `rotate(${state.rotation}rad)`; resolve(); }
    }
    requestAnimationFrame(frame);
  });
}

/* ============ 10. SAVE + HISTORY ============ */
function saveSpin(c, reward) {
  const d = new Date();
  const rec = {
    name: c.name, mobile: c.mobile, bill: c.bill,
    reward: reward.label, rewardKey: reward.key,
    date: d.toLocaleDateString("en-IN"), time: d.toLocaleTimeString("en-IN"),
    iso: d.toISOString(), termsVersion: SHOP_CONFIG.termsVersion
  };
  Storage.add(rec);
  return rec;
}

function showHistory() {
  const all = Storage.getAll();
  const count = k => all.filter(r => r.rewardKey === k).length;
  const stats = [["Total Spins", all.length], ["1% Rewards", count("1")], ["2% Rewards", count("2")], ["3% Rewards", count("3")],
    ["4% Rewards", count("4")], ["5% Rewards", count("5")], ["10% Rewards", count("10")], ["Neckbands", count("neckband")], ["Earbuds", count("earbuds")]];
  $("summary").innerHTML = stats.map(([l, v]) => `<div><b>${v}</b>${l}</div>`).join("");
  $("histBody").innerHTML = all.length
    ? all.slice().reverse().map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.mobile)}</td><td>${esc(r.bill)}</td><td>${esc(r.reward)}</td><td>${esc(r.date)}</td><td>${esc(r.time)}</td></tr>`).join("")
    : `<tr><td colspan="6">No spins recorded yet.</td></tr>`;
  openModal("histModal");
}

/* ============ 11. RESULT, SAVE, PRINT ============ */
function showResult(rec, reward) {
  const jackpot = reward.key === "10";
  $("resultSheet").classList.toggle("jackpot", jackpot);
  $("rEmoji").textContent = jackpot ? "🏆" : reward.type === "gift" ? "🎁" : "🎉";
  $("rTitle").textContent = jackpot ? "JACKPOT!" : "CONGRATULATIONS!";
  $("rPrize").textContent = reward.type === "gift" ? `${reward.icon} ${reward.label}` : reward.label;
  $("rName").textContent = rec.name;
  $("rBill").textContent = rec.bill;
  $("rDate").textContent = `${rec.date}, ${rec.time}`;
  $("receipt").innerHTML = `
    <h2>${esc(SHOP_CONFIG.campaignName)}</h2><p><b>SPIN &amp; WIN</b></p>
    <p>${esc(SHOP_CONFIG.shopName)}</p><p>--------------------</p>
    <p>Customer: ${esc(rec.name)}</p><p>Bill No: ${esc(rec.bill)}</p>
    <p>REWARD</p><div class="big">${esc(reward.label)}</div>
    <p>Date: ${esc(rec.date)}</p><p>Time: ${esc(rec.time)}</p><p>--------------------</p>
    <p>Thank you for shopping with us!</p>`;
  openModal("resultModal");
  $("doneBtn").focus();
}

function printResult() { window.print(); }

function saveResultFile() {
  const r = state.lastRecord; if (!r) return;
  const text = [SHOP_CONFIG.campaignName + " - SPIN & WIN", SHOP_CONFIG.shopName, "",
    `Customer: ${r.name}`, `Bill No: ${r.bill}`, `Reward: ${r.reward}`, `Date: ${r.date}`, `Time: ${r.time}`, "",
    "Show this result at the billing counter."].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = `spin-result-${r.bill}.txt`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ============ 12. MODALS ============ */
function openModal(id) { $(id).hidden = false; }
function closeModal(id) { $(id).hidden = true; }

/* ============ 13. SOUND (Web Audio – no files needed, starts only after a click) ============ */
function ensureAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { } }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function tone(freq, dur, type = "sine", vol = .15, delay = 0) {
  if (!state.sound || !audioCtx) return;
  const t = audioCtx.currentTime + delay, o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur + .02);
}
const playClick = () => { tone(660, .07, "triangle", .12); tone(990, .08, "triangle", .08, .05); };
const playTickSound = () => tone(1200, .035, "square", .05);
function playWinSound(big) {
  const notes = big ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 1047];
  notes.forEach((f, i) => tone(f, big ? .35 : .28, big ? "sawtooth" : "triangle", big ? .09 : .12, i * (big ? .11 : .12)));
  if (big) [1047, 1319, 1568].forEach(f => tone(f, .9, "triangle", .1, notes.length * .11));
}
function toggleSound() {
  state.sound = !state.sound;
  $("soundBtn").textContent = state.sound ? "🔊" : "🔇";
  $("soundBtn").setAttribute("aria-pressed", state.sound);
  if (state.sound) { ensureAudio(); playClick(); }
}

/* ============ 14. CONFETTI + PARTICLES ============ */
const fx = $("fx"), fctx = fx.getContext("2d");
let confetti = [], confettiOn = false;
function sizeFx() { fx.width = innerWidth; fx.height = innerHeight; }
function launchConfetti(count = 120) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) count = 30;
  else if (innerWidth < 600) count = Math.round(count * .6); // lighter on phones
  const cols = ["#f6c453", "#ff8a3d", "#e0302f", "#fff3dc", "#ffd45e"];
  for (let i = 0; i < count; i++) {
    confetti.push({ x: fx.width / 2 + (Math.random() - .5) * 120, y: fx.height * .45, vx: (Math.random() - .5) * 16, vy: -Math.random() * 15 - 4,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[i % cols.length], life: 1 });
  }
  if (!confettiOn) { confettiOn = true; requestAnimationFrame(stepConfetti); }
}
function stepConfetti() {
  fctx.clearRect(0, 0, fx.width, fx.height);
  confetti = confetti.filter(p => p.y < fx.height + 20);
  confetti.forEach(p => {
    p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
    fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.r); fctx.fillStyle = p.c; fctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); fctx.restore();
  });
  if (confetti.length) requestAnimationFrame(stepConfetti); else { confettiOn = false; fctx.clearRect(0, 0, fx.width, fx.height); }
}
function makeParticles() {
  const box = $("particles"), n = innerWidth < 600 ? 14 : 26;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    p.style.cssText = `left:${Math.random() * 100}%;--s:${3 + Math.random() * 5}px;--d:${9 + Math.random() * 10}s;--dl:${-Math.random() * 15}s;--x:${(Math.random() - .5) * 120}px`;
    box.appendChild(p);
  }
}

document.addEventListener("DOMContentLoaded", init);