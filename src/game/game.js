// Game flow: title, free ride, timed runs, shards, radio, and the overlays (pause, map, results).
import * as THREE from 'three/webgpu';
import { CITY, districtSeedAt, groundAt } from '../city/layout.js';
import { SKY_ALT } from '../life/skytraffic.js';
import { U } from '../core/shared.js';

const DEG = 180 / Math.PI;
const bearingOf = (dx, dz) => ((Math.atan2(dx, -dz) * DEG) + 360) % 360;
const ZERO = { throttle: 0, steer: 0, lift: 0, boost: false };

const RADIO = {
  liftoff: ['카오룽 관제', '카이트 9호, 항로 진입을 허가합니다. 좌측으로 비행하고 등화를 켜세요.', ''],
  cloud: ['카오룽 관제', '구름 하단은 520m입니다. 계기 비행으로 전환하세요.', ''],
  above: ['네온 FM 88.1', '오늘 밤은 구름 위에 계신가요? 운이 좋네요. 고요한 하늘에 어울리는 곡입니다.', ''],
  pad: ['제니스 착륙장', '착륙 확인, 고도 1,418m. 멋진 비행이었어요, 카이트 9호.', ''],
  fast: ['카오룽 관제', '카이트 9호, 시속 400km를 넘었습니다. 항로 근처에서는 감속하세요.', ''],
  start: ['네온 FM 88.1', '카오룽에는 밤새 비가 내리고 자정 이후 더 거세집니다. 비 조심하시고, 면허 없이는 항로에 진입하지 마세요.', ''],
  shardsAll: ['네온 FM 88.1', '누군가 도시의 모든 샤드를 밝혔네요. 당신을 보고 있어요.', ''],
  district: {
    market: [['야시장이 붐빕니다. 템플 스트리트의 미니버스를 조심하세요.', ''], ['모퉁이 노점은 아직 영업 중이네요. 역시 그렇죠.', '']],
    center: [['유리 빌딩, 유리 같은 빗줄기. 빌딩 사이 하강 기류를 조심하세요.', ''], ['애드미럴티 안내판에 따르면 모든 항로가 원활합니다.', '']],
    estate: [['능선 위 주거 단지. 40층 창문마다 불이 켜져 있습니다.', '']],
    mixed: [['옛 카오룽. 낮은 지붕, 수많은 간판과 전선.', '']],
    docks: [['부두의 컨테이너 크레인. 불은 켜져 있지만 아무도 없네요.', '']],
  },
};

export class Game {
  constructor(o) {
    Object.assign(this, o); // city, kite, rig, camera, input, hud, screens, sound, visuals, runs, book, shards, settings, attract, fadeEl, applySetting
    this.state = 'loading';
    this.run = null;
    this.waypoint = null;
    this.seen = new Set();
    this.lastRadio = -1e9;
    this.clock = 0;
    this.prevPos = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    try { this.collected = new Set(JSON.parse(localStorage.getItem('nz.shards') || '[]')); } catch { this.collected = new Set(); }
    this.visuals.setShards(this.shards, this.collected);
    this.visuals.setBeacons(this.runs, true);
    this.hud.setShards(this.collected.size, this.shards.length);
    this.flags = {};
    this.bot = null;
    this.stats = { hits: 0, hitSum: 0 };
  }

  // ---- flow ----
  title() {
    this.state = 'title';
    this.hud.show(false);
    this.screens.showTitle(true);
    // the title is a film of the city; the run markers are for the game
    this.visuals.showBeacons(false);
    this.attract.start();
  }

  startFree() {
    this.sound.start();
    this.sound.whoosh();
    this.attract.stop();
    this.screens.hideTitle();
    this.visuals.showBeacons(true);
    this.state = 'play';
    this.rig.snap = true;
    this.hud.show(!!this.settings.hud);
    this.hud.setHints(this.touch);
    this.flags.startT = this.clock;
  }

  pauseToggle(tab) {
    if (this.screens.open === 'pause') { this.screens.closePause(); this.sound.ui(); return; }
    if (this.screens.open) return;
    this.screens.inRun = !!this.run;
    this.screens.showPause(tab || 'menu');
    this.sound.ui();
  }

  mapToggle() {
    if (this.screens.open === 'map') { this.screens.closeMap(); return; }
    if (this.screens.open) return;
    this.screens.openMap(this.kite.pos);
    this.sound.ui();
  }

  setWaypoint(x, z) {
    if (this.waypoint && Math.hypot(this.waypoint.x - x, this.waypoint.z - z) < 40) this.waypoint = null;
    else this.waypoint = { x, z };
    this.sound.ui();
  }

  startRun(i) {
    this.sound.start();
    if (this.state === 'title') this.startFree();
    this.screens.closePause();
    this.screens.closeResults();
    const r = this.runs[i];
    this.run = { i, def: r, gate: 0, t: 0, splits: [], best: this.book.splits(i), count: 3.6, deltaT: 0, delta: null };
    this.kite.place(r.start.x, r.start.y, r.start.z, r.yaw);
    this.rig.yaw = r.yaw;
    this.rig.snap = true;
    this.visuals.setGates(r);
    this.visuals.showBeacons(false);
    this.hud.setRun(r);
    this.hud.updateRun(0, 0, r.gates.length, null);
    this.state = 'countdown';
    this.sound.inRun = true;
    this.lastCount = null;
    this.sound.whoosh();
  }

  endRun() {
    this.run = null;
    this.visuals.setGates(null);
    this.visuals.showBeacons(true);
    this.hud.setRun(null);
    this.hud.countdown(null);
    this.sound.inRun = false;
    this.state = 'play';
  }

  finishRun() {
    const r = this.run;
    const t = r.t;
    const better = this.book.record(r.i, t, r.splits);
    const medal = this.book.medal(r.i, t);
    this.sound.fanfare(medal);
    this.screens.showResults(r.i, t, this.book.best(r.i), medal, better);
    this.endRun();
  }

  reset() {
    if (this.run) return this.startRun(this.run.i);
    // back down to the nearest street, facing along it
    const p = this.kite.pos;
    const lx = this.city.xs.reduce((a, l) => (Math.abs(l.p - p.x) < Math.abs(a.p - p.x) ? l : a));
    const lz = this.city.zs.reduce((a, l) => (Math.abs(l.p - p.z) < Math.abs(a.p - p.z) ? l : a));
    const alongX = Math.abs(lx.p - p.x) < Math.abs(lz.p - p.z);
    const x = alongX ? lx.p - 3.2 : THREE.MathUtils.clamp(p.x, -CITY.half + 30, CITY.half - 30);
    const z = alongX ? THREE.MathUtils.clamp(p.z, -CITY.half + 30, CITY.harbourZ - 40) : lz.p + 3.2;
    this.kite.place(x, 0, z, alongX ? 0 : Math.PI / 2);
    this.rig.snap = true;
    this.screens.closePause();
  }

  // ---- per frame ----
  update(dt) {
    this.clock += dt;
    const k = this.kite;
    const actions = this.input.take();
    if (this.state === 'title') {
      this.attract.update(dt);
      for (const a of actions) if (a === 'confirm') this.startFree();
      k.syncModel(dt);
      return;
    }
    if (this.state === 'loading') return;

    for (const a of actions) this.action(a);
    const overlay = this.screens.open;
    if (overlay === 'map') this.screens.drawMap(this.mapState());

    let c = overlay ? ZERO : this.input.poll();
    if (this.bot && !overlay) c = this.bot.controls(this);
    if (this.state === 'countdown') {
      this.run.count -= dt;
      const n = Math.ceil(this.run.count - 0.6);
      if (n !== this.lastCount) {
        this.lastCount = n;
        if (n > 0) { this.hud.countdown(n); this.sound.beep(false); }
        else { this.hud.countdown('출발'); this.sound.beep(true); }
      }
      if (this.run.count <= 0) { this.state = 'run'; this.hud.countdown(null); }
      c = ZERO;
    }

    this.prevPos.copy(k.pos);
    if (!overlay) {
      k.update(dt, c);
      this.traffic.collide(k);
      this.skyTraffic.collide(k, U.time.value);
      // a moving car may have shoved it into something fixed: the fixed thing wins
      k.collide();
      this.rig.update(dt);
    } else k.syncModel(dt);

    for (const e of k.events) {
      if (e === 'liftoff') this.once('liftoff');
      else if (e.type === 'hit') { this.stats.hits++; this.stats.hitSum += e.strength; this.sound.impact(e.strength); this.hud.hit(Math.min(1, e.strength / 25)); }
      else if (e.type === 'land' && e.v > 6) this.sound.impact(e.v * 0.6);
    }
    k.events.length = 0;

    if (this.state === 'run') this.updateRun(dt);
    this.updateShards();
    this.updateWorldFlags();
    this.updateHud(dt, c);
    this.sound.update(dt, {
      speed: k.speed, throttle: c.throttle, boost: k.boosting ? 1 : 0, air: k.mode === 'air', alt: k.pos.y, vy: k.vel.y,
      inCloud: U.inCloud.value, covered: k.mode === 'ground' && k.pos.y > 0.5, paused: !!overlay,
    });
  }

  action(a) {
    const o = this.screens.open;
    if (a === 'pause') { if (o === 'map') this.screens.closeMap(); else if (o === 'results') this.screens.closeResults(); else this.pauseToggle(); }
    else if (a === 'map') this.mapToggle();
    else if (a === 'help') { if (!o) this.pauseToggle('controls'); }
    else if (o === 'results') { if (a === 'confirm') this.screens.closeResults(); else if (a === 'reset') { this.screens.closeResults(); this.startRun(this.screens.lastRun); } }
    else if (o) return;
    else if (a === 'camera') this.rig.cycle();
    else if (a === 'reset') this.reset();
    else if (a === 'horn') this.sound.horn();
    else if (a === 'radio') { const on = this.sound.toggleRadio(); this.hud.toast(on ? '라디오 켜짐' : '라디오 꺼짐', on ? '네온 FM 88.1 청취 중' : '라디오 꺼짐'); }
    else if (a === 'confirm' && this.nearRun !== null && this.nearRun !== undefined && !this.run) this.startRun(this.nearRun);
  }

  updateRun(dt) {
    const r = this.run, d = r.def, k = this.kite;
    r.t += dt;
    const g = d.gates[r.gate];
    const last = r.gate === d.gates.length - 1;
    let passed = false;
    if (last && d.land) {
      passed = k.mode === 'ground' && Math.abs(k.pos.y - g.y) < 3 && Math.hypot(k.pos.x - g.x, k.pos.z - g.z) < 8;
    } else {
      // closest approach of this frame's motion to the gate centre, so fast passes still count
      const ab = this.dir.subVectors(k.pos, this.prevPos);
      const L2 = ab.lengthSq();
      const tt = L2 > 1e-6 ? THREE.MathUtils.clamp(((g.x - this.prevPos.x) * ab.x + (g.y - this.prevPos.y) * ab.y + (g.z - this.prevPos.z) * ab.z) / L2, 0, 1) : 0;
      const cx = this.prevPos.x + ab.x * tt, cy = this.prevPos.y + ab.y * tt, cz = this.prevPos.z + ab.z * tt;
      passed = (cx - g.x) ** 2 + (cy - g.y) ** 2 + (cz - g.z) ** 2 < d.radius * d.radius;
    }
    if (passed) {
      r.splits.push(r.t);
      if (r.best && r.best[r.gate] !== undefined) { r.delta = r.t - r.best[r.gate]; r.deltaT = 3; }
      r.gate++;
      this.visuals.gateState.value = r.gate;
      this.sound.chime(r.gate - 1, d.gates.length);
      if (r.gate >= d.gates.length) return this.finishRun();
    }
    r.deltaT -= dt;
    this.hud.updateRun(r.t, r.gate, d.gates.length, r.deltaT > 0 ? r.delta : null);
  }

  updateShards() {
    const p = this.kite.pos;
    for (let i = 0; i < this.shards.length; i++) {
      if (this.collected.has(i)) continue;
      const s = this.shards[i];
      if ((s.x - p.x) ** 2 + (s.y - p.y - 0.6) ** 2 + (s.z - p.z) ** 2 < 3.4 * 3.4) {
        this.collected.add(i);
        this.visuals.collectShard(i);
        this.sound.shard();
        const n = this.collected.size, N = this.shards.length;
        this.hud.setShards(n, N);
        this.hud.toast('샤드', `샤드 ${n} / ${N}`, 'mag');
        try { localStorage.setItem('nz.shards', JSON.stringify([...this.collected])); } catch {}
        if (n === N) { this.hud.toast('모든 샤드 수집 완료', '도시 전체가 빛납니다', 'big mag'); this.radio(RADIO.shardsAll, true); }
      }
    }
  }

  once(key) {
    if (this.flags[key]) return;
    this.flags[key] = true;
    this.radio(RADIO[key], true);
  }

  radio(line, force) {
    if (!force && this.clock - this.lastRadio < 30) return;
    this.lastRadio = this.clock;
    this.hud.radio(line[0], line[1], line[2]);
  }

  updateWorldFlags() {
    const k = this.kite;
    if (this.state === 'play' && this.flags.startT !== undefined && this.clock - this.flags.startT > 4) { this.once('start'); }
    if (k.pos.y > CITY.cloudBase && k.pos.y < CITY.cloudTop) this.once('cloud');
    if (k.pos.y > CITY.cloudTop + 40) this.once('above');
    if (k.mode === 'ground' && k.pos.y > CITY.zenith.pad - 2 && Math.hypot(k.pos.x, k.pos.z) < 30) this.once('pad');
    if (k.speed * 3.6 > 400) this.once('fast');
    // first visit to a district: maybe a word from the radio
    const d = this.district;
    if (d && !this.seen.has(d.en)) {
      this.seen.add(d.en);
      const pool = RADIO.district[d.type];
      if (pool && this.seen.size > 1 && Math.random() < 0.6) {
        const [en, zh] = pool[Math.floor(Math.random() * pool.length)];
        this.radio(['네온 FM 88.1', en, zh]);
      }
    }
    // run beacons: drive into one to be offered the run
    this.nearRun = null;
    if (!this.run && this.state === 'play') {
      this.runs.forEach((r, i) => {
        if (Math.hypot(k.pos.x - r.start.x, k.pos.z - r.start.z) < 12 && Math.abs(k.pos.y - r.start.y) < 10) this.nearRun = i;
      });
    }
    this.hud.prompt(this.nearRun !== null ? `<span class="key">${this.touch ? '터치' : 'ENTER'}</span>시작<span class="zh">${this.runs[this.nearRun].zh}</span>시작 ${this.runs[this.nearRun].en}` : null);
  }

  updateHud(dt, c) {
    const k = this.kite, cam = this.camera;
    cam.getWorldDirection(this.dir);
    const bearing = bearingOf(this.dir.x, this.dir.z);
    this.district = districtSeedAt(k.pos.x, k.pos.z);
    const markers = [], mapMarkers = [];
    if (this.run) {
      const d = this.run.def;
      for (let i = this.run.gate; i < d.gates.length; i++) {
        const g = d.gates[i];
        mapMarkers.push({ x: g.x, z: g.z, color: i === this.run.gate ? '#ff3df2' : 'rgba(59,232,255,0.6)', shape: 'ring', pin: i === this.run.gate });
      }
      const g = d.gates[this.run.gate];
      if (g) markers.push({ bearing: bearingOf(g.x - k.pos.x, g.z - k.pos.z), color: '#ff3df2' });
    } else {
      this.runs.forEach((r) => {
        mapMarkers.push({ x: r.start.x, z: r.start.z, color: '#ffb547', shape: 'dot', pin: false });
        if (Math.hypot(r.start.x - k.pos.x, r.start.z - k.pos.z) < 900) markers.push({ bearing: bearingOf(r.start.x - k.pos.x, r.start.z - k.pos.z), color: '#ffb547' });
      });
    }
    if (this.waypoint) {
      mapMarkers.push({ x: this.waypoint.x, z: this.waypoint.z, color: '#3be8ff', shape: 'ring', pin: true });
      markers.push({ bearing: bearingOf(this.waypoint.x - k.pos.x, this.waypoint.z - k.pos.z), color: '#3be8ff' });
      if (Math.hypot(this.waypoint.x - k.pos.x, this.waypoint.z - k.pos.z) < 25) { this.waypoint = null; this.hud.toast('', '목적지에 도착했습니다', 'cyan'); }
    }
    this.shards.forEach((s, i) => {
      if (!this.collected.has(i) && Math.hypot(s.x - k.pos.x, s.z - k.pos.z) < 160) mapMarkers.push({ x: s.x, z: s.z, color: '#ff3df2', shape: 'gem' });
    });
    // lane: on a sky-lane altitude over an avenue
    let lane = null;
    if (k.mode === 'air') {
      for (const a of [...SKY_ALT.z, ...SKY_ALT.x]) if (Math.abs(k.pos.y - a) < 7) lane = a;
    }
    this.hud.update({
      speed: k.speed, boost: k.boosting ? 1 : Math.min(1, k.boostHeat || 0), mode: k.mode, lane, district: this.district,
      bearing, heading: -bearing / DEG, x: k.pos.x, z: k.pos.z, alt: k.pos.y, groundY: groundAt(this.city, k.pos.x, k.pos.z, k.pos.y), vy: k.vel.y,
      markers, mapMarkers,
    }, dt);
  }

  mapState() {
    const markers = [];
    this.runs.forEach((r, i) => markers.push({ x: r.start.x, z: r.start.z, color: '#ffb547', shape: 'dot', label: `${String(i + 1).padStart(2, '0')} ${r.en}` }));
    this.shards.forEach((s, i) => markers.push({ x: s.x, z: s.z, color: '#ff3df2', shape: 'gem', dim: this.collected.has(i) }));
    if (this.waypoint) markers.push({ x: this.waypoint.x, z: this.waypoint.z, color: '#3be8ff', shape: 'ring' });
    if (this.run) this.run.def.gates.slice(this.run.gate).forEach((g) => markers.push({ x: g.x, z: g.z, color: '#ff3df2', shape: 'ring' }));
    this.camera.getWorldDirection(this.dir);
    return { markers, player: { x: this.kite.pos.x, z: this.kite.pos.z, bearing: Math.atan2(this.dir.x, -this.dir.z) } };
  }
}
