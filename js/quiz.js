/* 숫자 퀴즈 생성기.
 *
 * 아이(7~8살)와 어른의 문제를 전혀 다른 난이도로 뽑는다.
 * 아이는 3~5초, 어른은 8~12초 안에 암산으로 풀 수 있어야 한다 — 종이는 없다.
 *
 * 보기는 항상 4개. 어른 문제의 오답은 "실수하기 쉬운 값"으로 깐다.
 * 정답과 동떨어진 숫자를 깔면 계산하지 않고 어림으로 찍을 수 있어서다.
 */
(function (global) {
  'use strict';

  const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /** 가중치대로 하나 고르기. [[값, 비중], ...] */
  function weighted(pairs) {
    const total = pairs.reduce((s, p) => s + p[1], 0);
    let r = Math.random() * total;
    for (const [value, w] of pairs) {
      r -= w;
      if (r <= 0) return value;
    }
    return pairs[pairs.length - 1][0];
  }

  /* ------------------------------------------------------------------ 아이 */

  function kidAdd() {
    // 합이 18을 넘지 않게 — 받아올림이 한 번까지만 나온다
    const a = randInt(1, 9);
    const b = randInt(1, Math.min(9, 18 - a));
    return { key: `k+${a}+${b}`, text: `${a} + ${b} = ?`, answer: a + b };
  }

  function kidSub() {
    const a = randInt(2, 18);
    const b = randInt(1, a - 1); // 결과가 반드시 1 이상
    return { key: `k-${a}-${b}`, text: `${a} − ${b} = ?`, answer: a - b };
  }

  function kidMakeTen() {
    const a = randInt(1, 9);
    return { key: `k10${a}`, text: `${a} + ? = 10`, answer: 10 - a };
  }

  /** 아이 오답: 정답 근처의 작은 수. 음수와 0은 아이에게 혼란스러워 제외한다. */
  function kidDistractors(answer) {
    const pool = [];
    for (const d of [1, 2, 3]) {
      if (answer - d >= 1) pool.push(answer - d);
      pool.push(answer + d);
    }
    return uniqueSample(pool, 3, answer);
  }

  /* ----------------------------------------------------------------- 어른
   *
   * 세 단계. 전부 종이 없이 암산으로 푸는 것이 기준이다.
   *   1단계 — 두 자리 덧뺄셈      (47 + 28)        목표 5~7초
   *   2단계 — 한 자리 곱셈·혼합    (7 × 8 + 15)     목표 6~9초
   *   3단계 — 두 자리 곱셈·나머지  (23 × 17)        목표 8~12초
   */

  /* --- 1단계 --- */

  function adultAdd2() {
    // 받아올림이 한 번은 나오게 — 그래야 암산할 맛이 난다
    const a = randInt(23, 89);
    const b = randInt(17, 89);
    return { key: `a1+${a}+${b}`, text: `${a} + ${b} = ?`, answer: a + b, _near: 10 };
  }

  function adultSub2() {
    const a = randInt(41, 99);
    const b = randInt(13, a - 11);
    return { key: `a1-${a}-${b}`, text: `${a} − ${b} = ?`, answer: a - b, _near: 10 };
  }

  function adultAdd3() {
    const a = randInt(12, 79);
    const b = randInt(12, 79);
    const c = randInt(11, 49);
    return { key: `a1s${a}+${b}+${c}`, text: `${a} + ${b} + ${c} = ?`, answer: a + b + c, _near: 10 };
  }

  /* --- 2단계 --- */

  function adultMul1() {
    // 2·5·10단은 너무 쉬워 뺀다
    const a = randInt(3, 9);
    const b = randInt(6, 9);
    return { key: `a2*${a}*${b}`, text: `${a} × ${b} = ?`, answer: a * b, _a: a, _b: b };
  }

  function adultMul1Plus() {
    const a = randInt(4, 9);
    const b = randInt(4, 9);
    const c = randInt(11, 49);
    return { key: `a2p${a}*${b}+${c}`, text: `${a} × ${b} + ${c} = ?`, answer: a * b + c, _a: a, _b: b };
  }

  function adultMul2x1() {
    const a = randInt(12, 39);
    const b = randInt(3, 9);
    return { key: `a2x${a}*${b}`, text: `${a} × ${b} = ?`, answer: a * b, _a: a, _b: b };
  }

  /* --- 3단계 --- */

  function adultMultiply() {
    const a = randInt(12, 29);
    const b = randInt(12, 29);
    return { key: `a3*${a}*${b}`, text: `${a} × ${b} = ?`, answer: a * b, _a: a, _b: b };
  }

  function adultRemainder() {
    const a = randInt(100, 999);
    const b = randInt(7, 19);
    return { key: `a3%${a}%${b}`, text: `${a} ÷ ${b} 의 나머지는?`, answer: a % b, _b: b };
  }

  function adultMixed() {
    const a = randInt(6, 19);
    const b = randInt(6, 19);
    const c = randInt(10, 99);
    // 결과가 음수면 뺄 값을 줄인다 — 음수 답은 보기 만들기가 지저분해진다
    const prod = a * b;
    const cc = Math.min(c, prod - 1);
    return { key: `a3m${a}*${b}-${cc}`, text: `${a} × ${b} − ${cc} = ?`, answer: prod - cc };
  }

  /** 단계별 문제 구성. */
  const ADULT_LEVELS = {
    1: [[adultAdd2, 40], [adultSub2, 40], [adultAdd3, 20]],
    2: [[adultMul1, 40], [adultMul1Plus, 30], [adultMul2x1, 30]],
    3: [[adultMultiply, 50], [adultRemainder, 30], [adultMixed, 20]]
  };

  /** 어른 오답: 계산을 틀렸을 때 실제로 나오는 값들. */
  function adultDistractors(q) {
    const ans = q.answer;
    const pool = [];

    if (q._a && q._b) {
      // 곱셈: 한 단 어긋나거나 자릿수를 놓치는 흔한 실수
      pool.push(ans + q._a, ans - q._a, ans + q._b, ans - q._b);
      pool.push(ans + 10, ans - 10);
      if (ans > 150) pool.push(ans + 100, ans - 100);
    } else if (q._b) {
      // 나머지: 1 차이, 그리고 "나머지를 거꾸로 센" 값
      pool.push(ans + 1, ans - 1, ans + 2, ans - 2, q._b - ans);
    } else if (q._near) {
      // 덧뺄셈: 받아올림을 빠뜨리거나 한 자리 틀리는 실수
      pool.push(ans + 10, ans - 10, ans + 1, ans - 1, ans + 9, ans - 9, ans + 20, ans - 20);
    } else {
      pool.push(ans + 1, ans - 1, ans + 10, ans - 10, ans + 2, ans - 2);
    }

    return uniqueSample(pool.filter((v) => v >= 0), 3, ans);
  }

  /* -------------------------------------------------------------- 공통 조립 */

  /** pool 에서 answer 와 겹치지 않는 서로 다른 값 n 개. 모자라면 ±k 로 채운다. */
  function uniqueSample(pool, n, answer) {
    const seen = new Set([answer]);
    const out = [];
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);

    for (const v of shuffled) {
      if (out.length >= n) break;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    // 후보가 모자란 경우 (작은 정답에서 음수를 걸러내면 생긴다)
    let k = 1;
    while (out.length < n) {
      for (const cand of [answer + k, answer - k]) {
        if (out.length >= n) break;
        if (cand < 0 || seen.has(cand)) continue;
        seen.add(cand);
        out.push(cand);
      }
      k += 1;
      if (k > 200) break; // 무한 루프 방지
    }
    return out;
  }

  /**
   * 문제 한 개를 만든다.
   * @param {'kid'|'adult'} type
   * @param {Set<string>} used  이미 나온 문제 키 (한 판 안에서 중복 방지)
   * @param {number} [level]    어른 난이도 1~3 (기본 3). 아이는 무시한다.
   */
  function generate(type, used, level) {
    used = used || new Set();
    const lv = ADULT_LEVELS[level] ? level : 3;

    let q = null;
    // 같은 문제가 또 나오면 다시 뽑는다. 문제 공간이 넓어 실제로는 거의 한 번에 끝난다.
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const cand = type === 'kid'
        ? weighted([[kidAdd, 40], [kidSub, 40], [kidMakeTen, 20]])()
        : weighted(ADULT_LEVELS[lv])();
      if (!used.has(cand.key)) { q = cand; break; }
      q = cand; // 60번 다 겹치면 그냥 쓴다 (판이 비정상적으로 길어진 경우)
    }

    used.add(q.key);

    const distractors = type === 'kid'
      ? kidDistractors(q.answer)
      : adultDistractors(q);

    const choices = distractors.concat([q.answer]).sort(() => Math.random() - 0.5);

    return {
      text: q.text,
      choices: choices,
      answerIndex: choices.indexOf(q.answer),
      answer: q.answer,
      key: q.key
    };
  }

  global.Quiz = { generate: generate, ADULT_LEVEL_MAX: 3 };
})(window);
