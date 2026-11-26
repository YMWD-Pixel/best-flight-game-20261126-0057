// The HUD: a DOM overlay on top of the 3D view — instruments, compass strip,
// fuel and throttle gauges, mission progress, messages, the title / pause /
// end screens, and a live minimap drawn on a small canvas.

import { PALETTE } from './config.js';
import { MISSION_DEFS } from './world.js';
import { ISLANDS, RUNWAYS } from './terrain.js';

function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function createHud(root) {
  const hud = el('div', 'hud', root);
  const topLeft = el('div', 'hud-panel hud-tl', hud);
  const speedEl = el('div', 'hud-big', topLeft);
  const speedLabel = el('div', 'hud-label', topLeft);
  speedLabel.textContent = 'KNOTS';
  const altEl = el('div', 'hud-big', topLeft);
  const altLabel = el('div', 'hud-label', topLeft);
  altLabel.textContent = 'ALTITUDE FT';
  const vsEl = el('div', 'hud-small', topLeft);

  const compass = el('div', 'hud-compass', hud);
  const compassStrip = el('div', 'hud-compass-strip', compass);
  const compassNeedle = el('div', 'hud-compass-needle', compass);
  compassNeedle.textContent = '▲';
  const hdgEl = el('div', 'hud-hdg', compass);

  const topRight = el('div', 'hud-panel hud-tr', hud);
  const scoreEl = el('div', 'hud-big', topRight);
  const scoreLabel = el('div', 'hud-label', topRight);
  scoreLabel.textContent = 'SCORE';
  const fuelWrap = el('div', 'hud-gauge', topRight);
  el('span', 'hud-label', fuelWrap).textContent = 'FUEL';
  const fuelBar = el('div', 'hud-bar', fuelWrap);
  const fuelFill = el('div', 'hud-bar-fill fuel', fuelBar);
  const thrWrap = el('div', 'hud-gauge', topRight);
  el('span', 'hud-label', thrWrap).textContent = 'THROTTLE';
  const thrBar = el('div', 'hud-bar', thrWrap);
  const thrFill = el('div', 'hud-bar-fill throttle', thrBar);
  const missionEl = el('div', 'hud-small', topRight);
  const timerEl = el('div', 'hud-small', topRight);

  const mapWrap = el('div', 'hud-map-wrap', hud);
  const mapCanvas = el('canvas', 'hud-map', mapWrap);
  mapCanvas.width = 190;
  mapCanvas.height = 190;
  const mapCtx = mapCanvas.getContext('2d');

  const msgEl = el('div', 'hud-message', hud);
  const hintEl = el('div', 'hud-hint', hud);
  hintEl.textContent = '↑↓ pitch · ←→ bank · W/S throttle · Space brake · P pause · M mute';

  const cross = el('div', 'hud-cross', hud);
  cross.textContent = '+';
  const arrowEl = el('div', 'hud-arrow', hud);

  // Screens.
  const screenEl = el('div', 'hud-screen', root);
  const screenCard = el('div', 'hud-card', screenEl);
  const screenTitle = el('h1', '', screenCard);
  const screenSub = el('p', 'hud-sub', screenCard);
  const screenBody = el('div', 'hud-body', screenCard);
  const screenBtns = el('div', 'hud-btns', screenCard);
  const screenFoot = el('p', 'hud-foot', screenCard);

  function showScreen({ title, sub, bodyHtml, buttons, foot }) {
    screenTitle.textContent = title;
    screenSub.textContent = sub || '';
    screenBody.innerHTML = bodyHtml || '';
    screenBtns.innerHTML = '';
    for (const b of buttons || []) {
      const btn = el('button', 'hud-btn', screenBtns);
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
    }
    screenFoot.textContent = foot || '';
    screenEl.classList.add('visible');
    hud.classList.remove('visible');
  }

  function hideScreen() {
    screenEl.classList.remove('visible');
    hud.classList.add('visible');
  }

  function showTitle(best, onStart) {
    const missions = MISSION_DEFS.map((m) => `
      <div class="hud-mission"><b>[${m.key}] ${m.name}</b><span>${m.blurb}</span></div>`).join('');
    showScreen({
      title: 'AZURE ISLES',
      sub: 'Sky Courier — a bush-plane run over the Azure Isles',
      bodyHtml: `<div class="hud-missions">${missions}</div>
        <p class="hud-controls">Fly with <b>↑ ↓ ← →</b> or the <b>mouse</b> (hold left button),
        <b>W / S</b> for throttle, <b>Space</b> to brake. Land slow and level on a
        runway — hit the ground hard and the courier is over.</p>
        ${best > 0 ? `<p class="hud-best">Best score: ${best}</p>` : ''}`,
      buttons: MISSION_DEFS.map((m) => ({ label: `Fly: ${m.name}`, onClick: () => onStart(m.id) })),
      foot: 'An original game — built for the make.fun flight bounty.',
    });
  }

  function showPause(onResume, onQuit) {
    showScreen({
      title: 'PAUSED',
      sub: 'The Isles wait for no pilot — except now.',
      buttons: [
        { label: 'Resume (P)', onClick: onResume },
        { label: 'Back to title', onClick: onQuit },
      ],
    });
  }

  function showEnd({ title, sub, bodyHtml, score, best, onRestart, onQuit }) {
    showScreen({
      title,
      sub,
      bodyHtml: `${bodyHtml || ''}<p class="hud-best">Score ${score}${best > 0 ? ` · Best ${best}` : ''}</p>`,
      buttons: [
        { label: 'Fly again (R)', onClick: onRestart },
        { label: 'Change mission', onClick: onQuit },
      ],
      foot: 'Press R to fly again.',
    });
  }

  function update(plane, world, dt) {
    const p = plane.state;
    const kts = Math.round(p.speed * 1.944);
    const ft = Math.round(p.pos.y * 3.281);
    speedEl.textContent = String(kts);
    altEl.textContent = String(ft);
    const vs = Math.round(p.verticalSpeed * 196.85);
    vsEl.textContent = `V/S ${vs >= 0 ? '+' : ''}${vs} ft/min`;
    vsEl.style.color = vs < -1500 ? PALETTE.hudBad : PALETTE.hudText;

    const hdg = ((Math.round((-p.heading * 180) / Math.PI) % 360) + 360) % 360;
    hdgEl.textContent = `${String(hdg).padStart(3, '0')}°`;
    // Compass strip: marks scroll so the heading sits under the needle.
    // Each slot shows the nearest 15° mark, so the strip is never blank.
    let strip = '';
    for (let off = -60; off <= 60; off += 15) {
      const d = ((hdg + off) % 360 + 360) % 360;
      const nearest = (Math.round(d / 15) * 15) % 360;
      const label = nearest === 0 ? 'N' : nearest === 90 ? 'E' : nearest === 180 ? 'S' : nearest === 270 ? 'W' : String(nearest);
      const cls = nearest % 90 === 0 ? 'major' : '';
      strip += `<span class="${cls}">${label}</span>`;
    }
    compassStrip.innerHTML = strip;

    scoreEl.textContent = String(world.state.score);
    const fuelPct = Math.round((p.fuel / 100) * 100);
    fuelFill.style.width = `${fuelPct}%`;
    fuelFill.style.background = fuelPct < 20 ? PALETTE.hudBad : fuelPct < 45 ? PALETTE.hudWarn : PALETTE.hudGood;
    thrFill.style.width = `${Math.round(p.throttle * 100)}%`;

    const w = world.state;
    if (w.missionId === 'ring') {
      missionEl.textContent = `Rings ${w.nextRing} / ${w.rings.length}`;
      timerEl.textContent = `Time ${fmtTime(Math.max(0, w.timeLeft))}`;
      timerEl.style.color = w.timeLeft < 30 ? PALETTE.hudBad : PALETTE.hudText;
    } else if (w.missionId === 'hop') {
      const next = RUNWAYS[w.hopIndex];
      missionEl.textContent = `Stops ${w.hopsDone} / ${RUNWAYS.length}${next ? ` — next ${next.name}` : ''}`;
      timerEl.textContent = '';
    } else {
      missionEl.textContent = `Crates ${w.cratesGot} / ${w.crates.length}`;
      timerEl.textContent = '';
    }

    if (w.message && w.messageUntil > 0) {
      msgEl.textContent = w.message;
      msgEl.classList.add('visible');
    } else {
      msgEl.classList.remove('visible');
    }

    // Next-target arrow: points toward the current ring / runway / crate.
    let target = null;
    if (w.missionId === 'ring') target = world.ringTarget();
    else if (w.missionId === 'hop') {
      const rw = world.hopTarget();
      if (rw) target = { x: rw.x, y: 20, z: rw.z };
    } else {
      const left = w.crates.filter((c) => !c.taken);
      if (left.length) {
        let bestD = Infinity;
        for (const c of left) {
          const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
          if (d < bestD) { bestD = d; target = c; }
        }
      }
    }
    if (target && w.running && !w.finished) {
      const dx = target.x - p.pos.x;
      const dz = target.z - p.pos.z;
      const worldAng = Math.atan2(-dx, -dz);
      const rel = worldAng - p.heading;
      arrowEl.textContent = '➤';
      arrowEl.style.transform = `translateX(-50%) rotate(${rel} rad)`;
      arrowEl.classList.add('visible');
      const dist = Math.round(Math.hypot(dx, dz));
      arrowEl.title = `${dist} m`;
    } else {
      arrowEl.classList.remove('visible');
    }

    drawMinimap(p, world);
  }

  function drawMinimap(p, world) {
    const ctx = mapCtx;
    const S = 190;
    const scale = S / 4400;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#164a63';
    ctx.fillRect(0, 0, S, S);
    // Islands as green blobs.
    ctx.fillStyle = '#4d8a4a';
    for (const isl of ISLANDS) {
      ctx.beginPath();
      ctx.arc((isl.x + 2200) * scale, (isl.z + 2200) * scale, isl.r * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    // Runways.
    ctx.fillStyle = '#e8e8e8';
    for (const rw of RUNWAYS) {
      ctx.save();
      ctx.translate((rw.x + 2200) * scale, (rw.z + 2200) * scale);
      ctx.rotate(rw.heading);
      ctx.fillRect(-2, -14, 4, 28);
      ctx.restore();
    }
    // Next ring / crates.
    const w = world.state;
    if (w.missionId === 'ring') {
      const t = world.ringTarget();
      if (t) {
        ctx.strokeStyle = '#2fd47c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc((t.x + 2200) * scale, (t.z + 2200) * scale, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (w.missionId === 'free') {
      ctx.fillStyle = '#ff8c1a';
      for (const c of w.crates) {
        if (c.taken) continue;
        ctx.fillRect((c.x + 2200) * scale - 2, (c.z + 2200) * scale - 2, 4, 4);
      }
    }
    // Plane.
    ctx.save();
    ctx.translate((p.pos.x + 2200) * scale, (p.pos.z + 2200) * scale);
    ctx.rotate(-p.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return { update, showTitle, showPause, showEnd, hideScreen };
}
