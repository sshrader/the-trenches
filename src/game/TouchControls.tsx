// On-screen controls for phones and tablets: a left stick to move, and the rest of the screen is the battlefield: touch where you want to shoot (hold to keep firing),
// or arm a grenade / artillery strike with its button and tap where it should land. Buttons cover the other actions.
// They write into the same `input` the keyboard does, so the server sees no difference.
import { useRef, useState } from 'react';
import type { MutableRefObject, PointerEvent as RPointerEvent, ReactNode } from 'react';
import type { Input, World } from './useGame';

export type TouchAim = { on: boolean; px: number; py: number }; // where the last touch was, in page pixels; the canvas turns it into an aim point

const R = 56; // stick radius in px

type StickState = { id: number; cx: number; cy: number; x: number; y: number } | null;

/** A floating stick: it appears where the thumb lands inside its zone. */
function Stick({ className, onVec, onEnd, label }: { className: string; onVec: (vx: number, vy: number, mag: number) => void; onEnd: () => void; label: string }) {
  const [st, setSt] = useState<StickState>(null);
  const zone = useRef<HTMLDivElement>(null);
  const local = (e: RPointerEvent) => {
    const r = zone.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const update = (e: RPointerEvent, base: { cx: number; cy: number }) => {
    const p = local(e);
    let dx = p.x - base.cx;
    let dy = p.y - base.cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    const mag = Math.min(1, d / R);
    onVec(d > 0 ? dx / Math.max(d, 1e-6) : 0, d > 0 ? dy / Math.max(d, 1e-6) : 0, mag);
    return { x: base.cx + dx, y: base.cy + dy };
  };
  return (
    <div
      ref={zone}
      className={`tc-zone ${className}`}
      aria-label={label}
      onPointerDown={(e) => {
        if (st) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = local(e);
        const base = { cx: p.x, cy: p.y };
        const k = update(e, base);
        setSt({ id: e.pointerId, ...base, ...k });
      }}
      onPointerMove={(e) => {
        if (!st || e.pointerId !== st.id) return;
        const k = update(e, st);
        setSt({ ...st, ...k });
      }}
      onPointerUp={(e) => { if (st && e.pointerId === st.id) { setSt(null); onEnd(); } }}
      onPointerCancel={(e) => { if (st && e.pointerId === st.id) { setSt(null); onEnd(); } }}
    >
      {st && (
        <>
          <div className="tc-base" style={{ left: st.cx, top: st.cy }} />
          <div className="tc-knob" style={{ left: st.x, top: st.y }} />
        </>
      )}
    </div>
  );
}

function Btn({ children, onDown, onUp, className = '', title }: { children: ReactNode; onDown: () => void; onUp?: () => void; className?: string; title?: string }) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      className={`tc-btn ${className}${on ? ' on' : ''}`}
      aria-label={title}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setOn(true); onDown(); }}
      onPointerUp={() => { setOn(false); onUp?.(); }}
      onPointerCancel={() => { setOn(false); onUp?.(); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

type Tool = 'fire' | 'nade' | 'arty';

export default function TouchControls({ input, aim, world, onScores, onMenu }: { input: MutableRefObject<Input>; aim: MutableRefObject<TouchAim>; world: MutableRefObject<World>; onScores: () => void; onMenu: () => void }) {
  const cls = () => world.current.units.get(world.current.me)?.cls ?? 0;
  const [scope, setScope] = useState(false);
  const [sprint, setSprint] = useState(false);
  const [auto, setAuto] = useState(false); // keep firing at the last point you touched
  const [tool, setTool] = useState<Tool>('fire');
  const toolRef = useRef<Tool>('fire');
  const setToolBoth = (t: Tool) => { toolRef.current = t; setTool(t); };
  const autoRef = useRef(false);
  const fireTimer = useRef(0);
  const down = useRef<number | null>(null);
  const sniper = cls() === 3;

  const point = (e: RPointerEvent) => { aim.current.on = true; aim.current.px = e.clientX; aim.current.py = e.clientY; };
  // The server reads the aim and the throw together, so the throw waits a moment for the canvas to turn the touch into an aim point.
  const later = (fn: () => void) => window.setTimeout(fn, 90);

  return (
    <div className="touch-ui" onContextMenu={(e) => e.preventDefault()}>
      <div
        className="tc-zone aim"
        aria-label="Tap to shoot or place a throw"
        onPointerDown={(e) => {
          if (down.current !== null) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          down.current = e.pointerId;
          point(e);
          if (toolRef.current === 'fire') {
            window.clearTimeout(fireTimer.current);
            input.current.fire = true;
          } else if (toolRef.current === 'nade') {
            later(() => { input.current.nade += 1; });
            setToolBoth('fire');
          } else {
            later(() => { input.current.arty += 1; });
            setToolBoth('fire');
          }
        }}
        onPointerMove={(e) => { if (e.pointerId === down.current) point(e); }}
        onPointerUp={(e) => {
          if (e.pointerId !== down.current) return;
          down.current = null;
          if (autoRef.current) return;
          fireTimer.current = window.setTimeout(() => { input.current.fire = false; }, 140); // a quick tap still counts as a shot
        }}
        onPointerCancel={(e) => {
          if (e.pointerId !== down.current) return;
          down.current = null;
          if (!autoRef.current) input.current.fire = false;
        }}
      />
      <Stick
        className="left"
        label="Move"
        onVec={(vx, vy, mag) => {
          const m = mag < 0.18 ? 0 : 1; // a small dead zone, then full speed
          input.current.dx = vx * m;
          input.current.dy = vy * m;
          if (!sprint) input.current.sprint = mag > 0.97; // push the stick right out to run
        }}
        onEnd={() => { input.current.dx = input.current.dy = 0; if (!sprint) input.current.sprint = false; }}
      />
      {tool !== 'fire' && <div className="tc-hint">{tool === 'nade' ? 'Tap where to throw the grenade' : 'Tap where to call the artillery strike'}</div>}
      <div className="tc-btns">
        <Btn title="Keep firing" className={auto ? 'latched' : ''} onDown={() => { const a = !autoRef.current; autoRef.current = a; setAuto(a); input.current.fire = a && aim.current.on; }}>⟳<small>auto</small></Btn>
        <Btn title="Grenade: then tap where to throw" className={tool === 'nade' ? 'latched' : ''} onDown={() => setToolBoth(toolRef.current === 'nade' ? 'fire' : 'nade')}>G<small>grenade</small></Btn>
        <Btn title="Artillery: then tap the target" className={tool === 'arty' ? 'latched' : ''} onDown={() => setToolBoth(toolRef.current === 'arty' ? 'fire' : 'arty')}>T<small>artillery</small></Btn>
        <Btn title="Reload" onDown={() => { input.current.reload += 1; }}>R<small>reload</small></Btn>
        <Btn title="Class special" onDown={() => { if (cls() === 3) input.current.nest += 1; else input.current.special += 1; }}>C<small>special</small></Btn>
        <Btn title="Kill-streak reward" onDown={() => { input.current.streak += 1; }}>Z<small>streak</small></Btn>
        <Btn title="Swap weapon" onDown={() => { input.current.swap += 1; }}>Q<small>swap</small></Btn>
        <Btn title="Sprint" className={sprint ? 'latched' : ''} onDown={() => { const s = !sprint; setSprint(s); input.current.sprint = s; }}>⇧<small>sprint</small></Btn>
        {sniper && <Btn title="Scope" className={scope ? 'latched' : ''} onDown={() => { const s = !scope; setScope(s); input.current.scope = s; }}>◎<small>scope</small></Btn>}
      </div>
      <div className="tc-top">
        <Btn title="Scoreboard" onDown={onScores}>☷</Btn>
        <Btn title="Menu" onDown={onMenu}>☰</Btn>
      </div>
    </div>
  );
}
