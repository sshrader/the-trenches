import type { ReactNode } from 'react';
import { CLASSES, type Hud } from './useGame';

// Artwork: any file in src/assets/hud named like an icon replaces the built-in drawing (see the README there).
const files = import.meta.glob('../assets/hud/*.{png,webp,svg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const art: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) art[path.split('/').pop()!.replace(/\.\w+$/, '').toLowerCase()] = url;

const GOLD = '#fbbf24';
// Simple stand-in drawings on a 32x32 grid.
const drawings: Record<string, ReactNode> = {
  rifle: (<><rect x="2" y="13" width="26" height="4" rx="1" fill="#cbd5e1" /><rect x="8" y="17" width="7" height="3" fill="#94a3b8" /><rect x="26" y="12" width="4" height="6" fill="#64748b" /></>),
  smg: (<><rect x="4" y="12" width="20" height="6" rx="1" fill="#cbd5e1" /><rect x="12" y="18" width="4" height="9" fill="#94a3b8" /><rect x="22" y="14" width="8" height="2" fill="#64748b" /></>),
  pistol: (<><rect x="6" y="11" width="18" height="6" rx="1" fill="#cbd5e1" /><rect x="8" y="17" width="6" height="9" fill="#94a3b8" /></>),
  shotgun: (<><rect x="2" y="12" width="26" height="3" rx="1" fill="#cbd5e1" /><rect x="2" y="16" width="20" height="3" rx="1" fill="#94a3b8" /><rect x="24" y="13" width="6" height="7" fill="#64748b" /></>),
  sniper: (<><rect x="2" y="15" width="28" height="3" rx="1" fill="#cbd5e1" /><rect x="10" y="9" width="10" height="5" rx="2" fill="#64748b" /><circle cx="25" cy="8" r="0" /></>),
  rocket: (<><rect x="4" y="12" width="18" height="7" rx="3" fill={GOLD} /><polygon points="22,11 30,15.5 22,20" fill="#ef4444" /><polygon points="4,12 0,8 8,12" fill="#94a3b8" /><polygon points="4,19 0,23 8,19" fill="#94a3b8" /></>),
  grenade: (<><circle cx="16" cy="18" r="9" fill="#4d6b3a" /><rect x="13" y="6" width="6" height="5" fill="#94a3b8" /><path d="M19 7 q5 -3 7 1" stroke="#cbd5e1" strokeWidth="2" fill="none" /></>),
  artillery: (<><rect x="12" y="4" width="8" height="18" rx="3" fill="#cbd5e1" /><polygon points="12,22 20,22 16,29" fill="#ef4444" /><rect x="10" y="9" width="12" height="2" fill="#94a3b8" /></>),
  tower: (<><rect x="2" y="14" width="8" height="10" rx="2" fill="#a8895a" /><rect x="12" y="14" width="8" height="10" rx="2" fill="#b89a68" /><rect x="22" y="14" width="8" height="10" rx="2" fill="#a8895a" /></>),
  medkit: (<><rect x="4" y="9" width="24" height="17" rx="3" fill="#f8fafc" /><rect x="14" y="12" width="4" height="11" fill="#dc2626" /><rect x="10.5" y="15.5" width="11" height="4" fill="#dc2626" /></>),
  tent: (<><polygon points="2,26 16,6 30,26" fill="#c9c2a4" /><rect x="14.5" y="14" width="3" height="9" fill="#dc2626" /><rect x="11.5" y="17" width="9" height="3" fill="#dc2626" /></>),
  smoke: (<><circle cx="11" cy="19" r="7" fill="#cbd5e1" /><circle cx="20" cy="16" r="8" fill="#e2e8f0" /><circle cx="16" cy="11" r="6" fill="#94a3b8" /></>),
  flash: (<><circle cx="16" cy="16" r="5" fill="#fef9c3" /><path d="M16 1 L18 11 L28 8 L20 15 L30 18 L19 20 L22 30 L16 22 L10 30 L12 20 L2 18 L12 15 L4 8 L14 11Z" fill="#fde047" opacity="0.9" /></>),
  flare: (<><rect x="14" y="10" width="4" height="18" fill="#94a3b8" /><path d="M16 2 C21 8 21 12 16 12 C11 12 11 8 16 2Z" fill="#ef4444" /><rect x="8" y="24" width="16" height="6" rx="1" fill="#e2e8f0" /><rect x="14.5" y="25" width="3" height="4" fill="#dc2626" /></>),
  shield: (<path d="M16 3 L28 7 L27 18 C26 24 21 28 16 30 C11 28 6 24 5 18 L4 7Z" fill="#94a3b8" stroke="#e2e8f0" strokeWidth="2" />),
  uav: (<><rect x="12" y="13" width="8" height="5" rx="2" fill="#cbd5e1" /><path d="M3 12 L12 15 M29 12 L20 15" stroke="#94a3b8" strokeWidth="2" /><circle cx="4" cy="11" r="3" fill="#64748b" /><circle cx="28" cy="11" r="3" fill="#64748b" /><path d="M10 24 q6 4 12 0" stroke="#4ade80" strokeWidth="2" fill="none" /></>),
  drone: (<><path d="M7 7 L25 25 M25 7 L7 25" stroke="#64748b" strokeWidth="3" /><circle cx="6" cy="6" r="5" fill="#cbd5e1" opacity="0.6" /><circle cx="26" cy="6" r="5" fill="#cbd5e1" opacity="0.6" /><circle cx="6" cy="26" r="5" fill="#cbd5e1" opacity="0.6" /><circle cx="26" cy="26" r="5" fill="#cbd5e1" opacity="0.6" /><rect x="11" y="12" width="10" height="8" rx="2" fill="#1f2937" /><circle cx="18" cy="16" r="2" fill="#ef4444" /></>),
  heli: (<><ellipse cx="14" cy="18" rx="10" ry="6" fill="#64748b" /><rect x="22" y="16.5" width="9" height="3" fill="#64748b" /><ellipse cx="10" cy="17" rx="4" ry="3" fill="#7dd3fc" /><rect x="3" y="8" width="26" height="2" rx="1" fill="#e2e8f0" /><rect x="13" y="9" width="2" height="4" fill="#94a3b8" /><rect x="3" y="26" width="14" height="2" fill="#94a3b8" /></>),
  heart: (<path d="M16 28 C2 18 4 7 11 7 C14 7 16 9 16 11 C16 9 18 7 21 7 C28 7 30 18 16 28Z" fill="#ef4444" />),
};

// If there is no art for an exact name, these generic files stand in (your ammo icon for weapons, the special icon for class abilities).
const FALLBACK: Record<string, string> = { rifle: 'ammo', smg: 'ammo', pistol: 'ammo', shotgun: 'ammo', sniper: 'ammo', rocket: 'special', tower: 'special', medkit: 'special', tent: 'special', smoke: 'special', flash: 'special', flare: 'special', shield: 'special', uav: 'special', drone: 'special', heli: 'special' };

function Icon({ name, size = 42 }: { name: string; size?: number }) {
  const url = art[name] ?? (FALLBACK[name] ? art[FALLBACK[name]] : undefined);
  if (url) return <img src={url} width={size} height={size} alt="" draggable={false} />;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {drawings[name] ?? null}
    </svg>
  );
}

function Slot({ icon, value, sub, keyHint, keyHint2, active, dim, fill, title }: { icon: string; value: ReactNode; sub?: string; keyHint?: string; keyHint2?: string; active?: boolean; dim?: boolean; fill?: number; title?: string }) {
  return (
    <div className={`hud-slot${active ? ' active' : ''}${dim ? ' dim' : ''}`} title={title}>
      {keyHint && <kbd>{keyHint}</kbd>}
      {keyHint2 && <kbd className="k2" title="Hold">{keyHint2}</kbd>}
      <Icon name={icon} />
      <b>{value}</b>
      {sub && <small>{sub}</small>}
      {fill !== undefined && <i className="slot-fill" style={{ height: `${Math.max(0, Math.min(1, fill)) * 100}%` }} />}
    </div>
  );
}

const WEAPON_ICON: Record<string, string> = { rifleman: 'rifle', smg: 'smg', medic: 'smg', sniper: 'sniper', shotgunner: 'shotgun', squad: 'rifle' };

const SPECIALS: Record<string, { icon: string; sub: string; title: string; charges?: boolean; dur?: number; recharge?: number }> = {
  rifleman: { icon: 'smoke', sub: 'smoke', charges: true, title: 'Smoke grenade (C): enemies cannot see into or through the cloud; your side can. Resupply refills it.' },
  smg: { icon: 'flash', sub: 'flashbang', charges: true, title: 'Flashbang (C): blinds enemies it reaches for 2 seconds (shorter on repeat). Resupply refills it.' },
  medic: { icon: 'flare', sub: 'air drop', charges: true, title: 'Air drop flare (C): a medical crate lands and heals your side near it for 10 seconds. Resupply refills it.' },
  shotgunner: { icon: 'shield', sub: 'riot shield', dur: 5, recharge: 20, title: 'Riot shield (C): 5 seconds of cover from the front (soaks 200 damage, then breaks), slightly slower walking. 20 second recharge.' },
  squad: { icon: 'uav', sub: 'UAV', dur: 10, recharge: 60, title: 'UAV (C): aim it like an artillery strike; for 10 seconds the fog lifts in a big circle there and your whole side sees every enemy in it. 60 second recharge; resupply does not refresh it.' },
};

const REWARDS = [
  null,
  { icon: 'uav', sub: 'UAV', title: 'Kill-streak UAV (Z): for 8 seconds the whole map is lit and every enemy shows, on the screen and the minimap.' },
  { icon: 'drone', sub: 'Drone', title: 'Attack drone (Z): fly it with WASD for 15 seconds; it lights the fog and shows enemies like a UAV, and the enemy cannot see it. Left click (or Z) explodes it. You stand still while you fly it.' },
  { icon: 'heli', sub: 'Heli', title: 'Attack helicopter (Z): fly it for 15 seconds with WASD, mouse to aim, click for the minigun, right click (or G) for rockets. You stand still while you fly it.' },
];

/** The kill-streak reward you have earned (3 kills: UAV, 5: attack drone, 7: helicopter). Z spends the best one; dying loses them. */
function RewardSlot({ h }: { h: Hud }) {
  const flying = h.myCtl > 0;
  const r = REWARDS[h.myReward];
  if (!r && !flying) return null;
  if (flying) return <Slot icon={h.myCtl === 2 ? 'heli' : 'drone'} value={`${Math.ceil(h.myCtlLeft / 10)}s`} sub={h.myCtl === 2 ? 'flying' : 'piloting'} keyHint="Z" active title={h.myCtl === 2 ? 'Flying the attack helicopter.' : 'Flying the attack drone. Left click or Z explodes it.'} />;
  return <Slot icon={r!.icon} value={h.myRewardN > 1 ? `x${h.myRewardN}` : 'ready'} sub={r!.sub} keyHint="Z" active title={r!.title} />;
}

/** The class's own ability: a count of charges, or a timer for the shield and UAV. */
function SpecialSlot({ h }: { h: Hud }) {
  const sp = SPECIALS[h.myClassId];
  if (!sp) return null;
  if (sp.charges) return <Slot icon={sp.icon} value={h.mySpec} sub={sp.sub} keyHint="C" dim={h.mySpec === 0} title={sp.title} />;
  const activeS = h.myClassId === 'squad' ? Math.ceil(h.uavMine / 10) : Math.ceil(h.myShield / 10);
  const total = (sp.dur ?? 0) + (sp.recharge ?? 0);
  const cd = h.mySpecCd;
  const value = h.myClassId === 'shotgunner' && h.myShieldHp > 0 ? `${h.myShieldHp}` : activeS > 0 ? `${activeS}s` : cd > 0 ? `${cd}s` : 'ready';
  return <Slot icon={sp.icon} value={value} sub={sp.sub} keyHint="C" active={activeS > 0} dim={activeS === 0 && cd > 0} fill={activeS === 0 && cd > 0 ? 1 - cd / total : undefined} title={sp.title} />;
}

/** The bottom bar: health, sprint, then one slot each for your weapon, grenades, artillery and whatever special your class has. */
export default function HudBar({ h }: { h: Hud }) {
  const cls = CLASSES.find((c) => c.id === h.myClassId) ?? CLASSES[0];
  const maxHp = cls.hp;
  const hpFrac = Math.max(0, Math.min(1, h.myHp / maxHp));
  const weaponIcon = h.myBazooka ? 'rocket' : h.mySidearm ? 'pistol' : WEAPON_ICON[h.myClassId] ?? 'rifle';
  return (
    <div className="hudbar" aria-label="Your gear">
      <div className="hud-vitals">
        <div className="hud-hp" title="Health">
          <Icon name="heart" size={20} />
          <span className="bar"><u style={{ width: `${hpFrac * 100}%`, background: hpFrac > 0.5 ? '#4ade80' : hpFrac > 0.25 ? '#fbbf24' : '#ef4444' }} /></span>
          <b>{Math.ceil(h.myHp)}</b>
        </div>
        <div className={`hud-sprint${h.myWinded ? ' winded' : ''}`} title="Sprint: hold Shift or the right mouse button">
          <span className="bar"><u style={{ width: `${Math.max(0, Math.min(100, h.myStamina))}%` }} /></span>
          <small>SPRINT</small>
        </div>
      </div>
      <div className="hud-slots">
        {h.myBazooka ? (
          <Slot icon="rocket" value={h.myRockets} sub="rockets" keyHint="Q" active title="Bazooka equipped. Mouse wheel or Q swaps back." />
        ) : (
          <Slot icon={weaponIcon} value={h.myReload > 0 ? '…' : `${h.myAmmo}/${h.myMag}`} sub={h.myReload > 0 ? 'reloading' : h.mySidearm ? 'pistol' : cls.label} keyHint="R" active fill={h.myReload > 0 ? h.myReload : undefined} title="Rounds in the magazine. R reloads." />
        )}
        <Slot icon="grenade" value={h.myGren} sub="grenades" keyHint="G" dim={h.myGren === 0} />
        <Slot icon="artillery" value={h.myArty} sub="artillery" keyHint="T" dim={h.myArty === 0} />
        {h.myClassId === 'sniper' ? (
          <Slot
            icon="tower"
            value={h.myTowerProg > 0 ? 'taking down' : h.myElev ? 'up' : h.myNearTower ? 'climb' : h.myTowerUp ? 'built' : 'build'}
            sub={h.myElev ? 'C: climb down' : h.myTowerUp ? 'C: climb\nB: dismantle' : 'C: build tower'}
            keyHint="C"
            keyHint2={h.myTowerUp ? 'B' : undefined}
            active={h.myElev}
            fill={h.myTowerProg > 0 ? h.myTowerProg : undefined}
            title={h.myElev ? 'On your tower: your rounds fly over low cover. C climbs down.' : h.myTowerUp ? 'Stand beside your tower and hold B for 5 seconds to dismantle it, then you can build another. C climbs it.' : 'C: build a tower here and climb it. One at a time; it stays until you die, or for 20 seconds after nobody is on it.'}
          />
        ) : (
          <SpecialSlot h={h} />
        )}
        {h.myClassId === 'medic' ? (
          <Slot icon="medkit" value={`${h.myKit}`} sub="medkit" fill={h.myKit / 100} title="Medkit: healing left for teammates" />
        ) : h.myRockets > 0 && !h.myBazooka ? (
          <Slot icon="rocket" value={h.myRockets} sub="bazooka" keyHint="Q" title="Bazooka: mouse wheel or Q equips it." />
        ) : null}
        <RewardSlot h={h} />
      </div>
    </div>
  );
}
