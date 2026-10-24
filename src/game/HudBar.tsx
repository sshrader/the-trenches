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
  heart: (<path d="M16 28 C2 18 4 7 11 7 C14 7 16 9 16 11 C16 9 18 7 21 7 C28 7 30 18 16 28Z" fill="#ef4444" />),
};

// If there is no art for an exact name, these generic files stand in (your ammo icon for weapons, the special icon for class abilities).
const FALLBACK: Record<string, string> = { rifle: 'ammo', smg: 'ammo', pistol: 'ammo', shotgun: 'ammo', sniper: 'ammo', rocket: 'special', tower: 'special', medkit: 'special', tent: 'special' };

function Icon({ name, size = 42 }: { name: string; size?: number }) {
  const url = art[name] ?? (FALLBACK[name] ? art[FALLBACK[name]] : undefined);
  if (url) return <img src={url} width={size} height={size} alt="" draggable={false} />;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {drawings[name] ?? null}
    </svg>
  );
}

function Slot({ icon, value, sub, keyHint, active, dim, fill, title }: { icon: string; value: ReactNode; sub?: string; keyHint?: string; active?: boolean; dim?: boolean; fill?: number; title?: string }) {
  return (
    <div className={`hud-slot${active ? ' active' : ''}${dim ? ' dim' : ''}`} title={title}>
      {keyHint && <kbd>{keyHint}</kbd>}
      <Icon name={icon} />
      <b>{value}</b>
      {sub && <small>{sub}</small>}
      {fill !== undefined && <i className="slot-fill" style={{ height: `${Math.max(0, Math.min(1, fill)) * 100}%` }} />}
    </div>
  );
}

const WEAPON_ICON: Record<string, string> = { rifleman: 'rifle', smg: 'smg', medic: 'pistol', sniper: 'sniper', shotgunner: 'shotgun' };

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
            sub="tower"
            keyHint="E"
            active={h.myElev}
            fill={h.myTowerProg > 0 ? h.myTowerProg : undefined}
            title={h.myElev ? 'On your tower: your rounds fly over low cover. E climbs down.' : h.myTowerUp ? 'Stand beside your tower and hold B for 5 seconds to dismantle it, then you can build another. E climbs it.' : 'E: build a tower here and climb it. One at a time; it stays until you die, or for 20 seconds after nobody is on it.'}
          />
        ) : h.myClassId === 'medic' ? (
          <Slot icon="medkit" value={`${h.myKit}`} sub="medkit" fill={h.myKit / 100} title="Medkit: healing left for teammates" />
        ) : (
          <Slot icon="rocket" value={h.myRockets > 0 ? h.myRockets : '–'} sub="bazooka" keyHint="Q" dim={h.myRockets === 0} title="Bazooka: walk over your side's gold crate for 2 rockets, then mouse wheel or Q to equip" />
        )}
      </div>
    </div>
  );
}
