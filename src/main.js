import * as THREE from 'three/webgpu';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { U, loadTex, loadArray } from './core/shared.js';
import { createPost } from './core/post.js';
import { Governor } from './core/governor.js';
import { generateCity, CITY } from './city/layout.js';
import { buildLightmap } from './city/lightmap.js';
import { createBuildings } from './city/buildings.js';
import FAC from './city/facades.json';
import { createGround, LAYER_NOREFL, LAYER_KIT } from './city/ground.js';
import { loadFacadeKits, createFacadeKit } from './city/facadekit.js';
import { loadShopKit, createShopKit } from './city/shopkit.js';
import { loadDistrict, createDistrict, groundUV, insideRegion, EXPO } from './city/district.js';
import { createSky } from './atmos/sky.js';
import { createClouds } from './atmos/clouds.js';
import { installFog } from './atmos/fog.js';
import { FlyCam } from './debug/flycam.js';
import { createSigns } from './city/signs.js';
import { createAdScreens, drawAdAtlas, loadAdFonts, createAviationLights } from './city/adscreens.js';
import { createProps } from './city/props.js';
import { createZenith } from './city/zenith.js';
import './ui/base.css';
import './ui/ui.css';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { drawCityMap } from './ui/citymap.js';
import { createTouch, isTouch } from './ui/touch.js';
import { Sound } from './audio/audio.js';
import { Lightning } from './atmos/lightning.js';
import { buildRuns, buildShards, RunVisuals, RunBook } from './game/runs.js';
import { Game } from './game/game.js';
import { Attract } from './game/attract.js';
import { Bot } from './debug/bot.js';
import { cullChunks } from './city/instancing.js';
import { createKiteModel, createReflectionProbe } from './vehicle/model.js';
import { Kite } from './vehicle/kite.js';
import { CameraRig } from './vehicle/camera.js';
import { Input } from './core/input.js';
import { buildHeightmap } from './city/heightmap.js';
import { createRain } from './atmos/rain.js';
import { Traffic } from './life/traffic.js';
import { SkyTraffic } from './life/skytraffic.js';

const params = new URLSearchParams(location.search);

const DEFAULTS = { quality: 'auto', rain: 1, volume: 0.8, music: 0.6, fov: 60, hud: 1, shake: 1 };
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('nz.settings') || '{}') }; } catch { return { ...DEFAULTS }; }
}

const ui = document.getElementById('ui');
ui.insertAdjacentHTML('beforeend', `<div id="fade"></div><div id="loader"><div class="lw">
  <div class="lt"><b>NEON ZENITH</b> · 네온 제니스</div><div class="bar"><i></i></div><div class="st">시작하는 중</div></div></div>`);
const loaderBar = ui.querySelector('#loader .bar i'), loaderSt = ui.querySelector('#loader .st');
function progress(f, text) {
  loaderBar.style.width = `${Math.round(f * 100)}%`;
  loaderSt.textContent = text;
  return new Promise((r) => requestAnimationFrame(() => r()));
}

async function loadTextures() {
  const [roadAlbedo, roadNormal, roadRao, walkAlbedo, walkNormal, walkRao, concreteAlbedo, shutterAlbedo, signs, facAlbedo, facMask, facNormal, shopAlbedo, shopMask] = await Promise.all([
    loadTex(`${import.meta.env.BASE_URL}tex/road_albedo.webp`, { srgb: true }),
    loadTex(`${import.meta.env.BASE_URL}tex/road_normal.webp`),
    loadTex(`${import.meta.env.BASE_URL}tex/road_rao.webp`),
    loadTex(`${import.meta.env.BASE_URL}tex/walk_albedo.webp`, { srgb: true }),
    loadTex(`${import.meta.env.BASE_URL}tex/walk_normal.webp`),
    loadTex(`${import.meta.env.BASE_URL}tex/walk_rao.webp`),
    loadTex(`${import.meta.env.BASE_URL}tex/concrete_albedo.webp`, { srgb: true }),
    loadTex(`${import.meta.env.BASE_URL}tex/shutter_albedo.webp`, { srgb: true }),
    loadTex(`${import.meta.env.BASE_URL}tex/signs.webp`, { srgb: true, repeat: false }),
    loadArray(`${import.meta.env.BASE_URL}tex/facade_albedo.webp`, FAC.size, { srgb: true }),
    loadArray(`${import.meta.env.BASE_URL}tex/facade_mask.webp`, FAC.maskSize),
    loadArray(`${import.meta.env.BASE_URL}tex/facade_normal.webp`, FAC.normalSize),
    loadTex(`${import.meta.env.BASE_URL}tex/shop_albedo.webp`, { srgb: true }),
    loadTex(`${import.meta.env.BASE_URL}tex/shop_mask.webp`),
  ]);
  const env = await new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}tex/env_night.hdr`);
  env.mapping = THREE.EquirectangularReflectionMapping;
  // the panorama's lamps peak at ~20000 against a p99.9 of ~47; a smooth pane mirrors such a texel as a white flare,
  // so they are capped (half floats of positive values order like their bits)
  const cap = THREE.DataUtils.toHalfFloat(64);
  const d = env.image.data;
  for (let i = 0; i < d.length; i++) if ((i & 3) !== 3 && (d[i] & 0x7fff) > cap) d[i] = d[i] & 0x8000 ? 0 : cap;
  const facades = { albedo: facAlbedo, mask: facMask, normal: facNormal };
  return { roadAlbedo, roadNormal, roadRao, walkAlbedo, walkNormal, walkRao, concreteAlbedo, shutterAlbedo, signs, env, facades, shopAlbedo, shopMask };
}

async function boot() {
  // Canvas text does not trigger font loading. Load every Korean glyph used by the UI and ads first.
  const koreanGlyphs = '가각간감강같개거것게경계고곡곳공과곽관광교구국군귀그근글금급기까깨꺼끄끼나날남납낮내냅너넘넣네노녹높누뉴느는늘능니닉다단닫달당대더던데델도동두뒤드든들듭등디딤딧딩따또뚫뛰라래량러럴렇레려력로록롬롭료루룽류륙르른를름리릭림립링마만많말맞멋메며면명모목무문미믿바발밝밤방백버번범법베보복볼부북불붐붕브비빅빌빕빗빛사삼상새생샤서선설섬성세섹센셰소속수스슬습승시신심씨아악안애야약어업없었에역연영옛오온올완외왼요우운울원웡웨위유으은을음의이인일임입있자작장재저적전점정제젠져조종좋좌죠주준줄중즈지직진질짐집쪽차착창처청체최축출취측층치카컨컴케켜코콘콜콰크클키킵타탈택터테텍템토통퉁트티틱파판패편포폭폰풍프플픽하한할합항해했행향허현혔호화확환활횡효후휠휴흔';
  await Promise.all([400, 500, 600, 700, 800, 900].map(weight => document.fonts.load(`${weight} 16px "Noto Sans KR Variable"`, koreanGlyphs)));
  const canvas = document.getElementById('gl');
  const webgpu = !!navigator.gpu && !params.has('webgl');
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance', reversedDepthBuffer: webgpu, forceWebGL: !webgpu });
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  await renderer.init();
  await progress(0.08, '텍스처 불러오는 중');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.25, 12000);
  camera.layers.enable(LAYER_NOREFL);
  camera.layers.enable(LAYER_KIT);

  const [tex, city, kits, shopKitData, districtData] = await Promise.all([loadTextures(), Promise.resolve(generateCity()), loadFacadeKits(), loadShopKit(), loadDistrict(renderer, { small: isTouch() })]);
  scene.environment = tex.env;
  scene.environmentIntensity = 0.1;
  scene.environmentRotation.y = 1.2;

  await progress(0.3, '도시 생성 중');
  const lightmap = buildLightmap(city);
  // inside Temple Street the light at street level is Blender's; the consumers scale this map by ~2.4 against albedo
  lightmap.district = { ground: districtData.ground, uv: groundUV, inside: insideRegion, scale: EXPO / 2.4 };
  installFog(scene, lightmap);

  const sky = createSky();
  scene.add(sky.mesh);
  const clouds = createClouds(lightmap);
  scene.add(clouds.group);
  const buildings = createBuildings(city, tex, lightmap, tex.facades, new Set(kits.map((k) => k.meta.layer)));
  scene.add(buildings.group);
  const facadeKit = createFacadeKit(city, kits, tex.facades, lightmap, tex);
  scene.add(facadeKit.group);
  const district = createDistrict(districtData);
  scene.add(district.group);
  const shopKit = createShopKit(city, shopKitData, lightmap);
  scene.add(shopKit.group);
  const ground = createGround(city, tex, lightmap);
  scene.add(ground.group);
  const signs = createSigns(city, tex);
  scene.add(signs.group);
  await loadAdFonts();
  const ads = createAdScreens(city, drawAdAtlas(isTouch()));
  scene.add(ads.group);
  scene.add(createAviationLights(city).group);
  const props = createProps(city, tex, lightmap);
  scene.add(props.group);
  scene.add(createZenith(city).group);
  const heightTex = buildHeightmap(city);
  const rain = createRain(lightmap, heightTex);
  scene.add(rain.group);
  const traffic = new Traffic(city, lightmap);
  await traffic.load();
  scene.add(traffic.group);
  const sky2 = new SkyTraffic(city);
  scene.add(sky2.group);

  await progress(0.55, '교통과 날씨 준비 중');
  const hemi = new THREE.HemisphereLight(0x3a3060, 0x120a14, 0.35);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8090c0, 0.25);
  moon.position.copy(U.moonDir.value).multiplyScalar(1000);
  scene.add(moon);

  const post = createPost(renderer, scene, camera);
  const gov = new Governor((s) => post.setScale(s), { min: 0.5, max: 1 });

  const probe = createReflectionProbe(128);
  const model = createKiteModel(probe.texture);
  await model.userData.build(lightmap);
  scene.add(model);
  const kite = new Kite(city, model);
  const street = city.xs.reduce((a, l) => (l.w < 20 && Math.abs(l.p + 720) < Math.abs(a.p + 720) ? l : a), city.xs[0]);
  kite.place(street.p - 5.4, 0, -150, 0); // pulled in at the kerb, mid-block
  const rig = new CameraRig(camera, kite, city);
  const input = new Input();

  const runs = buildRuns(city);
  const shards = buildShards(city);
  const visuals = new RunVisuals();
  scene.add(visuals.group);
  const settings = loadSettings();
  const sound = new Sound(settings);
  const lightning = new Lightning((d) => sound.thunder(d));
  const mapImage = drawCityMap(city);
  const book = new RunBook(runs);
  const touch = isTouch();
  if (touch) ui.classList.add('touch');
  const hud = new Hud(ui, mapImage);
  hud.onPrompt = () => input.queue.push('confirm');
  let game;
  const screens = new Screens(ui, {
    settings, runs: book, mapImage,
    onStart: () => game.startFree(),
    onResume: () => game.pauseToggle(),
    onRun: (i) => game.startRun(i),
    onReset: () => game.reset(),
    onEndRun: () => game.endRun(),
    onWaypoint: (x, z) => game.setWaypoint(x, z),
    onUi: () => { sound.start(); sound.ui(); },
    onSetting: (k) => applySetting(k),
  });
  const touchUi = createTouch(ui, input);
  const fade = ui.querySelector('#fade');
  const attract = new Attract(camera, kite, city, fade);
  function applySetting(k) {
    try { localStorage.setItem('nz.settings', JSON.stringify(settings)); } catch {}
    if (k === 'quality' || k === 'all') {
      const q = settings.quality;
      gov.locked = q !== 'auto';
      const scale = { auto: gov.scale, high: 1, medium: 0.75, low: 0.58 }[q];
      gov.scale = scale;
      post.setScale(scale);
      rain.setQuality(q === 'low' ? 0.45 : q === 'medium' ? 0.75 : 1);
    }
    if (k === 'rain' || k === 'all') { U.rain.value = settings.rain; rain.group.visible = settings.rain > 0; }
    if (k === 'volume' || k === 'music' || k === 'all') sound.applySettings();
    if (k === 'fov' || k === 'all') rig.fovBase = settings.fov;
    if (k === 'hud' || k === 'all') { hud.show(!!settings.hud && game && game.state !== 'title'); }
    if (k === 'shake' || k === 'all') rig.shakeScale = settings.shake;
  }
  game = new Game({ city, kite, rig, camera, input, hud, screens, sound, visuals, runs, book, shards, settings, attract, traffic, skyTraffic: sky2, touch });
  applySetting('all');

  const fly = new FlyCam(camera, canvas);
  const cam = params.get('cam');
  fly.enabled = !!cam || params.has('fly');
  if (cam) {
    const [x, y, z, yaw, pitch] = cam.split(',').map(Number);
    fly.set(x, y, z, yaw, pitch);
  }
  const car = params.get('car');
  if (car) {
    const [x, y, z, yaw] = car.split(',').map(Number);
    kite.place(x, y, z, yaw);
  }

  facadeKit.update(camera.position, true);
  shopKit.list(U.kitCenter.value);
  district.warm();
  // warm-up: compile every pipeline and upload every buffer now, so nothing hitches the first time it comes into view
  {
    const touched = [];
    scene.traverse((o) => {
      if (o.isMesh || o.isGroup) touched.push([o, o.visible, o.frustumCulled]);
      if (o.isMesh) o.frustumCulled = false;
      o.visible = true;
    });
    await progress(0.75, '셰이더 컴파일 중');
    // compileAsync builds for the current render target, and the scene is never drawn straight to the canvas: it goes
    // into the post pass, the ground mirror and the car's cube probe. Compiled for the canvas, every one of those
    // variants was built synchronously in the first frames instead (a 0.5–3 s freeze on the title screen).
    // The render context is also keyed by call depth, and compileAsync always looks its context up at depth 0. The
    // scene pass draws at depth 2: the output quad renders FXAA's render-to-texture, which renders the scene pass.
    // Measured with renderer._renderContexts; if the post chain changes, so does this number.
    const prevTarget = renderer.getRenderTarget();
    const contexts = renderer._renderContexts, getContext = contexts.get;
    const jobs = [];
    for (const [target, cam, depth] of [[post.scenePass.renderTarget, camera, 2], [ground.reflRT, ground.mirrorCam, 0], [probe.rt, probe.cam.children[0], 0]]) {
      renderer.setRenderTarget(target);
      contexts.get = (rt, mrt) => getContext.call(contexts, rt, mrt, depth);
      jobs.push(renderer.compileAsync(scene, cam));
      contexts.get = getContext;
    }
    renderer.setRenderTarget(prevTarget);
    await Promise.all(jobs);
    await progress(0.95, '시동 거는 중');
    ground.updateReflection(renderer, scene, camera, true);
    post.render();
    for (const [o, v, f] of touched) { o.visible = v; o.frustumCulled = f; }
    district.update(camera);
  }

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  let last = performance.now();
  let prevCam = camera.position.clone();
  const t0 = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    gov.tick(now - last);
    last = now;
    // the traffic moves to where this frame draws it before the car is moved and pushed out of it, or every
    // collision would be against where the traffic was a frame ago
    U.time.value = (now - t0) / 1000;
    traffic.update(dt, camera.position, U.time.value, kite);
    if (fly.enabled) fly.update(dt);
    else game.update(dt);
    lightning.update(dt, camera.position);
    U.carPos.value.copy(kite.pos);
    U.carFwd.value.copy(kite.fwd);
    U.camPos.value.copy(camera.position);
    U.camVel.value.copy(camera.position).sub(prevCam).divideScalar(Math.max(dt, 1e-3));
    prevCam.copy(camera.position);
    sky.update(camera);
    if (facadeKit.update(camera.position)) shopKit.list(U.kitCenter.value);
    district.update(camera);
    cullChunks(scene, camera.position);
    clouds.update(camera);
    probe.update(renderer, scene, kite.model.position, [kite.model, rain.group], 2);
    ground.updateReflection(renderer, scene, camera);
    post.render();
  }
  probe.update(renderer, scene, kite.model.position, [kite.model, rain.group], 6);
  renderer.setAnimationLoop(frame);

  await progress(1, '준비 완료');
  ui.querySelector('#loader').classList.add('done');
  if (touch) touchUi.show(true);
  const runParam = params.get('run');
  if (fly.enabled) hud.show(false);
  else if (runParam !== null) { game.startFree(); game.startRun(+runParam); }
  else if (params.has('play')) game.startFree();
  else game.title();
  if (params.has('bot')) game.bot = new Bot();
  if (touch) game.touchUi = touchUi;

  window.__nz = { renderer, scene, camera, post, gov, city, lightmap, fly, U, ground, facadeKit, shopKit, district, kite, rig, input, traffic, game, runs, shards, sound, hud, screens, ready: true, backend: renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl' };
}

boot().catch((e) => {
  console.error(e);
  const msg = !navigator.gpu && /WebGL|context/i.test(String(e)) ? '이 브라우저에서 WebGL 또는 WebGPU를 시작할 수 없습니다.' : String(e.message || e);
  ui.querySelector('#loader .lw')?.insertAdjacentHTML('beforeend', `<div class="err">${msg}</div>`);
});
