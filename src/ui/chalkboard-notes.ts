/**
 * Lab4All — Classroom Chalkboard Custom Notes & Teacher Presets
 *
 * Generates high-definition SVG note graphics that teachers can project or mount
 * directly onto the green classroom chalkboard in the 3D lab environment.
 */

function svgToDataUrl(svgString: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
}

/**
 * Generates an authentic handwritten teacher assignment card for the Target Cup Prediction Challenge.
 */
function createInquiryChallengeNote(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs>
      <linearGradient id="paperGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fffef7"/>
        <stop offset="100%" stop-color="#f5efdb"/>
      </linearGradient>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000" flood-opacity="0.35"/>
      </filter>
    </defs>

    <!-- Pinned Card Background -->
    <rect x="40" y="40" width="1520" height="820" rx="16" fill="url(#paperGrad)" filter="url(#shadow)" stroke="#dcd3ba" stroke-width="4"/>

    <!-- Graph Paper Grid Lines -->
    <g stroke="rgba(180, 165, 135, 0.22)" stroke-width="1.5">
      ${Array.from({ length: 30 }, (_, i) => `<line x1="70" y1="${80 + i * 25}" x2="1530" y2="${80 + i * 25}" />`).join('')}
      ${Array.from({ length: 58 }, (_, i) => `<line x1="${80 + i * 25}" y1="70" x2="${80 + i * 25}" y2="830" />`).join('')}
    </g>

    <!-- Red Margin Line -->
    <line x1="200" y1="50" x2="200" y2="850" stroke="#f87171" stroke-width="2.5" opacity="0.6"/>

    <!-- Pushpins -->
    <circle cx="90" cy="90" r="14" fill="#ef4444" stroke="#7f1d1d" stroke-width="3"/>
    <circle cx="86" cy="86" r="4" fill="#fca5a5"/>
    <circle cx="1510" cy="90" r="14" fill="#ef4444" stroke="#7f1d1d" stroke-width="3"/>
    <circle cx="1506" cy="86" r="4" fill="#fca5a5"/>

    <!-- Header -->
    <text x="240" y="115" font-family="'Segoe UI', Arial, sans-serif" font-size="28" font-weight="bold" fill="#0f766e" letter-spacing="2">
      PHYSICS INVESTIGATION · UNIT 2
    </text>
    <text x="240" y="170" font-family="'Segoe UI', Georgia, serif" font-size="44" font-weight="bold" fill="#1e293b">
      Target Cup Prediction &amp; Complementary Launch Angles
    </text>
    <line x1="240" y1="195" x2="1480" y2="195" stroke="#0f766e" stroke-width="4"/>

    <!-- Investigation Prompt -->
    <text x="240" y="245" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#334155">
      INQUIRY QUESTION:
    </text>
    <text x="240" y="280" font-family="Georgia, serif" font-size="23" font-style="italic" fill="#1e293b">
      "For a target placed at x = 1.35 m with launch speed v₀ = 4.00 m/s, which two complementary launch angles hit the cup?"
    </text>

    <!-- Key Theoretical Formula Box -->
    <rect x="240" y="320" width="700" height="150" rx="10" fill="#f0fdf4" stroke="#22c55e" stroke-width="2.5"/>
    <text x="265" y="360" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#166534">
      LEVEL-LAUNCH RANGE EQUATION:
    </text>
    <text x="265" y="415" font-family="'Courier New', monospace" font-size="34" font-weight="bold" fill="#14532d">
      R = (v₀² · sin 2θ) / g
    </text>
    <text x="265" y="450" font-family="Arial, sans-serif" font-size="19" fill="#15803d">
      Complementary Angles: θ₂ = 90° − θ₁  produce identical horizontal range!
    </text>

    <!-- Prediction Table -->
    <rect x="240" y="495" width="1240" height="260" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
    <rect x="240" y="495" width="1240" height="48" rx="8" fill="#1e293b"/>
    <text x="280" y="528" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">Trial #</text>
    <text x="420" y="528" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">Launch Angle θ</text>
    <text x="660" y="528" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">Theoretical Range</text>
    <text x="960" y="528" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">Measured Range</text>
    <text x="1260" y="528" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">Target Cup Status</text>

    <g font-family="'Courier New', monospace" font-size="22" fill="#334155">
      <line x1="240" y1="595" x2="1480" y2="595" stroke="#e2e8f0" stroke-width="1.5"/>
      <text x="290" y="575">01</text>
      <text x="450" y="575">28.0° (Direct Arc)</text>
      <text x="700" y="575">1.35 m</text>
      <text x="1000" y="575">1.35 m</text>
      <text x="1270" y="575" fill="#16a34a" font-weight="bold">✓ DIRECT HIT</text>

      <line x1="240" y1="650" x2="1480" y2="650" stroke="#e2e8f0" stroke-width="1.5"/>
      <text x="290" y="630">02</text>
      <text x="450" y="630">62.0° (Lofted Arc)</text>
      <text x="700" y="630">1.35 m</text>
      <text x="1000" y="630">1.35 m</text>
      <text x="1270" y="630" fill="#16a34a" font-weight="bold">✓ DIRECT HIT</text>

      <line x1="240" y1="705" x2="1480" y2="705" stroke="#e2e8f0" stroke-width="1.5"/>
      <text x="290" y="685">03</text>
      <text x="450" y="685">45.0° (Max Range)</text>
      <text x="700" y="685">1.63 m</text>
      <text x="1000" y="685">1.63 m</text>
      <text x="1270" y="685" fill="#dc2626">Overshot (+0.28m)</text>
    </g>

    <!-- Teacher Stamp -->
    <g transform="translate(1120, 310) rotate(-4)">
      <rect x="0" y="0" width="340" height="90" rx="8" fill="none" stroke="#dc2626" stroke-width="4" stroke-dasharray="6,4"/>
      <text x="170" y="42" font-family="'Arial Black', Arial, sans-serif" font-size="28" font-weight="bold" fill="#dc2626" text-anchor="middle">
        VERIFIED BY TEACHER
      </text>
      <text x="170" y="72" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#dc2626" text-anchor="middle">
        AP PHYSICS 1 · LAB APPROVED
      </text>
    </g>

    <!-- Footer Note -->
    <text x="240" y="805" font-family="Arial, sans-serif" font-size="18" fill="#64748b">
      * Note: Air resistance slightly decreases actual landing distance (~1.5%). Use carbon witness paper to measure impact scatter.
    </text>
  </svg>`;
  return svgToDataUrl(svg);
}

/**
 * Generates an authentic derivation slide with vector decomposition and kinematic equations.
 */
function createDerivationNote(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs>
      <linearGradient id="boardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e3a2f"/>
        <stop offset="100%" stop-color="#14261f"/>
      </linearGradient>
    </defs>

    <!-- Chalkboard Panel Background -->
    <rect x="30" y="30" width="1540" height="840" rx="12" fill="url(#boardGrad)" stroke="#4a5f54" stroke-width="4"/>

    <!-- Header in Yellow Chalk -->
    <text x="80" y="105" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="44" font-weight="bold" fill="#fef08a">
      2D PROJECTILE TRAJECTORY DERIVATION
    </text>
    <text x="80" y="145" font-family="'Segoe UI', Arial, sans-serif" font-size="24" fill="#a7f3d0">
      Independence of Horizontal &amp; Vertical Motions under Uniform Gravity g = 9.81 m/s²
    </text>
    <line x1="80" y1="165" x2="1500" y2="165" stroke="rgba(254, 240, 138, 0.45)" stroke-width="3"/>

    <!-- Left Column: Vector Components -->
    <g transform="translate(80, 200)">
      <rect x="0" y="0" width="660" height="600" rx="10" fill="rgba(0,0,0,0.25)" stroke="#334d40" stroke-width="2"/>
      <text x="30" y="50" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#ffffff">
        1. Velocity Vector Decomposition:
      </text>

      <!-- Velocity Triangle SVG -->
      <line x1="60" y1="220" x2="280" y2="220" stroke="#38bdf8" stroke-width="4"/>
      <line x1="280" y1="220" x2="280" y2="100" stroke="#f43f5e" stroke-width="4"/>
      <line x1="60" y1="220" x2="280" y2="100" stroke="#fbbf24" stroke-width="5"/>

      <text x="140" y="255" font-family="'Courier New', monospace" font-size="24" font-weight="bold" fill="#38bdf8">v₀ₓ = v₀ cos θ</text>
      <text x="295" y="165" font-family="'Courier New', monospace" font-size="24" font-weight="bold" fill="#f43f5e">v₀ᵧ = v₀ sin θ</text>
      <text x="130" y="145" font-family="'Courier New', monospace" font-size="26" font-weight="bold" fill="#fbbf24">v₀ (Initial)</text>
      <text x="105" y="210" font-family="Arial, sans-serif" font-size="22" fill="#ffffff">θ</text>

      <text x="30" y="320" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#ffffff">
        2. Equations of Motion:
      </text>
      <text x="50" y="370" font-family="'Courier New', monospace" font-size="25" fill="#e2e8f0">
        x(t) = (v₀ cos θ) · t
      </text>
      <text x="50" y="420" font-family="'Courier New', monospace" font-size="25" fill="#e2e8f0">
        y(t) = h₀ + (v₀ sin θ) · t − ½ g t²
      </text>
      <text x="50" y="475" font-family="'Courier New', monospace" font-size="25" fill="#38bdf8">
        vₓ(t) = v₀ cos θ  (Constant Velocity)
      </text>
      <text x="50" y="525" font-family="'Courier New', monospace" font-size="25" fill="#f43f5e">
        vᵧ(t) = v₀ sin θ − g t  (Constant Accel.)
      </text>
    </g>

    <!-- Right Column: Trajectory Formula -->
    <g transform="translate(780, 200)">
      <rect x="0" y="0" width="740" height="600" rx="10" fill="rgba(0,0,0,0.25)" stroke="#334d40" stroke-width="2"/>
      <text x="30" y="50" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#ffffff">
        3. Parabolic Trajectory Equation y(x):
      </text>
      <text x="30" y="100" font-family="Arial, sans-serif" font-size="22" fill="#94a3b8">
        Eliminate parameter t = x / (v₀ cos θ) from vertical equation:
      </text>

      <!-- Formula Callout Box -->
      <rect x="30" y="130" width="680" height="130" rx="8" fill="rgba(251, 191, 36, 0.12)" stroke="#fbbf24" stroke-width="2.5"/>
      <text x="55" y="185" font-family="'Courier New', monospace" font-size="30" font-weight="bold" fill="#fde68a">
        y(x) = h₀ + tan(θ)·x − [g / (2v₀²cos²θ)]·x²
      </text>
      <text x="55" y="230" font-family="Arial, sans-serif" font-size="20" fill="#fef08a">
        Notice this has exact parabolic form y = A + Bx + Cx² where C &lt; 0!
      </text>

      <text x="30" y="310" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#ffffff">
        4. Apex &amp; Flight Time Properties:
      </text>
      <text x="50" y="360" font-family="'Courier New', monospace" font-size="24" fill="#a7f3d0">
        • At Apex: vᵧ = 0  =&gt;  t_apex = (v₀ sin θ) / g
      </text>
      <text x="50" y="410" font-family="'Courier New', monospace" font-size="24" fill="#a7f3d0">
        • Max Height: H_max = h₀ + (v₀² sin²θ) / (2g)
      </text>
      <text x="50" y="460" font-family="'Courier New', monospace" font-size="24" fill="#a7f3d0">
        • Total Flight Time (Level): T = 2 · t_apex = (2v₀ sin θ) / g
      </text>

      <rect x="30" y="500" width="680" height="70" rx="6" fill="#14532d"/>
      <text x="55" y="545" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#86efac">
        Maximum Theoretical Range Occurs at θ = 45.0° (Level Launch)
      </text>
    </g>
  </svg>`;
  return svgToDataUrl(svg);
}

/**
 * Generates a clean classroom laboratory protocol and safety poster.
 */
function createSafetyProtocolNote(): string {
  const rules = [
    { title: 'Eye protection', lines: ['Wear safety goggles', 'while the launcher', 'is cocked or under', 'pressure.'] },
    { title: 'Clear the range', lines: ['Keep everyone out of', 'the flight path and', 'landing area before', 'you launch.'] },
    { title: 'Secure the launcher', lines: ['Tighten the bench', 'clamp and the angle', 'lock before firing.'] },
  ];
  const cards = rules.map(({ title, lines }, index) => `
    <g transform="translate(${28 + index * 522} 136)">
      <rect width="500" height="336" rx="12" fill="#fffdf6" stroke="#c49b49" stroke-width="2"/>
      <circle cx="56" cy="56" r="28" fill="#513400"/>
      <text x="56" y="69" text-anchor="middle" font-size="38" font-weight="700" fill="#fff">${index + 1}</text>
      <text x="96" y="70" font-size="40" font-weight="700">${title}</text>
      <text font-size="43">${lines.map((line, i) => `<tspan x="34" y="${141 + i * 49}">${line}</tspan>`).join('')}</text>
    </g>`).join('');
  const angles = [15, 30, 45, 60, 75].map((angle, i) => `
    <text x="${158 + i * 305}" y="715" text-anchor="middle" font-size="68" font-weight="700">${angle}°</text>
  `).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="780" viewBox="0 0 1600 780">
    <rect x="4" y="4" width="1592" height="772" rx="16" fill="#f9ebc7" stroke="#e7aa35" stroke-width="8"/>
    <g font-family="Arial, sans-serif" fill="#1c242a">
      <rect x="20" y="20" width="1560" height="94" rx="10" fill="#513400"/>
      <text x="54" y="90" fill="#fff" font-size="68" font-weight="700">Physics lab safety</text>
      ${cards}
      <rect x="28" y="500" width="1544" height="252" rx="12" fill="#fffdf6" stroke="#c49b49" stroke-width="2"/>
      <text x="62" y="563" font-size="49" font-weight="700">Five launch angles</text>
      <text x="62" y="620" font-size="44">Keep launch speed at 4.00 m/s and launch height at 0.65 m.</text>
      <path d="M62 645H1538" stroke="#c49b49" stroke-width="2"/>
      ${angles}
    </g>
  </svg>`;
  return svgToDataUrl(svg);
}

export function updateSavedChalkboardPreset(image: string | null): string | null {
  const oldTitle = encodeURIComponent('PHYSICS LAB SAFETY DIRECTIVES &amp; PROTOCOL');
  const oldMatrix = encodeURIComponent('STANDARD 5-TRIAL INQUIRY MATRIX:');
  if (image?.startsWith('data:image/svg+xml;charset=utf-8,') && image.includes(oldTitle) && image.includes(oldMatrix)) {
    return SAMPLE_TEACHER_NOTE_IMAGES.safety;
  }
  return image;
}

export const SAMPLE_TEACHER_NOTE_IMAGES = {
  inquiry: createInquiryChallengeNote(),
  derivation: createDerivationNote(),
  safety: createSafetyProtocolNote(),
};
