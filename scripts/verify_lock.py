"""패드 터치 잠금이 실제로 걸렸는지 확인한다.

    PYTHONIOENCODING=utf-8 PYTHONUTF8=1 python verify_lock.py <index.html 경로 또는 URL>
    PYTHONIOENCODING=utf-8 PYTHONUTF8=1 python verify_lock.py <대상> --input "#name-field"

이 영역은 눈으로 안 보인다. "CSS를 넣었으니 됐다"로 넘기지 말고 이걸 돌린다.
이벤트를 직접 던져 preventDefault 되는지 본다 —
막혀야 할 것과 **막히면 안 되는 것**을 같이 확인하는 게 요점이다.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

MUST_BLOCK = [
    ("contextmenu", "길게 눌러 뜨는 복사·찾아보기 메뉴"),
    ("selectstart", "글자 선택"),
    ("dragstart", "끌어 옮기기"),
    ("gesturestart", "손가락 확대 (iOS 사파리)"),
    ("pinchmove", "손가락 두 개로 밀기"),
    ("ctrlwheel", "Ctrl + 휠 확대"),
    ("ctrlplus", "Ctrl + '+' 확대"),
]
MUST_PASS = [
    ("onefinger", "한 손가락 밀기 (글씨 쓰기·스크롤)"),
    ("plainwheel", "그냥 스크롤"),
]

PROBE = r"""(sel) => {
    const out = {};
    const fire = (el, type, Ctor, opts) => {
        const ev = new Ctor(type, Object.assign({ bubbles: true, cancelable: true }, opts || {}));
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
    };
    // 글자 칸이 아닌 아무 요소 하나
    const plain = [...document.body.querySelectorAll('*')].find(
        e => !e.closest('input,textarea,[contenteditable]')
             && e.textContent && e.textContent.trim().length) || document.body;

    out.contextmenu = fire(plain, 'contextmenu', MouseEvent);
    out.selectstart = fire(plain, 'selectstart', Event);
    out.dragstart = fire(plain, 'dragstart', Event);
    out.gesturestart = fire(document, 'gesturestart', Event);

    const touch = (n) => {
        if (typeof Touch === 'undefined' || typeof TouchEvent === 'undefined') return null;
        const list = [];
        for (let i = 0; i < n; i += 1) {
            list.push(new Touch({ identifier: i + 1, target: document.body }));
        }
        const ev = new TouchEvent('touchmove',
            { bubbles: true, cancelable: true, touches: list });
        document.body.dispatchEvent(ev);
        return ev.defaultPrevented;
    };
    out.pinchmove = touch(2);
    out.onefinger = touch(1);

    out.ctrlwheel = fire(document, 'wheel', WheelEvent, { ctrlKey: true });
    out.plainwheel = fire(document, 'wheel', WheelEvent, {});
    out.ctrlplus = fire(document, 'keydown', KeyboardEvent, { ctrlKey: true, key: '+' });

    const h = getComputedStyle(document.documentElement);
    const b = getComputedStyle(document.body);
    const meta = document.querySelector('meta[name=viewport]');
    out._css = {
        htmlTouch: h.touchAction, bodyTouch: b.touchAction,
        select: b.webkitUserSelect || b.userSelect,
        overscroll: b.overscrollBehaviorY,
        meta: meta ? meta.getAttribute('content') : '(없음)',
    };
    // 글자 칸 예외
    const field = sel ? document.querySelector(sel)
        : document.querySelector('input:not([type=hidden]), textarea, [contenteditable]');
    out._field = field ? {
        found: true,
        select: (getComputedStyle(field).webkitUserSelect || getComputedStyle(field).userSelect),
        touch: getComputedStyle(field).touchAction,
        menuBlocked: fire(field, 'contextmenu', MouseEvent),
        selectBlocked: fire(field, 'selectstart', Event),
    } : { found: false };
    return out;
}"""


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    target = sys.argv[1]
    field_sel = None
    if "--input" in sys.argv:
        field_sel = sys.argv[sys.argv.index("--input") + 1]

    url = target if target.startswith("http") else pathlib.Path(target).resolve().as_uri()
    problems = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 820, "height": 1180},
                                  has_touch=True, is_mobile=True)
        page = ctx.new_page()
        console = []
        page.on("pageerror", lambda e: console.append("pageerror: " + str(e)))
        page.on("console", lambda m: console.append(m.text) if m.type == "error" else None)
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(700)
        r = page.evaluate(PROBE, field_sel)
        ctx.close()
        browser.close()

    css = r["_css"]
    print("대상: %s" % url)
    print()
    print("[설정]")
    print("  viewport        : %s" % css["meta"])
    print("  touch-action    : html=%s / body=%s" % (css["htmlTouch"], css["bodyTouch"]))
    print("  user-select     : %s" % css["select"])
    print("  overscroll      : %s" % css["overscroll"])
    for want in ("user-scalable=no", "maximum-scale=1"):
        if want not in (css["meta"] or ""):
            problems.append("viewport 에 %s 가 없다" % want)
    for who, val in (("html", css["htmlTouch"]), ("body", css["bodyTouch"])):
        if val in ("auto", "") or "pinch-zoom" in val:
            problems.append("%s touch-action 이 '%s' — 확대가 막히지 않는다" % (who, val))
        elif val == "pan-y":
            problems.append("%s touch-action 이 pan-y — 옆으로 미는 탭 줄이 죽는다 "
                            "(pan-x pan-y 로)" % who)
    if css["select"] != "none":
        problems.append("body user-select 이 '%s' — 글자가 선택된다" % css["select"])

    print()
    print("[막혀야 할 것]")
    for key, label in MUST_BLOCK:
        got = r.get(key)
        if got is None:
            print("  ? %-34s (이 브라우저에서 확인 불가)" % label)
            continue
        print("  %s %-34s %s" % ("OK  " if got else "실패", label, "막힘" if got else "안 막힘"))
        if not got:
            problems.append("%s 이(가) 막히지 않는다" % label)

    print()
    print("[막히면 안 되는 것]")
    for key, label in MUST_PASS:
        got = r.get(key)
        if got is None:
            print("  ? %-34s (확인 불가)" % label)
            continue
        print("  %s %-34s %s" % ("OK  " if not got else "실패", label,
                                 "살아 있음" if not got else "막혀 버렸다"))
        if got:
            problems.append("%s 까지 막혔다 — 조작이 죽는다" % label)

    print()
    print("[글자 칸 예외]")
    f = r["_field"]
    if not f["found"]:
        print("  입력칸이 없는 화면 (확인 생략)")
    else:
        print("  user-select=%s touch-action=%s" % (f["select"], f["touch"]))
        print("  복사메뉴 막힘=%s / 선택 막힘=%s  (둘 다 False 여야 한다)"
              % (f["menuBlocked"], f["selectBlocked"]))
        # auto 는 기본값(선택 가능)이라 괜찮다. none 일 때만 문제.
        if f["select"] == "none":
            problems.append("입력칸 user-select 이 none — 글자를 고칠 수 없다")
        if f["menuBlocked"] or f["selectBlocked"]:
            problems.append("입력칸에서도 막고 있다 — 커서를 옮길 수 없다")

    if console:
        print()
        print("[콘솔 오류]")
        for c in console[:8]:
            print("  %s" % c)

    print()
    if problems:
        print("=== 고칠 것 %d개 ===" % len(problems))
        for x in problems:
            print("  - %s" % x)
        return 1
    print("=== 모두 통과 ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
