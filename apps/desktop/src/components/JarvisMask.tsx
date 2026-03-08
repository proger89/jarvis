import type { OverlayState } from "../types/overlay";

type JarvisMaskProps = {
  audioLevel: number;
  state: OverlayState;
};

export function JarvisMask({ audioLevel, state }: JarvisMaskProps) {
  const eyeScale = 1 + audioLevel * 0.08;
  const shellClassName = `jarvis-mask state-${state}`;

  return (
    <svg
      aria-label="Jarvis center mask"
      className={shellClassName}
      viewBox="0 0 380 540"
      fill="none"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="hud-cyan" x1="112" y1="120" x2="268" y2="442" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9df4ff" />
          <stop offset="1" stopColor="#00d7ff" />
        </linearGradient>
        <linearGradient id="hud-amber" x1="126" y1="164" x2="252" y2="360" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd36b" />
          <stop offset="1" stopColor="#ffad33" />
        </linearGradient>
        <linearGradient id="hud-eyes" x1="126" y1="198" x2="254" y2="198" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9dd9ff" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#9dd9ff" />
        </linearGradient>
        <radialGradient id="hud-core-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(190 260) rotate(90) scale(170 124)">
          <stop offset="0" stopColor="#1cc8ff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#1cc8ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="190" cy="256" rx="120" ry="166" className="helmet-aura" />
      <ellipse cx="190" cy="258" rx="92" ry="126" className="helmet-core-glow" />
      <path
        d="M190 42L268 76L294 160L280 282L248 396L190 494L132 396L100 282L86 160L112 76L190 42Z"
        className="helmet-shell"
      />
      <path d="M136 120L190 90L244 120L252 204L228 316L190 416L152 316L128 204L136 120Z" className="helmet-faceplate" />
      <path d="M148 78H232L220 112H160L148 78Z" className="helmet-crest" />
      <path d="M134 122L190 96L246 122" className="helmet-brow-line" />
      <path d="M128 204L146 320L190 448L234 320L252 204" className="helmet-jaw-line" />
      <path d="M108 138L92 196L96 310L124 392" className="helmet-side-shell" />
      <path d="M272 138L288 196L284 310L256 392" className="helmet-side-shell" />
      <path d="M128 182L166 166L154 208L118 220L128 182Z" className="helmet-eye-frame" />
      <path d="M252 182L214 166L226 208L262 220L252 182Z" className="helmet-eye-frame" />
      <path
        d="M130 187C142 178 152 174 165 172L154 205C142 209 129 207 120 202C122 196 125 192 130 187Z"
        className="helmet-eye-glow"
        style={{ transform: `scale(${eyeScale}, ${Math.max(0.96, 1 + audioLevel * 0.12)})`, transformOrigin: "142px 190px" }}
      />
      <path
        d="M250 187C238 178 228 174 215 172L226 205C238 209 251 207 260 202C258 196 255 192 250 187Z"
        className="helmet-eye-glow"
        style={{ transform: `scale(${eyeScale}, ${Math.max(0.96, 1 + audioLevel * 0.12)})`, transformOrigin: "238px 190px" }}
      />
      <path d="M174 236L190 230L206 236L210 312L190 370L170 312L174 236Z" className="helmet-nose-plate" />
      <path d="M142 248L158 214L178 252L154 292L142 248Z" className="helmet-amber-accent" />
      <path d="M238 248L222 214L202 252L226 292L238 248Z" className="helmet-amber-accent" />
      <path d="M158 390L190 434L222 390" className="helmet-mouth-guard" />
      <path d="M168 398H212" className="helmet-mouth-line" />
      <path d="M140 108L124 154" className="helmet-shell-highlight" />
      <path d="M240 108L256 154" className="helmet-shell-highlight" />
    </svg>
  );
}