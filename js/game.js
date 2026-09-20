/* 게임 상태와 규칙. 화면 그리는 일은 ui.js 가 한다.
 *
 * 규칙 요약:
 *   - 아이:  목숨 2개, 매 턴 시작 시 2개로 되돌아온다
 *   - 어른:  목숨 2개, 판 전체에 걸쳐 누적. 0 이 되면 즉시 폭발
 *   - 타이머: 판 전체에 하나. 턴마다 초기화되지 않는다 (그래야 폭탄 돌리기다)
 *
 * 타이머는 남은 초를 세는 변수가 아니라 '끝나는 시각'(endsAt)으로 들고 있다.
 * 패드를 잠그거나 앱을 전환했다 돌아와도 시각이 정확하다.
 */
(function (global) {
  'use strict';

  const SEATS = ['A', 'B', 'C', 'D'];

  const CHARACTERS = [
    { id: 'roy',       name: '로이',   img: 'assets/char-roy.png',       color: '#3b4a8c', scale: 1.00 },
    { id: 'rosa',      name: '로사',   img: 'assets/char-rosa.png',      color: '#a8203a', scale: 1.06 },
    { id: 'meowth',    name: '냐옹',   img: 'assets/char-meowth.png',    color: '#b8862b', scale: 0.92 },
    { id: 'wobbuffet', name: '마자용', img: 'assets/char-wobbuffet.png', color: '#1f5fbf', scale: 0.92 }
  ];

  // 인물 비율이 그림마다 달라(전신/상반신) 그대로 두면 한 명만 작아 보인다.
  // 위 scale 로 눈에 보이는 크기를 맞춘다.

  /* 판 시간은 고른 값에서 ±20초 흔든다 — 대략 얼마인지는 알되
   * 정확히 언제 터질지는 모르게. 긴장감이 사라지지 않는다. */
  const TIME_PRESETS = [60000, 120000, 180000];   // 1분 / 2분 / 3분
  const TIME_JITTER_MS = 20000;
  const ROUND_MIN_MS = 20000;                      // 흔들어도 이보다 짧아지지 않는다

  /* 인원별 자리 배치. 값은 [그리드 영역, 회전각].
   * 2명은 위아래로 마주보고, 3명은 위에 둘·아래 하나(아래쪽이 넓다). */
  const SEAT_PLANS = {
    2: [
      { seat: 'A', area: '1 / 1 / 2 / 3', rot: 180 },
      { seat: 'B', area: '2 / 1 / 3 / 3', rot: 0 }
    ],
    3: [
      { seat: 'A', area: '1 / 1 / 2 / 2', rot: 180 },
      { seat: 'B', area: '1 / 2 / 2 / 3', rot: 180 },
      { seat: 'C', area: '2 / 1 / 3 / 3', rot: 0 }
    ],
    4: [
      { seat: 'A', area: '1 / 1 / 2 / 2', rot: 180 },
      { seat: 'B', area: '1 / 2 / 2 / 3', rot: 180 },
      { seat: 'C', area: '2 / 1 / 3 / 2', rot: 0 },
      { seat: 'D', area: '2 / 2 / 3 / 3', rot: 0 }
    ]
  };

  /** 남은 시간 비율 -> 똑딱 간격(ms). PRD 4.4 */
  function tickIntervalFor(ratioLeft) {
    if (ratioLeft > 0.50) return 1000;
    if (ratioLeft > 0.25) return 600;
    if (ratioLeft > 0.10) return 350;
    return 180;
  }

  function createGame(handlers) {
    const on = handlers || {};

    const state = {
      screen: 'setup',
      players: [],
      turnIndex: 0,
      roundTotalMs: 0,
      endsAt: 0,
      pausedRemainMs: null,   // 화면이 숨겨진 동안의 남은 시간
      usedQuestions: new Set(),
      currentQuestion: null,
      loserId: null,
      settings: {
        sound: true, flash: true, gentle: false,
        adultLevel: 3,        // 어른 난이도 1~3
        timeIndex: 1          // TIME_PRESETS 인덱스 (기본 2분)
      }
    };

    let rafId = null;
    let lastTickInterval = 0;

    /* ----------------------------------------------------------- 참가자 */

    /** 참가자는 2~4명. 자리는 인원수에 맞는 배치로 다시 매긴다. */
    function setPlayers(list) {
      const n = Math.max(2, Math.min(4, list.length));
      const plan = SEAT_PLANS[n];

      state.players = list.slice(0, n).map((p, i) => ({
        id: p.id != null ? p.id : i,
        name: p.name || characterById(p.character).name,
        type: p.type,                 // 'kid' | 'adult'
        character: p.character,
        seat: plan[i].seat,
        area: plan[i].area,
        rot: plan[i].rot,
        livesLeft: 2,
        wrongThisTurn: 0
      }));
    }

    function characterById(id) {
      return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
    }

    function currentPlayer() {
      return state.players[state.turnIndex];
    }

    /* -------------------------------------------------------------- 판 */

    function startRound() {
      state.screen = 'play';
      state.usedQuestions = new Set();
      state.loserId = null;
      state.pausedRemainMs = null;
      state.players.forEach((p) => { p.livesLeft = 2; p.wrongThisTurn = 0; });

      // 시작하는 사람을 매 판 바꾼다 — 늘 같은 사람이 먼저면 불공평하다
      state.turnIndex = Math.floor(Math.random() * state.players.length);

      const base = TIME_PRESETS[state.settings.timeIndex] || TIME_PRESETS[1];
      const jitter = Math.floor((Math.random() * 2 - 1) * TIME_JITTER_MS);
      state.roundTotalMs = Math.max(ROUND_MIN_MS, base + jitter);
      state.endsAt = now() + state.roundTotalMs;

      lastTickInterval = 0;
      nextQuestion();
      startLoop();
      emit('roundStart');
    }

    function nextQuestion() {
      const p = currentPlayer();
      state.currentQuestion = global.Quiz.generate(
        p.type, state.usedQuestions, state.settings.adultLevel);
      emit('question');
    }

    /* ------------------------------------------------------------ 입력 */

    /** 보기를 골랐다. @returns {'correct'|'warn'|'boom'|'ignored'} */
    function answer(choiceIndex) {
      if (state.screen !== 'play' || !state.currentQuestion) return 'ignored';

      const q = state.currentQuestion;
      const p = currentPlayer();

      if (choiceIndex === q.answerIndex) {
        p.wrongThisTurn = 0;
        advanceTurn();
        emit('correct', { playerId: p.id });
        return 'correct';
      }

      p.wrongThisTurn += 1;

      // 어른만 목숨이 판 전체로 누적된다
      if (p.type === 'adult') {
        p.livesLeft -= 1;
        if (p.livesLeft <= 0) { boom('lives'); return 'boom'; }
      } else if (p.wrongThisTurn >= 2) {
        // 아이는 그 턴 안에서 두 번 틀려야 터진다
        boom('lives');
        return 'boom';
      }

      emit('wrong', { playerId: p.id, choiceIndex: choiceIndex });
      return 'warn';
    }

    /** 오답 연출이 끝난 뒤 같은 사람에게 새 문제. */
    function retryQuestion() {
      if (state.screen !== 'play') return;
      nextQuestion();
    }

    function advanceTurn() {
      state.turnIndex = (state.turnIndex + 1) % state.players.length;
      currentPlayer().wrongThisTurn = 0;  // 아이 목숨은 턴마다 초기화
      nextQuestion();
    }

    /* ---------------------------------------------------------- 폭발 */

    function boom(cause) {
      if (state.screen === 'boom' || state.screen === 'result') return;
      stopLoop();
      state.screen = 'boom';
      state.loserId = currentPlayer().id;
      state.currentQuestion = null;
      emit('boom', { playerId: state.loserId, cause: cause });
    }

    function toResult() {
      state.screen = 'result';
      emit('result');
    }

    /* ---------------------------------------------------------- 타이머 */

    function now() {
      return global.performance && global.performance.now
        ? global.performance.now()
        : Date.now();
    }

    function remainMs() {
      if (state.pausedRemainMs != null) return state.pausedRemainMs;
      return Math.max(0, state.endsAt - now());
    }

    function ratioLeft() {
      if (!state.roundTotalMs) return 1;
      return remainMs() / state.roundTotalMs;
    }

    function startLoop() {
      stopLoop();
      const step = () => {
        if (state.screen !== 'play') return;

        if (state.pausedRemainMs == null) {
          const left = remainMs();
          if (left <= 0) { boom('timeout'); return; }

          const want = tickIntervalFor(left / state.roundTotalMs);
          if (want !== lastTickInterval) {
            lastTickInterval = want;
            emit('tempo', { intervalMs: want, ratioLeft: left / state.roundTotalMs });
          }
        }
        rafId = global.requestAnimationFrame(step);
      };
      rafId = global.requestAnimationFrame(step);
    }

    function stopLoop() {
      if (rafId != null) { global.cancelAnimationFrame(rafId); rafId = null; }
    }

    /** 화면이 가려졌다 — 남은 시간을 얼려둔다. 실수로 홈 버튼을 눌러 터지면 억울하다. */
    function pause() {
      if (state.screen !== 'play' || state.pausedRemainMs != null) return;
      state.pausedRemainMs = Math.max(0, state.endsAt - now());
      stopLoop();
      emit('pause');
    }

    function resume() {
      if (state.screen !== 'play' || state.pausedRemainMs == null) return;
      state.endsAt = now() + state.pausedRemainMs;
      state.pausedRemainMs = null;
      lastTickInterval = 0;   // 템포를 다시 알리도록
      startLoop();
      emit('resume');
    }

    function isPaused() { return state.pausedRemainMs != null; }

    /* ------------------------------------------------------------- */

    function emit(name, data) {
      if (typeof on[name] === 'function') on[name](data || {});
    }

    return {
      state: state,
      SEATS: SEATS,
      CHARACTERS: CHARACTERS,
      characterById: characterById,
      setPlayers: setPlayers,
      currentPlayer: currentPlayer,
      startRound: startRound,
      answer: answer,
      retryQuestion: retryQuestion,
      toResult: toResult,
      pause: pause,
      resume: resume,
      isPaused: isPaused,
      remainMs: remainMs,
      ratioLeft: ratioLeft,
      seatPlan: function () { return SEAT_PLANS[state.players.length] || SEAT_PLANS[4]; }
    };
  }

  global.Game = {
    create: createGame,
    CHARACTERS: CHARACTERS,
    SEATS: SEATS,
    SEAT_PLANS: SEAT_PLANS,
    TIME_PRESETS: TIME_PRESETS,
    TIME_JITTER_MS: TIME_JITTER_MS
  };
})(window);
