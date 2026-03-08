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
        <linearGradient id="helmet-shell-red" x1="190" y1="20" x2="190" y2="520" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a61d2d" />
          <stop offset="0.4" stopColor="#6e0f1a" />
          <stop offset="1" stopColor="#2b0810" />
        </linearGradient>
        <linearGradient id="helmet-gold" x1="190" y1="70" x2="190" y2="492" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff0aa" />
          <stop offset="0.18" stopColor="#f8ca57" />
          <stop offset="0.56" stopColor="#b66a16" />
          <stop offset="1" stopColor="#6b2f08" />
        </linearGradient>
        <linearGradient id="helmet-gold-edge" x1="130" y1="110" x2="255" y2="430" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe39a" />
          <stop offset="1" stopColor="#92500d" />
        </linearGradient>
        <linearGradient id="helmet-eyes" x1="116" y1="202" x2="264" y2="202" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#b6e6ff" />
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.54" stopColor="#effcff" />
          <stop offset="1" stopColor="#9dd5ff" />
        </linearGradient>
        <radialGradient id="helmet-eye-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(190 208) rotate(90) scale(120 86)">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.4" stopColor="#ccf0ff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#73bdff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="helmet-shell-shine" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(180 160) rotate(90) scale(170 120)">
          <stop offset="0" stopColor="#8ce8ff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#8ce8ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="190" cy="234" rx="138" ry="190" className="helmet-aura" />
      <path
        d="M190 24C270 26 319 80 329 158C338 232 329 312 300 400C284 448 252 493 190 520C128 493 96 448 80 400C51 312 42 232 51 158C61 80 110 26 190 24Z"
        className="helmet-shell"
      />
      <path d="M190 44C233 45 264 60 281 92L270 139H110L99 92C116 60 147 45 190 44Z" className="helmet-crown" />
      <path d="M158 28H222C227 28 231 32 231 37V79C231 92 221 102 208 102H172C159 102 149 92 149 79V37C149 32 153 28 158 28Z" className="helmet-crest" />
      <path
        d="M108 122C137 88 236 80 272 122C282 180 277 234 260 287C251 314 236 338 214 355L226 424L190 486L154 424L166 355C144 338 129 314 120 287C103 234 98 180 108 122Z"
        className="helmet-faceplate"
      />
      <path d="M140 146L190 124L240 146" className="helmet-brow-line" />
      <path d="M121 284L150 352L190 396L230 352L259 284" className="helmet-jaw-line" />
      <path d="M108 146L84 198L92 344L120 420L158 480L104 438L74 370L62 242L70 144L108 146Z" className="helmet-side-shell" />
      <path d="M272 146L296 198L288 344L260 420L222 480L276 438L306 370L318 242L310 144L272 146Z" className="helmet-side-shell" />
      <path d="M122 186L165 170L156 210L108 221L122 186Z" className="helmet-eye-frame" />
      <path d="M258 186L215 170L224 210L272 221L258 186Z" className="helmet-eye-frame" />
      <path
        d="M128 190C139 180 150 176 164 174C160 189 156 202 150 211C138 212 126 209 118 204C120 198 123 194 128 190Z"
        className="helmet-eye-glow"
        style={{ transform: `scale(${eyeScale}, ${Math.max(0.94, 1 + audioLevel * 0.2)})`, transformOrigin: "141px 194px" }}
      />
      <path
        d="M252 190C241 180 230 176 216 174C220 189 224 202 230 211C242 212 254 209 262 204C260 198 257 194 252 190Z"
        className="helmet-eye-glow"
        style={{ transform: `scale(${eyeScale}, ${Math.max(0.94, 1 + audioLevel * 0.2)})`, transformOrigin: "239px 194px" }}
      />
      <path d="M170 242L190 232L210 242L216 333L190 394L164 333L170 242Z" className="helmet-nose-plate" />
      <path d="M132 414L157 367L190 400L223 367L248 414L222 434L190 456L158 434L132 414Z" className="helmet-mouth-guard" />
      <path d="M158 430H222" className="helmet-mouth-line" />
      <path d="M120 154L146 140L136 198L108 210L120 154Z" className="helmet-cheek-shine" />
      <path d="M260 154L234 140L244 198L272 210L260 154Z" className="helmet-cheek-shine" />
      <path d="M114 326L142 308L134 354L102 378L114 326Z" className="helmet-gold-edge" />
      <path d="M266 326L238 308L246 354L278 378L266 326Z" className="helmet-gold-edge" />
      <circle cx="104" cy="130" r="5.8" className="helmet-bolt" />
      <circle cx="276" cy="130" r="5.8" className="helmet-bolt" />
      <circle cx="88" cy="320" r="5.8" className="helmet-bolt" />
      <circle cx="292" cy="320" r="5.8" className="helmet-bolt" />
      <path d="M115 94C131 64 156 48 190 46" className="helmet-shell-highlight" />
      <path d="M265 94C249 64 224 48 190 46" className="helmet-shell-highlight" />
      <ellipse cx="182" cy="98" rx="84" ry="54" className="helmet-face-shine" />
    </svg>
  );
}