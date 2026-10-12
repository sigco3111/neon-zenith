// Title, pause (settings, controls, runs), full map and run results.
import { MAP, toMap, districtLabels } from './citymap.js';
import { fmtTime } from './hud.js';
import { CITY } from '../city/layout.js';

const CONTROLS = [
  ['가속 / 제동', 'W / S'],
  ['방향 조작', 'A / D'],
  ['상승', 'SPACE'],
  ['하강', 'C'],
  ['부스트', 'SHIFT'],
  ['드리프트', 'SHIFT + 고속에서 방향 조작'],
  ['카메라', 'V'],
  ['지도', 'M'],
  ['도로로 복귀', 'R'],
  ['경적', 'F'],
  ['라디오 켜기 / 끄기', 'B'],
  ['메뉴', 'ESC'],
  ['게임패드', 'RT/LT · 왼쪽 스틱 조향 · 오른쪽 스틱 상승/하강 · RB 부스트'],
];

const REPO = 'https://github.com/billpwchan/neon-zenith';
const SITE = new URL(import.meta.env.BASE_URL, location.origin).href.replace(/\/$/, '');

// third-party models in the build, and what each licence asks
const CREDITS = [
  ['Lotus Esprit Hover GT 2076', 'maomornity', 'CC BY 4.0', '79fef7f8b1174bf69305e8c28431d26d', 'your car'],
  ['Toyota Crown Comfort (Hong Kong taxi)', 'zxgod118', 'CC BY 4.0', 'a8f3ad22901643809ca72450ac3cc5f6', 'taxis'],
  ['Generic passenger car pack', 'comrade1280', 'CC BY 4.0', '20f9af9b8a404d5cb022ac6fe87f21f5', 'private cars'],
  ['toyota coaster 2017', 'Emmetv96', 'CC BY 4.0', 'b59e858adf6944ecba44bd4ce88acfa5', 'minibuses'],
  ['Low Poly 2013 Toyota HiAce', 'Alvin.Woodly', 'CC BY 4.0', 'f83b4ed4d8534efb81def77b6c1b642d', 'vans'],
  ['Hong Kong KMB Bus Game Ready', 'softmind', 'CC BY 4.0', '1e0d21d8fb1d426c80f65e11c11abdd7', 'buses'],
  ['Asian Shop Pack Free Gameready', 'abhayexe', 'CC BY 4.0', '2f603ad8d5c640f7b9794f6916f9fbdd', 'shopfronts'],
  ['Procedural Hong Kong building', 'udayjeet', 'CC BY 4.0', '528a732e84c44fd49c4726f341014a23', 'facade kit'],
  ['Full Gameready City Buildings III [HongKong]', 'abhayexe', 'CC BY 4.0', '03a5255bb9624d4e82cb8e15e0070b70', 'facades, facade kit'],
  ['Japanese Vending Machine', 'filadog', 'CC BY 4.0', '4768555100004c75b5167d1aa02c683b', 'Temple Street'],
];

export class Screens {
  constructor(root, { settings, runs, onStart, onResume, onRun, onSetting, onReset, onWaypoint, onEndRun, onUi, mapImage }) {
    this.root = root;
    this.settings = settings;
    this.runs = runs;
    this.cb = { onStart, onResume, onRun, onSetting, onReset, onWaypoint, onEndRun, onUi };
    this.mapImage = mapImage;
    this.open = null;
    root.insertAdjacentHTML('beforeend', `
      <div id="title" class="hidden">
        <div class="t-wrap">
          <div class="t-kicker">카오룽 · 2077 · 비 내리는 밤</div>
          <div class="t-zh"><span>네온</span><span>제니스</span></div>
          <div class="t-en">NEON ZENITH</div>
          <div class="t-tag">비 내리는 수직 도시. 야시장 거리를 달리고, 하늘 항로를 따라 구름층을 뚫고, 높이 1,418m의 제니스에 착륙하세요.<br><span class="zh">야시장에서 구름 위까지, 도시를 자유롭게 누비세요.</span></div>
          <div class="t-menu">
            <button class="btn primary" data-act="start"><span class="zh">출발</span>자유 비행</button>
            <button class="btn" data-act="runs"><span class="zh">코스</span>타임어택</button>
            <button class="btn" data-act="settings"><span class="zh">설정</span>환경 설정</button>
            <button class="btn" data-act="controls"><span class="zh">조작</span>조작법</button>
            <button class="btn" data-act="credits"><span class="zh">제작 정보</span>크레딧</button>
            <a class="btn ghost" href="${REPO}" target="_blank" rel="noopener"><span class="zh">소스</span>GITHUB ★</a>
          </div>
          <div class="t-press">ENTER 키로 시작</div>
        </div>
        <div class="t-foot">WEBGPU · THREE.JS · BLENDER CYCLES 조명<br>POLY HAVEN CC0 · 모델 CC BY · 폰트 OFL</div>
      </div>
      <div id="pause" class="screen hidden"><div class="sheet"></div></div>
      <div id="mapscreen" class="screen hidden">
        <canvas></canvas>
        <div class="map-legend">
          <h3><span class="zh">지도</span>도시 지도</h3>
          <div><i style="background:#3be8ff;transform:rotate(45deg)"></i>현재 위치</div>
          <div><i style="background:#ffb547;border-radius:50%"></i>코스 출발점</div>
          <div><i style="background:#ff3df2;transform:rotate(45deg)"></i>데이터 샤드</div>
          <div><i style="background:#ff3df2;border-radius:50%"></i>제니스</div>
          <div><i style="border:1px solid #3be8ff"></i>목적지</div>
        </div>
        <button class="btn map-close interactive" data-act="closemap"><span class="zh">닫기</span>닫기 · M</button>
        <div class="map-tip">클릭: 목적지 지정 · 드래그: 지도 이동 · 휠: 확대/축소</div>
      </div>
      <div id="results" class="screen hidden"><div class="sheet"></div></div>`);
    this.title = root.querySelector('#title');
    this.pause = root.querySelector('#pause');
    this.pauseSheet = this.pause.querySelector('.sheet');
    this.mapEl = root.querySelector('#mapscreen');
    this.mapCanvas = this.mapEl.querySelector('canvas');
    this.results = root.querySelector('#results');
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      this.cb.onUi?.();
      this.act(b.dataset.act, b.dataset);
    });
    root.addEventListener('click', (e) => { const a = e.target.closest('a[target=_blank]'); if (a) setTimeout(() => a.blur(), 0); });
    this.view = { cx: 0, cz: 0, zoom: 1 };
    this.bindMap();
  }

  act(a, data) {
    const cb = this.cb;
    if (a === 'start') cb.onStart();
    else if (a === 'resume') cb.onResume();
    else if (a === 'runs') this.showPause('runs');
    else if (a === 'settings') this.showPause('settings');
    else if (a === 'controls') this.showPause('controls');
    else if (a === 'credits') this.showPause('credits');
    else if (a === 'menu') this.showPause('menu');
    else if (a === 'run') cb.onRun(+data.i);
    else if (a === 'reset') cb.onReset();
    else if (a === 'endrun') { this.closePause(); cb.onEndRun(); }
    else if (a === 'closemap') this.closeMap();
    else if (a === 'set') { this.settings[data.k] = isNaN(+data.v) ? data.v : +data.v; cb.onSetting(data.k); this.showPause(this.tab); }
    else if (a === 'closeres') this.closeResults();
    else if (a === 'retry') { this.closeResults(); cb.onRun(+data.i); }
    else if (a === 'share') this.shareRun(+data.i, +data.t, data.m);
  }

  showTitle(on) {
    this.title.classList.toggle('hidden', !on);
    if (!on) return;
    const spans = this.title.querySelectorAll('.t-zh span');
    // ignite the four characters one by one, like tubes catching
    spans.forEach((s, i) => setTimeout(() => s.classList.add('on'), 500 + i * 360 + (i === 2 ? 220 : 0)));
    setTimeout(() => this.title.querySelectorAll('.t-en, .t-tag, .t-menu, .t-press').forEach((e) => e.classList.add('on')), 1500);
  }

  hideTitle() {
    this.title.classList.add('out');
    setTimeout(() => this.title.classList.add('hidden'), 800);
  }

  showPause(tab = 'menu') {
    this.tab = tab;
    this.open = 'pause';
    this.pause.classList.remove('hidden');
    const s = this.settings;
    const seg = (k, opts) => `<span class="seg">${opts.map(([v, l]) => `<button class="${String(s[k]) === String(v) ? 'on' : ''}" data-act="set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</span>`;
    const slider = (k, min, max, step) => `<span class="val">${s[k]}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-k="${k}">`;
    const tabs = `<div class="tabs">
      <button class="btn ${tab === 'menu' ? 'sel' : ''}" data-act="menu"><span class="zh">일시정지</span>일시정지 중</button>
      <button class="btn ${tab === 'runs' ? 'sel' : ''}" data-act="runs"><span class="zh">코스</span>타임어택</button>
      <button class="btn ${tab === 'settings' ? 'sel' : ''}" data-act="settings"><span class="zh">설정</span>환경 설정</button>
      <button class="btn ${tab === 'controls' ? 'sel' : ''}" data-act="controls"><span class="zh">조작</span>조작법</button>
      <button class="btn ${tab === 'credits' ? 'sel' : ''}" data-act="credits"><span class="zh">제작 정보</span>크레딧</button></div>`;
    let body = '';
    if (tab === 'menu') {
      body = `<div class="runs">
        <div class="runc" data-act="resume"><div class="ix">▶</div><div class="nm"><span class="zh">계속</span><small>계속하기 · ESC</small></div><div></div></div>
        ${this.inRun
          ? `<div class="runc" data-act="reset"><div class="ix">↺</div><div class="nm"><span class="zh">다시 시작</span><small>코스 재시작 · R</small></div><div></div></div>
        <div class="runc" data-act="endrun"><div class="ix">×</div><div class="nm"><span class="zh">코스 종료</span><small>그만하기</small></div><div></div></div>`
          : `<div class="runc" data-act="reset"><div class="ix">↺</div><div class="nm"><span class="zh">도로로 복귀</span><small>도로로 복귀 · R</small></div><div></div></div>`}
      </div>`;
    } else if (tab === 'runs') {
      body = `<div class="runs">${this.runs.list.map((r, i) => {
        const best = this.runs.best(i);
        const medal = best ? this.runs.medal(i, best) : null;
        return `<div class="runc" data-act="run" data-i="${i}"><div class="ix">0${i + 1}</div><div class="nm"><span class="zh">${r.zh}</span><small>${r.en}</small><div class="ds">${r.desc}</div></div>
          <div class="bt">${best ? `<b>${fmtTime(best)}${medal ? `<span class="medal ${medal}"></span>` : ''}</b>최고 기록` : `<b>—</b>금메달 ${fmtTime(r.medals[0])}`}</div></div>`;
      }).join('')}</div>`;
    } else if (tab === 'settings') {
      body = `
        <div class="row"><span><span class="zh">화질</span>그래픽</span>${seg('quality', [['auto', '자동'], ['high', '높음'], ['medium', '중간'], ['low', '낮음']])}</div>
        <div class="row"><span><span class="zh">강우량</span>비</span>${seg('rain', [[1, '폭우'], [0.6, '보통'], [0.25, '이슬비'], [0, '끄기']])}</div>
        <div class="row"><span><span class="zh">전체 음량</span>전체 소리</span><span>${slider('volume', 0, 1, 0.05)}</span></div>
        <div class="row"><span><span class="zh">음악</span>음악 음량</span><span>${slider('music', 0, 1, 0.05)}</span></div>
        <div class="row"><span><span class="zh">시야각</span>시야 범위</span><span>${slider('fov', 50, 80, 1)}</span></div>
        <div class="row"><span><span class="zh">화면 정보</span>HUD</span>${seg('hud', [[1, '켜기'], [0, '끄기']])}</div>
        <div class="row"><span><span class="zh">카메라 흔들림</span>흔들림 효과</span>${seg('shake', [[1, '켜기'], [0, '끄기']])}</div>`;
    } else if (tab === 'credits') {
      body = `<div class="cred">${CREDITS.map(([name, by, lic, id, use]) => `<a href="https://sketchfab.com/3d-models/${id}" target="_blank" rel="noopener"><span>${name}<small>${use}</small></span><span>${by}<small>${lic}</small></span></a>`).join('')}
        <p>Textures, air-conditioners, crates and bags: Poly Haven, CC0. Distant office facades: ambientCG, CC0. Fonts: Noto Sans KR (SIL OFL 1.1; see third-party-notices/Noto-Sans-KR-OFL.txt), Chiron Hei HK, Chiron Sung HK, Oxanium, JetBrains Mono, Monoton, Tilt Neon, Neonderthaw, LXGW WenKai TC, Noto Serif TC, under the SIL Open Font License. The models were re-exported and compressed for the web, and the building models sliced and rendered into facades; <a href="${REPO}/blob/main/CREDITS.md" target="_blank" rel="noopener">CREDITS.md</a> has the details. Licences: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>, <a href="https://openfontlicense.org" target="_blank" rel="noopener">SIL OFL 1.1</a>, <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0</a>.</p>
        <p class="src"><span class="zh">源碼</span>Neon Zenith is open source under the MIT licence: <a href="${REPO}" target="_blank" rel="noopener">github.com/billpwchan/neon-zenith</a> ★</p></div>`;
    } else {
      body = `<div class="ctl">${CONTROLS.map(([a, k]) => `<div><span>${a}</span><span>${k}</span></div>`).join('')}</div>`;
    }
    this.pauseSheet.innerHTML = `<h2><span class="zh">메뉴</span>NEON ZENITH</h2>${tabs}${body}`;
    this.pauseSheet.querySelectorAll('input[type=range]').forEach((inp) => {
      inp.addEventListener('input', () => {
        this.settings[inp.dataset.k] = +inp.value;
        inp.previousElementSibling.textContent = inp.value;
        this.cb.onSetting(inp.dataset.k);
      });
    });
  }

  closePause() {
    this.pause.classList.add('hidden');
    if (this.open === 'pause') this.open = null;
  }

  // ---- map ----
  bindMap() {
    const c = this.mapCanvas;
    let drag = null, moved = false;
    c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cz: this.view.cz }; moved = false; });
    addEventListener('pointerup', (e) => {
      if (drag && !moved && this.open === 'map') {
        const p = this.screenToWorld(e.clientX, e.clientY);
        this.cb.onWaypoint(p.x, p.z);
      }
      drag = null;
    });
    addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      const s = this.mapScale();
      this.view.cx = drag.cx - dx / s;
      this.view.cz = drag.cz - dy / s;
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.view.zoom = Math.max(0.6, Math.min(5, this.view.zoom * Math.exp(-e.deltaY * 0.0015)));
    }, { passive: false });
  }

  mapScale() {
    const r = this.mapCanvas.getBoundingClientRect();
    return (Math.min(r.width, r.height) / (MAP.extent * 2)) * this.view.zoom;
  }

  screenToWorld(px, py) {
    const r = this.mapCanvas.getBoundingClientRect();
    const s = this.mapScale();
    return { x: this.view.cx + (px - r.left - r.width / 2) / s, z: this.view.cz + (py - r.top - r.height / 2) / s };
  }

  openMap(player) {
    this.open = 'map';
    this.mapEl.classList.remove('hidden');
    this.view.cx = player.x * 0.5;
    this.view.cz = player.z * 0.5;
    this.view.zoom = 1.15;
  }

  closeMap() {
    this.mapEl.classList.add('hidden');
    if (this.open === 'map') this.open = null;
  }

  drawMap(state) {
    if (this.open !== 'map') return;
    const c = this.mapCanvas;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const r = c.getBoundingClientRect();
    if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#03040a';
    g.fillRect(0, 0, r.width, r.height);
    const s = this.mapScale();
    const k = MAP.size / (MAP.extent * 2);
    const ox = r.width / 2 - this.view.cx * s, oz = r.height / 2 - this.view.cz * s;
    const W = (x) => ox + x * s, Z = (z) => oz + z * s;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.mapImage, W(-MAP.extent), Z(-MAP.extent), MAP.size / k * s, MAP.size / k * s);
    // district names
    g.textAlign = 'center';
    for (const d of districtLabels()) {
      g.fillStyle = 'rgba(232,240,255,0.75)';
      g.font = `600 ${Math.round(13 + this.view.zoom * 2)}px "Noto Sans KR Variable", "Chiron Hei HK Variable", sans-serif`;
      g.fillText(d.zh, W(d.x), Z(d.z));
      g.fillStyle = 'rgba(190,205,235,0.45)';
      g.font = `500 9px "Noto Sans KR Variable", "Oxanium Variable", sans-serif`;
      g.fillText(d.en, W(d.x), Z(d.z) + 14);
    }
    // markers
    for (const m of state.markers) {
      g.save();
      g.translate(W(m.x), Z(m.z));
      if (m.label) { g.fillStyle = m.color; g.font = '500 10px "Noto Sans KR Variable", "Oxanium Variable"'; g.textAlign = 'left'; g.fillText(m.label, 9, 4); }
      g.fillStyle = m.color; g.strokeStyle = m.color;
      if (m.shape === 'ring') { g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.stroke(); }
      else if (m.shape === 'dot') { g.beginPath(); g.arc(0, 0, 4.5, 0, Math.PI * 2); g.fill(); }
      else { g.rotate(Math.PI / 4); g.globalAlpha = m.dim ? 0.3 : 1; g.fillRect(-3.5, -3.5, 7, 7); }
      g.restore();
    }
    // player
    g.save();
    g.translate(W(state.player.x), Z(state.player.z));
    g.rotate(state.player.bearing);
    g.fillStyle = '#3be8ff';
    g.shadowColor = '#3be8ff'; g.shadowBlur = 10;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill();
    g.restore();
  }

  // ---- results ----
  showResults(i, time, best, medal, newBest) {
    this.open = 'results';
    this.lastRun = i;
    const r = this.runs.list[i];
    const sheet = this.results.querySelector('.sheet');
    const names = ['금메달', '은메달', '동메달'];
    sheet.innerHTML = `<h2><span class="zh">${r.zh}</span>${r.en}</h2>
      <div class="sub">${newBest ? '새 최고 기록!' : '코스 완주'}</div>
      <div class="big">${fmtTime(time)}</div>
      <div class="sub">최고 기록 ${fmtTime(best)}</div>
      <div class="medalrow">${r.medals.map((m, k) => `<span class="${time <= m ? 'got' : ''}">${names[k]} ${fmtTime(m)}<span class="medal ${['gold', 'silver', 'bronze'][k]}" style="opacity:${time <= m ? 1 : 0.2}"></span></span>`).join('')}</div>
      <div class="foot"><button class="btn" data-act="share" data-i="${i}" data-t="${time}" data-m="${medal || ''}"><span class="zh">공유</span>기록 공유</button><button class="btn" data-act="retry" data-i="${i}"><span class="zh">다시</span>재도전 · R</button><button class="btn primary" data-act="closeres"><span class="zh">계속</span>계속하기 · ENTER</button></div>
      <a class="src" href="${REPO}" target="_blank" rel="noopener"><span class="zh">소스</span>GITHUB 공개 소스 ★</a>`;
    this.results.classList.remove('hidden');
  }

  // a time to beat travels with a link that drops the reader straight into the same run
  async shareRun(i, t, medal) {
    const r = this.runs.list[i];
    const url = `${SITE}/?run=${i}`;
    const text = `${r.en} ${r.zh} · ${fmtTime(t)}${medal ? ` · ${{ gold: '금메달', silver: '은메달', bronze: '동메달' }[medal]}` : ''} · 네온 제니스. 브라우저에서 이 기록에 도전하세요:`;
    const btn = this.results.querySelector('[data-act=share]');
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: 'Neon Zenith 네온 제니스', text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      btn.innerHTML = '<span class="zh">복사 완료</span>링크를 복사했어요';
    } catch { /* share sheet dismissed or clipboard denied */ }
  }

  closeResults() {
    this.results.classList.add('hidden');
    if (this.open === 'results') this.open = null;
  }
}
