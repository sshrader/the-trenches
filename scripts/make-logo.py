# Builds src/assets/ruins-logo.svg: the shield outline of the old logo, with a squad of the game's own top-down soldiers inside.
HEAD = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360" role="img" aria-label="The Ruins">
  <defs>
    <linearGradient id="bronze" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d9b46a"/><stop offset=".45" stop-color="#8a6a33"/><stop offset="1" stop-color="#4a3718"/>
    </linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5a4a2a"/><stop offset=".35" stop-color="#3a3a24"/><stop offset="1" stop-color="#171a10"/>
    </linearGradient>
    <radialGradient id="glow" cx=".5" cy=".12" r=".6">
      <stop offset="0" stop-color="#ffd27a" stop-opacity=".75"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="flash" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#ffd24a"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bfe3f2" stop-opacity=".75"/><stop offset=".5" stop-color="#7fb1c8" stop-opacity=".45"/><stop offset="1" stop-color="#5a8499" stop-opacity=".6"/>
    </linearGradient>
    <clipPath id="inside"><path d="M150 26 L262 54 L262 190 C262 262 210 310 150 336 C90 310 38 262 38 190 L38 54Z"/></clipPath>

    <!-- one of our soldiers, seen from above and drawn facing right (like in the game); each use turns him to face up -->
    <g id="body">
      <ellipse cx="2" cy="4" rx="15" ry="13" fill="#000" opacity=".4"/>
      <!-- legs and boots -->
      <path d="M-3 -4 L-10 -6.5 M-3 4 L5 6.5" stroke="#1d2814" stroke-width="7.5" stroke-linecap="round"/>
      <path d="M-3 -4 L-10 -6.5 M-3 4 L5 6.5" stroke="#4a5a30" stroke-width="5.5" stroke-linecap="round"/>
      <ellipse cx="-12" cy="-6.5" rx="4.6" ry="3.2" fill="#2a2118" stroke="#000" stroke-opacity=".55" stroke-width="1"/>
      <ellipse cx="7" cy="6.5" rx="4.6" ry="3.2" fill="#2a2118" stroke="#000" stroke-opacity=".55" stroke-width="1"/>
      <!-- pack with a rolled blanket -->
      <rect x="-12" y="-6" width="6.5" height="12" rx="2" fill="#2e3f2a" stroke="#000" stroke-opacity=".55" stroke-width="1.5"/>
      <path d="M-8.5 -7 L-8.5 7" stroke="#c9b88a" stroke-width="2"/>
      <!-- shoulders -->
      <ellipse cx="0" cy="0" rx="6.5" ry="11.5" fill="#506b4a" stroke="#000" stroke-opacity=".55" stroke-width="1.6"/>
      <rect x="-1" y="-13" width="5" height="3" fill="#4ade80"/><rect x="-1" y="10" width="5" height="3" fill="#4ade80"/>
    </g>
    <g id="head">
      <circle cx="1" cy="0" r="6" fill="#d9b48c"/>
      <ellipse cx="0.5" cy="0" rx="8.6" ry="7.6" fill="#3f4a3d" stroke="#000" stroke-opacity=".6" stroke-width="1.5"/>
      <circle cx="0.5" cy="0" r="4.4" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.5"/>
      <path d="M5.4 -3.4 A6.6 6.6 0 0 1 5.4 3.4" fill="none" stroke="#4ade80" stroke-width="2.2"/>
      <rect x="3.6" y="-4.8" width="3.6" height="9.6" fill="#0b1a22"/><rect x="5.2" y="-3.6" width="1.4" height="7.2" fill="#67e8f9" opacity=".85"/>
    </g>
    <g id="rifle">
      <path d="M1 2 L14 2" stroke="#34373b" stroke-width="4" stroke-linecap="round"/>
      <path d="M14 2 L33 2" stroke="#0e0f11" stroke-width="4" stroke-linecap="round"/><path d="M14 2 L33 2" stroke="#9aa1a9" stroke-width="2" stroke-linecap="round"/>
      <rect x="9" y="3" width="4" height="7" rx="1" fill="#2a2d31"/>
      <path d="M0 -9 L18 1.5" stroke="#000" stroke-opacity=".55" stroke-width="7.4" stroke-linecap="round"/><path d="M0 -9 L18 1.5" stroke="#506b4a" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M0 9 L6 3" stroke="#000" stroke-opacity=".55" stroke-width="7.4" stroke-linecap="round"/><path d="M0 9 L6 3" stroke="#506b4a" stroke-width="5.5" stroke-linecap="round"/>
      <circle cx="19.5" cy="1.5" r="3" fill="#d9b48c" stroke="#000" stroke-opacity=".55"/><circle cx="6.5" cy="3" r="3" fill="#d9b48c" stroke="#000" stroke-opacity=".55"/>
    </g>
  </defs>
'''

SHIELD = '''
  <!-- shield: bronze rim, dark plate (the same shape as before) -->
  <path d="M150 8 L276 40 L276 192 C276 272 220 322 150 352 C80 322 24 272 24 192 L24 40Z" fill="url(#bronze)" stroke="#1b1308" stroke-width="3"/>
  <path d="M150 20 L264 49 L264 192 C264 264 212 312 150 340 C88 312 36 264 36 192 L36 49Z" fill="#241a0b"/>
  <path d="M150 26 L262 54 L262 190 C262 262 210 310 150 336 C90 310 38 262 38 190 L38 54Z" fill="url(#sky)"/>
'''

SCENE = '''
  <g clip-path="url(#inside)">
    <rect x="38" y="26" width="224" height="200" fill="url(#glow)"/>
    <!-- ruined skyline -->
    <path d="M38 200 L38 140 L58 140 L58 112 L76 112 L76 150 L92 150 L92 104 L108 104 L108 128 L118 128 L118 200Z M182 200 L182 126 L198 126 L198 92 L216 92 L216 136 L232 136 L232 112 L248 112 L248 148 L262 148 L262 200Z" fill="#0f120a" opacity=".6"/>
    <path d="M60 112 L66 100 L72 112 M200 92 L208 78 L214 92" stroke="#0f120a" stroke-width="3" opacity=".5" fill="none"/>
    <!-- smoke drifting up -->
    <ellipse cx="86" cy="96" rx="34" ry="12" fill="#cbbd96" opacity=".1"/><ellipse cx="216" cy="70" rx="30" ry="9" fill="#cbbd96" opacity=".1"/>
    <!-- rubble ground -->
    <path d="M38 300 L38 236 C80 226 120 240 150 232 C190 224 230 238 262 232 L262 300Z" fill="#1c1f12" opacity=".75"/>
    <!-- tracer fire up the middle -->
    <g stroke="#ffe08a" stroke-linecap="round" opacity=".9"><path d="M150 92 L150 40" stroke-width="2.4"/><path d="M144 96 L128 52" stroke-width="1.6" opacity=".7"/><path d="M156 96 L174 56" stroke-width="1.6" opacity=".7"/></g>

    <!-- sniper, right: camouflaged hood and a long rifle with a scope -->
    <g transform="translate(214 240) rotate(-90) scale(2.6)">
      <use href="#body"/>
      <g><path d="M1 2 L14 2" stroke="#34373b" stroke-width="4" stroke-linecap="round"/><path d="M14 2 L47 2" stroke="#0e0f11" stroke-width="3.8" stroke-linecap="round"/><path d="M14 2 L47 2" stroke="#9aa1a9" stroke-width="1.8" stroke-linecap="round"/>
        <rect x="14" y="-3.2" width="12" height="3.6" rx="1.4" fill="#1b1d20" stroke="#000" stroke-width=".6"/><circle cx="26" cy="-1.4" r="2" fill="#3a8fb7"/>
        <path d="M0 -9 L18 1.5" stroke="#000" stroke-opacity=".55" stroke-width="7.4" stroke-linecap="round"/><path d="M0 -9 L18 1.5" stroke="#4d5f2a" stroke-width="5.5" stroke-linecap="round"/>
        <path d="M0 9 L6 3" stroke="#000" stroke-opacity=".55" stroke-width="7.4" stroke-linecap="round"/><path d="M0 9 L6 3" stroke="#4d5f2a" stroke-width="5.5" stroke-linecap="round"/>
        <circle cx="19.5" cy="1.5" r="3" fill="#d9b48c" stroke="#000" stroke-opacity=".55"/><circle cx="6.5" cy="3" r="3" fill="#d9b48c" stroke="#000" stroke-opacity=".55"/></g>
      <circle cx="1" cy="0" r="6" fill="#d9b48c"/>
      <circle cx="0.5" cy="0" r="8.8" fill="#4d5f2a" stroke="#000" stroke-opacity=".6" stroke-width="1.5"/>
      <g fill="#141c0a" opacity=".7"><circle cx="-4" cy="-5" r="1.7"/><circle cx="3" cy="-6" r="1.7"/><circle cx="-6" cy="2" r="1.7"/><circle cx="4" cy="5" r="1.7"/><circle cx="-2" cy="6" r="1.7"/><circle cx="-7" cy="-2" r="1.7"/></g>
      <path d="M5.4 -3.8 A7 7 0 0 1 5.4 3.8" fill="none" stroke="#4ade80" stroke-width="2.2"/>
    </g>

    <!-- shotgunner, left: armoured, a pump shotgun, and a clear riot shield held out in front -->
    <g transform="translate(86 240) rotate(-90) scale(2.6)">
      <use href="#body"/>
      <rect x="-4" y="-9" width="9" height="18" rx="3" fill="#6b7178" stroke="#000" stroke-opacity=".6" stroke-width="1.2"/><rect x="-2" y="-7" width="3" height="14" fill="#8a9097"/>
      <ellipse cx="1" cy="-12" rx="5" ry="3.6" fill="#4b5057" stroke="#000" stroke-opacity=".6"/><ellipse cx="1" cy="12" rx="5" ry="3.6" fill="#4b5057" stroke="#000" stroke-opacity=".6"/>
      <path d="M-2 2 L12 2" stroke="#6b4a2a" stroke-width="5" stroke-linecap="round"/><path d="M12 2 L34 2" stroke="#0e0f11" stroke-width="5" stroke-linecap="round"/><path d="M12 2 L34 2" stroke="#8d949c" stroke-width="3" stroke-linecap="round"/><path d="M18 2 L27 2" stroke="#5b3a1e" stroke-width="5" stroke-linecap="round"/>
      <path d="M0 -9 L18 1.5" stroke="#000" stroke-opacity=".55" stroke-width="7.4" stroke-linecap="round"/><path d="M0 -9 L18 1.5" stroke="#506b4a" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M0 9 L6 3" stroke="#000" stroke-opacity=".55" stroke-width="7.4" stroke-linecap="round"/><path d="M0 9 L6 3" stroke="#506b4a" stroke-width="5.5" stroke-linecap="round"/>
      <circle cx="19.5" cy="1.5" r="3" fill="#d9b48c" stroke="#000" stroke-opacity=".55"/><circle cx="6.5" cy="3" r="3" fill="#d9b48c" stroke="#000" stroke-opacity=".55"/>
      <use href="#head"/>
      <!-- the riot shield -->
      <g>
        <rect x="30" y="-17" width="7" height="34" rx="3.5" fill="#2b2f35" stroke="#000" stroke-opacity=".7" stroke-width="1.2"/>
        <rect x="31.4" y="-15" width="4.2" height="30" rx="2" fill="url(#glass)"/>
        <path d="M32 -12 L34.6 -5" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>
        <rect x="27" y="-19" width="4" height="8" rx="1.5" fill="#4b5057"/><rect x="27" y="11" width="4" height="8" rx="1.5" fill="#4b5057"/>
      </g>
    </g>

    <!-- squad leader, front and centre: the assault rifle, firing -->
    <g transform="translate(150 206) rotate(-90) scale(3.2)">
      <use href="#body"/>
      <use href="#rifle"/>
      <use href="#head"/>
    </g>
    <!-- muzzle flash -->
    <g transform="translate(150 96) scale(.8)"><ellipse rx="19" ry="26" fill="url(#flash)"/><path d="M0 -26 L3 -8 L16 -12 L6 -2 L18 4 L4 4 L0 20 L-4 4 L-18 4 L-6 -2 L-16 -12 L-3 -8Z" fill="#fff3c0" opacity=".95"/></g>
  </g>

  <!-- star at the point -->
  <path d="M150 306 L154 316 L165 317 L156 324 L159 334 L150 328 L141 334 L144 324 L135 317 L146 316Z" fill="url(#bronze)" stroke="#1b1308" stroke-width="2"/>
  <!-- rivets -->
  <g fill="#e0b25a" stroke="#1b1308" stroke-width="1.2"><circle cx="48" cy="52" r="4"/><circle cx="252" cy="52" r="4"/><circle cx="150" cy="22" r="4"/></g>
  <path d="M150 26 L262 54 L262 190 C262 262 210 310 150 336 C90 310 38 262 38 190 L38 54Z" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="2"/>
</svg>
'''
open('/home/claude/the-trenches/src/assets/ruins-logo.svg','w').write(HEAD+SHIELD+SCENE)
