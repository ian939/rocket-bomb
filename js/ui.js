/* 화면 그리기와 사람 손이 닿는 부분. 규칙은 game.js 가 들고 있다. */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const CH = window.Game.CHARACTERS;

  /* 자리 배치와 회전각은 game.js 의 SEAT_PLANS 가 인원수에 맞게 준다.
   * 위쪽에 앉은 사람은 180°, 아래쪽은 0°. 패드를 사이에 두고 마주본다. */

  let game = null;
  let busy = false;          // 연출 중에는 입력을 받지 않는다
  const timers = [];

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearLater() { timers.forEach(clearTimeout); timers.length = 0; }

  /* ---------------------------------------------------------- 화면 전환 */

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
    $('#' + id).classList.add('on');
  }

  /* ============================================================== S1 설정 */

  /* 최대 4명분을 들고 있다가 playerCount 만큼만 쓴다.
   * 인원을 줄였다 늘려도 앞서 적은 이름이 살아 있다. */
  const ALL_SEATS = [
    { name: '', type: 'kid',   character: 'meowth' },
    { name: '', type: 'adult', character: 'roy' },
    { name: '', type: 'kid',   character: 'wobbuffet' },
    { name: '', type: 'adult', character: 'rosa' }
  ];
  let playerCount = 4;

  /** 지금 쓰는 참가자만 */
  function activeSetup() { return ALL_SEATS.slice(0, playerCount); }

  /* 인원수에 따라 자리 이름이 달라진다 (game.js SEAT_PLANS 와 짝) */
  const SEAT_LABEL = {
    2: ['위쪽', '아래쪽'],
    3: ['왼쪽 위', '오른쪽 위', '아래쪽'],
    4: ['왼쪽 위', '오른쪽 위', '왼쪽 아래', '오른쪽 아래']
  };

  function renderSetup() {
    const grid = $('#seat-grid');
    grid.innerHTML = '';
    grid.dataset.count = String(playerCount);

    const labels = SEAT_LABEL[playerCount];

    activeSetup().forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'seat-card';

      // 지금 쓰는 사람들끼리만 캐릭터 중복을 따진다
      const taken = activeSetup().filter((q, j) => j !== i).map((q) => q.character);

      card.innerHTML =
        '<h3>' + (i + 1) + '번 · ' + labels[i] + '</h3>' +
        '<input class="name-input" type="text" maxlength="6" placeholder="이름 (비우면 캐릭터 이름)" value="' +
          escapeAttr(p.name) + '">' +
        '<div class="type-row">' +
          '<button class="type-btn' + (p.type === 'kid' ? ' on' : '') + '" data-type="kid">' +
            '아이<span class="hint">쉬운 문제</span></button>' +
          '<button class="type-btn' + (p.type === 'adult' ? ' on' : '') + '" data-type="adult">' +
            '어른<span class="hint">어려운 문제</span></button>' +
        '</div>' +
        '<div class="char-row">' +
          CH.map((c) =>
            '<button class="char-btn' +
              (p.character === c.id ? ' on' : '') +
              (taken.indexOf(c.id) >= 0 ? ' taken' : '') +
            '" data-char="' + c.id + '"><img src="' + c.img + '" alt="' + c.name + '"></button>'
          ).join('') +
        '</div>';

      card.querySelector('.name-input').addEventListener('input', (e) => {
        p.name = e.target.value.trim();
      });
      card.querySelectorAll('.type-btn').forEach((b) => {
        b.addEventListener('click', () => { p.type = b.dataset.type; renderSetup(); });
      });
      card.querySelectorAll('.char-btn').forEach((b) => {
        b.addEventListener('click', () => {
          const want = b.dataset.char;
          // 이미 남이 쓰고 있으면 서로 맞바꾼다 — 고르다 막히는 일이 없게
          const other = activeSetup().find((q) => q !== p && q.character === want);
          if (other) other.character = p.character;
          p.character = want;
          renderSetup();
        });
      });

      grid.appendChild(card);
    });

    syncCountUI();
  }

  function syncCountUI() {
    document.querySelectorAll('#count-row .count-btn').forEach((b) => {
      b.classList.toggle('on', +b.dataset.n === playerCount);
    });
    document.querySelectorAll('#level-row .level-btn').forEach((b) => {
      b.classList.toggle('on', +b.dataset.lv === settings.adultLevel);
    });
    document.querySelectorAll('#time-row .time-btn').forEach((b) => {
      b.classList.toggle('on', +b.dataset.ti === settings.timeIndex);
    });
    // 어른이 아무도 없으면 난이도 고르기가 의미 없다
    const anyAdult = activeSetup().some((p) => p.type === 'adult');
    const lvRow = $('#level-row');
    if (lvRow) lvRow.classList.toggle('dim', !anyAdult);
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  /* ============================================================== S2 준비 */

  function renderReady() {
    const box = $('#ready-order');
    box.innerHTML = '';
    const list = activeSetup();
    list.forEach((p, i) => {
      const c = CH.find((x) => x.id === p.character);
      const chip = document.createElement('div');
      chip.className = 'ready-chip';
      chip.innerHTML =
        '<img src="' + c.img + '" alt="">' +
        '<span>' + escapeAttr(p.name || c.name) + '</span>' +
        '<span class="tag">' + (p.type === 'kid' ? '아이' : '어른') + '</span>';
      box.appendChild(chip);
      if (i < list.length - 1) {
        const ar = document.createElement('div');
        ar.className = 'ready-arrow';
        ar.textContent = '→';
        box.appendChild(ar);
      }
    });
  }

  /* ============================================================ S3 플레이 */

  function buildQuads() {
    const grid = $('#quad-grid');
    grid.innerHTML = '';
    grid.dataset.count = String(game.state.players.length);

    game.state.players.forEach((p) => {
      const c = CH.find((x) => x.id === p.character);

      const quad = document.createElement('div');
      quad.className = 'quad';
      quad.dataset.seat = p.seat;
      quad.dataset.rot = String(p.rot);
      quad.style.setProperty('--area', p.area);
      quad.innerHTML =
        '<div class="idle-face">' +
          '<div class="nm">' + escapeAttr(p.name) +
            ' <span class="tag">' + (p.type === 'kid' ? '아이' : '어른') + '</span></div>' +
          '<img src="' + c.img + '" alt="" style="--cs:' + c.scale + '">' +
          '<div class="hearts idle-hearts"></div>' +
        '</div>' +
        '<div class="quad-inner">' +
          '<div class="quad-head">' +
            '<img src="' + c.img + '" alt="">' +
            '<span class="nm">' + escapeAttr(p.name) + '</span>' +
            '<span class="tag">' + (p.type === 'kid' ? '아이' : '어른') + '</span>' +
            '<span class="hearts"></span>' +
          '</div>' +
          '<div class="q-body">' +
            '<div class="q-text"></div>' +
            '<div class="q-choices">' +
              '<button class="choice" data-i="0"></button>' +
              '<button class="choice" data-i="1"></button>' +
              '<button class="choice" data-i="2"></button>' +
              '<button class="choice" data-i="3"></button>' +
            '</div>' +
          '</div>' +
        '</div>';

      quad.querySelectorAll('.choice').forEach((btn) => {
        btn.addEventListener('click', () => onChoice(+btn.dataset.i, quad, btn));
      });

      grid.appendChild(quad);
    });

    sizeQuads();
  }

  /* 90°/270° 로 돌린 칸은 가로세로가 뒤바뀐 크기여야 한다.
   * CSS 만으로는 부모 크기를 바꿔 쓸 수 없어 실제 픽셀을 변수로 넣는다. */
  function sizeQuads() {
    document.querySelectorAll('.quad').forEach((q) => {
      const r = q.getBoundingClientRect();
      q.style.setProperty('--qw', r.width + 'px');
      q.style.setProperty('--qh', r.height + 'px');
    });
  }

  function renderTurn() {
    const cur = game.currentPlayer();
    const q = game.state.currentQuestion;

    document.querySelectorAll('.quad').forEach((quad) => {
      const seat = quad.dataset.seat;
      const p = game.state.players.find((x) => x.seat === seat);
      const live = p.id === cur.id;
      quad.classList.toggle('live', live);

      // 하트 — 아이는 그 턴에 남은 기회, 어른은 판 전체 목숨
      const left = p.type === 'kid' ? (2 - p.wrongThisTurn) : p.livesLeft;
      const hearts =
        '<span' + (left >= 1 ? '' : ' class="gone"') + '>♥</span>' +
        '<span' + (left >= 2 ? '' : ' class="gone"') + '>♥</span>';
      quad.querySelectorAll('.hearts').forEach((h) => { h.innerHTML = hearts; });

      if (live && q) {
        quad.querySelector('.q-text').textContent = q.text;
        quad.querySelectorAll('.choice').forEach((btn, i) => {
          btn.textContent = q.choices[i];
          btn.className = 'choice';
          btn.disabled = false;
        });
      }
    });

    moveBomb(cur.seat);
  }

  /* 폭탄은 지금 차례인 구역 쪽으로 옮긴다.
   * 인원마다 구역 모양이 달라 좌표를 고정할 수 없어 실제 위치를 재서 쓴다. */
  function moveBomb(seat) {
    const bomb = $('#bomb');
    const quad = document.querySelector('.quad[data-seat="' + seat + '"]');
    const grid = $('#quad-grid');
    if (!quad || !grid) return;

    const q = quad.getBoundingClientRect();
    const g = grid.getBoundingClientRect();
    const cx = g.left + g.width / 2;
    const cy = g.top + g.height / 2;

    // 화면 한가운데에서 그 구역 중심 쪽으로 조금만 다가간다
    const dx = (q.left + q.width / 2) - cx;
    const dy = (q.top + q.height / 2) - cy;
    const len = Math.hypot(dx, dy) || 1;
    const reach = Math.min(len * 0.34, 46);

    bomb.style.setProperty('--bomb-x', '50%');
    bomb.style.setProperty('--bomb-y', '50%');
    bomb.style.transform =
      'translate(' + Math.round(dx / len * reach) + 'px,' +
                     Math.round(dy / len * reach) + 'px) ' +
      'rotate(' + (dx < 0 ? -14 : 14) + 'deg)';
  }

  function onChoice(i, quad, btn) {
    if (busy || game.isPaused()) return;
    const q = game.state.currentQuestion;
    if (!q) return;

    busy = true;
    const correctBtn = quad.querySelectorAll('.choice')[q.answerIndex];
    const result = game.answer(i);

    if (result === 'correct') {
      btn.classList.add('is-correct');
      window.Sound.correct();
      later(() => { busy = false; renderTurn(); }, 520);

    } else if (result === 'warn') {
      btn.classList.add('is-wrong');
      btn.disabled = true;
      window.Sound.wrong();
      later(() => {
        game.retryQuestion();
        busy = false;
        renderTurn();
      }, 620);

    } else if (result === 'boom') {
      btn.classList.add('is-wrong');
      correctBtn.classList.add('is-correct');   // 답이 뭐였는지는 보여준다
      // busy 는 boom 연출이 끝나고 풀린다
    } else {
      busy = false;
    }
  }

  /* ------------------------------------------------------------ 템포 */

  function applyTempo(intervalMs, ratio) {
    window.Sound.setTickInterval(intervalMs);
    $('#bomb').style.setProperty('--pulse', intervalMs + 'ms');
    $('#bomb').classList.add('pulse');

    const edge = $('#edge-pulse');
    edge.classList.toggle('warm', ratio <= 0.25 && ratio > 0.10);
    edge.classList.toggle('hot', ratio <= 0.10);
  }

  /* ------------------------------------------------------------ 폭발 */

  function playBoom(data) {
    busy = true;
    window.Sound.stopTick();
    window.Sound.explode();

    const gentle = game.state.settings.gentle;
    const flashOn = game.state.settings.flash;

    const flash = $('#flash');
    flash.className = '';
    void flash.offsetWidth;                      // 애니메이션 재시작
    flash.classList.add(flashOn && !gentle ? 'go' : 'gentle');

    const art = $('#boom-art');
    art.className = '';
    void art.offsetWidth;
    art.classList.add('go');

    const root = $('#shake-root');
    root.classList.remove('shaking', 'shaking-soft');
    void root.offsetWidth;
    root.classList.add(gentle ? 'shaking-soft' : 'shaking');

    $('#bomb').classList.remove('pulse');
    $('#edge-pulse').className = '';

    later(() => {
      root.classList.remove('shaking', 'shaking-soft');
      showResult(data.cause);
      busy = false;
    }, 1250);
  }

  function showResult(cause) {
    game.toResult();
    const p = game.state.players.find((x) => x.id === game.state.loserId);
    const c = CH.find((x) => x.id === p.character);

    $('#result-face').src = c.img;
    $('#result-title').innerHTML = '<span class="who">' + escapeAttr(p.name) + '</span> 폭발! 💥';
    $('#result-cause').textContent =
      cause === 'timeout' ? '시간이 다 됐어요' : '두 번 틀렸어요';
    show('screen-result');
  }

  /* ============================================================== 시작 */

  function buildGame() {
    game = window.Game.create({
      question: () => { if (!busy) renderTurn(); },
      tempo: (d) => applyTempo(d.intervalMs, d.ratioLeft),
      boom: (d) => playBoom(d),
      pause: () => { $('#pause-veil').classList.add('on'); window.Sound.stopTick(); },
      resume: () => { $('#pause-veil').classList.remove('on'); }
    });
    game.setPlayers(activeSetup());
  }

  function beginRound() {
    buildQuads();
    game.startRound();
    renderTurn();
    window.Sound.startTick(1000);
    show('screen-play');
    requestAnimationFrame(sizeQuads);
  }

  /* ============================================================ 이벤트 */

  function wire() {
    $('#btn-to-ready').addEventListener('click', () => {
      // 이름을 비운 사람은 캐릭터 이름으로 채운다
      activeSetup().forEach((p) => {
        if (!p.name) p.name = CH.find((c) => c.id === p.character).name;
      });
      const kids = activeSetup().filter((p) => p.type === 'kid').length;
      $('#setup-warn').textContent =
        kids === 0 ? '아이가 없어도 시작은 됩니다 — 모두 어려운 문제를 풉니다.' : '';
      renderReady();
      show('screen-ready');
    });

    $('#btn-back-setup').addEventListener('click', () => { renderSetup(); show('screen-setup'); });

    $('#btn-start').addEventListener('click', () => {
      // iOS: 사용자가 실제로 누른 이 순간에 소리를 열어야 한다
      window.Sound.unlock().then(() => {
        buildGame();
        applySettings();
        beginRound();
      });
    });

    $('#btn-again').addEventListener('click', () => {
      window.Sound.unlock().then(beginRound);
    });
    $('#btn-change').addEventListener('click', () => {
      window.Sound.stopTick();
      renderSetup();
      show('screen-setup');
    });
    $('#btn-resume').addEventListener('click', () => {
      window.Sound.unlock().then(() => {
        game.resume();
        window.Sound.startTick(1000);
      });
    });

    // 토글
    const tg = (el, key) => {
      el.addEventListener('click', () => {
        el.classList.toggle('on');
        settings[key] = el.classList.contains('on');
        applySettings();
      });
    };
    tg($('#tg-sound'), 'sound');
    tg($('#tg-flash'), 'flash');
    tg($('#tg-gentle'), 'gentle');

    // 인원 — 줄였다 늘려도 앞서 적은 이름이 살아 있다
    document.querySelectorAll('#count-row .count-btn').forEach((b) => {
      b.addEventListener('click', () => {
        playerCount = +b.dataset.n;
        renderSetup();
      });
    });

    // 어른 난이도
    document.querySelectorAll('#level-row .level-btn').forEach((b) => {
      b.addEventListener('click', () => {
        settings.adultLevel = +b.dataset.lv;
        applySettings();
        syncCountUI();
      });
    });

    // 한 판 시간 (고른 값에서 ±20초 흔들린다)
    document.querySelectorAll('#time-row .time-btn').forEach((b) => {
      b.addEventListener('click', () => {
        settings.timeIndex = +b.dataset.ti;
        applySettings();
        syncCountUI();
      });
    });

    // 화면이 가려지면 판을 멈춘다 — 실수로 홈 버튼을 눌러 터지면 억울하다
    document.addEventListener('visibilitychange', () => {
      if (!game) return;
      if (document.hidden) game.pause();
    });
    window.addEventListener('blur', () => { if (game) game.pause(); });

    window.addEventListener('resize', () => later(sizeQuads, 60));
    window.addEventListener('orientationchange', () => later(sizeQuads, 260));
  }

  const settings = { sound: true, flash: true, gentle: false, adultLevel: 3, timeIndex: 1 };

  function applySettings() {
    window.Sound.setEnabled(settings.sound);
    if (game) {
      game.state.settings.sound = settings.sound;
      game.state.settings.flash = settings.flash;
      game.state.settings.gentle = settings.gentle;
      game.state.settings.adultLevel = settings.adultLevel;
      game.state.settings.timeIndex = settings.timeIndex;
    }
  }

  /* -------------------------------------------------------- 저장/복원 */

  const STORE = 'rocket-bomb.v1';

  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (Array.isArray(d.players)) {
        d.players.forEach((p, i) => {
          if (!ALL_SEATS[i]) return;
          ALL_SEATS[i].name = typeof p.name === 'string' ? p.name.slice(0, 6) : '';
          if (p.type === 'kid' || p.type === 'adult') ALL_SEATS[i].type = p.type;
          if (CH.some((c) => c.id === p.character)) ALL_SEATS[i].character = p.character;
        });
      }
      if (d.settings) {
        ['sound', 'flash', 'gentle'].forEach((k) => {
          if (typeof d.settings[k] === 'boolean') settings[k] = d.settings[k];
        });
        if ([1, 2, 3].indexOf(d.settings.adultLevel) >= 0) settings.adultLevel = d.settings.adultLevel;
        if ([0, 1, 2].indexOf(d.settings.timeIndex) >= 0) settings.timeIndex = d.settings.timeIndex;
      }
      if ([2, 3, 4].indexOf(d.playerCount) >= 0) playerCount = d.playerCount;
    } catch (e) { /* 저장값이 깨졌으면 그냥 기본값으로 */ }
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        players: ALL_SEATS.map((p) => ({ name: p.name, type: p.type, character: p.character })),
        settings: settings,
        playerCount: playerCount
      }));
    } catch (e) { /* 사파리 비공개 모드 등 — 없어도 게임은 돌아간다 */ }
  }

  /* -------------------------------------------------------------- */

  function preloadImages() {
    // 폭발 순간 그림이 늦게 뜨면 연출이 죽는다
    CH.forEach((c) => { const im = new Image(); im.src = c.img; });
    ['assets/bomb.png', 'assets/explosion.png'].forEach((src) => {
      const im = new Image(); im.src = src;
    });
  }

  function syncToggleUI() {
    $('#tg-sound').classList.toggle('on', settings.sound);
    $('#tg-flash').classList.toggle('on', settings.flash);
    $('#tg-gentle').classList.toggle('on', settings.gentle);
  }

  load();
  preloadImages();
  renderSetup();
  syncToggleUI();
  applySettings();
  wire();
  window.addEventListener('beforeunload', save);
  setInterval(save, 5000);

  // 개발·검증용
  window.__ui = {
    get game() { return game; },
    beginRound: beginRound,
    get setup() { return activeSetup(); },
    show: show,
    settings: settings,
    setCount: (n) => { playerCount = n; renderSetup(); },
    setLevel: (lv) => { settings.adultLevel = lv; applySettings(); syncCountUI(); },
    setTime: (ti) => { settings.timeIndex = ti; applySettings(); syncCountUI(); }
  };
})();
