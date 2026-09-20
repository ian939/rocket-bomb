/* WebAudio 로 소리를 합성한다. 음원 파일이 없어 다운로드도 지연도 없다.
 *
 * iOS 사파리 주의 — AudioContext 는 사용자가 실제로 누른 순간 안에서
 * resume() 해야 소리가 난다. unlock() 을 시작 버튼 click 핸들러에서 부를 것.
 * 이걸 빠뜨리면 첫 판이 통째로 무음이 된다.
 */
(function (global) {
  'use strict';

  let ctx = null;
  let master = null;
  let enabled = true;

  let tickTimer = null;     // 다음 똑딱을 예약한 setTimeout
  let tickIntervalMs = 1000;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    return ctx;
  }

  /** 반드시 사용자 제스처(click/touchend) 핸들러 안에서 부른다. */
  function unlock() {
    const c = ensureCtx();
    if (!c) return Promise.resolve(false);
    const done = c.state === 'suspended' ? c.resume() : Promise.resolve();
    return done.then(() => {
      // 무음 버퍼를 한 번 흘려보내야 확실히 열린다
      const buf = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(master);
      src.start(0);
      return true;
    }).catch(() => false);
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) stopTick();
  }

  /** 단순 오실레이터 한 방. */
  function blip(type, freq, durMs, gain, when) {
    if (!enabled) return;
    const c = ensureCtx();
    if (!c || c.state !== 'running') return;

    const t = when || c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
    osc.connect(g); g.connect(master);
    osc.start(t);
    osc.stop(t + durMs / 1000 + 0.02);
  }

  /* ----------------------------------------------------------- 개별 소리 */

  function tick() {
    blip('square', 800, 40, 0.18);
  }

  function correct() {
    if (!enabled) return;
    const c = ensureCtx();
    if (!c) return;
    const t = c.currentTime;
    blip('sine', 523.25, 90, 0.3, t);          // C5
    blip('sine', 659.25, 140, 0.3, t + 0.09);  // E5
  }

  function wrong() {
    blip('sawtooth', 200, 250, 0.25);
  }

  /** 화이트 노이즈 버스트 + 저역 통과 스윕. */
  function explode() {
    if (!enabled) return;
    const c = ensureCtx();
    if (!c || c.state !== 'running') return;

    const dur = 1.2;
    const t = c.currentTime;
    const frames = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      // 뒤로 갈수록 잦아들게 — 그냥 노이즈면 "쉬익" 하고 끝난다
      const decay = Math.pow(1 - i / frames, 2.2);
      data[i] = (Math.random() * 2 - 1) * decay;
    }

    const src = c.createBufferSource();
    src.buffer = buf;

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + dur);

    const g = c.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter); filter.connect(g); g.connect(master);
    src.start(t);

    // 배를 울리는 저음 한 방을 겹친다
    const sub = c.createOscillator();
    const sg = c.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(90, t);
    sub.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    sg.gain.setValueAtTime(0.6, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    sub.connect(sg); sg.connect(master);
    sub.start(t); sub.stop(t + 0.75);
  }

  /* ------------------------------------------------------------ 똑딱 루프 */

  function scheduleNextTick() {
    tickTimer = global.setTimeout(() => {
      if (tickTimer === null) return;
      tick();
      scheduleNextTick();
    }, tickIntervalMs);
  }

  function startTick(intervalMs) {
    stopTick();
    tickIntervalMs = intervalMs;
    scheduleNextTick();
  }

  /** 간격만 바꾼다. 이미 예약된 다음 한 번은 그대로 울리고 그 다음부터 적용. */
  function setTickInterval(intervalMs) {
    if (intervalMs === tickIntervalMs) return;
    tickIntervalMs = intervalMs;
    if (tickTimer !== null) startTick(intervalMs);
  }

  function stopTick() {
    if (tickTimer !== null) {
      global.clearTimeout(tickTimer);
      tickTimer = null;
    }
  }

  global.Sound = {
    unlock: unlock,
    setEnabled: setEnabled,
    correct: correct,
    wrong: wrong,
    explode: explode,
    startTick: startTick,
    setTickInterval: setTickInterval,
    stopTick: stopTick
  };
})(window);
