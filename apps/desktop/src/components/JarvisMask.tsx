import type { OverlayState } from "../types/overlay";

type JarvisMaskProps = {
  audioLevel: number;
  state: OverlayState;
};

export function JarvisMask({ audioLevel, state }: JarvisMaskProps) {
  const eyeScale = 1 + audioLevel * 0.18;
  const shellClassName = `jarvis-mask state-${state}`;

  return (
    <svg
      aria-label="Jarvis center mask"
      className={shellClassName}
      viewBox="0 0 340 520"
      fill="none"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="mask-shell-gradient" x1="170" y1="18" x2="170" y2="490" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0c85a7" />
          <stop offset="0.45" stopColor="#063f58" />
          <stop offset="1" stopColor="#021b2a" />
        </linearGradient>
        <linearGradient id="mask-core-gradient" x1="170" y1="90" x2="170" y2="430" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#123345" />
          <stop offset="1" stopColor="#071520" />
        </linearGradient>
        <linearGradient id="mask-amber-gradient" x1="95" y1="160" x2="245" y2="340" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd36b" />
          <stop offset="1" stopColor="#ff9e2f" />
        </linearGradient>
        <radialGradient id="eye-glow-gradient" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(170 190) rotate(90) scale(120 70)">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.42" stopColor="#cafcff" />
          <stop offset="1" stopColor="#4ccfff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="170" cy="210" rx="110" ry="164" className="mask-aura" />
      <path
        d="M170 18L260 54L294 164L274 320L224 432L170 490L116 432L66 320L46 164L80 54L170 18Z"
        className="mask-outline"
      />
      <path
        d="M170 62L235 90L253 171L241 296L205 390L170 430L135 390L99 296L87 171L105 90L170 62Z"
        className="mask-shell"
      />
      <path d="M170 44L220 66L238 116L226 178L202 120L170 102L138 120L114 178L102 116L120 66L170 44Z" className="mask-shell-top" />
      <path
        d="M117 114L164 84L223 114L229 203L202 266L170 286L138 266L111 203L117 114Z"
        className="mask-faceplate"
      />
      <path
        d="M138 138L168 122L202 138L206 214L186 256L170 266L154 256L134 214L138 138Z"
        className="mask-core"
      />
      <path d="M122 120L170 88L218 120" className="mask-panel-line" />
      <path d="M111 206L133 285L170 334L207 285L229 206" className="mask-panel-line" />
      <path d="M155 286L170 272L185 286" className="mask-panel-line" />
      <path
        d="M114 175L150 156L141 207L92 224L114 175Z"
        className="mask-accent"
      />
      <path
        d="M226 175L190 156L199 207L248 224L226 175Z"
        className="mask-accent"
      />
      <path
        d="M97 268L132 223L145 287L111 339L97 268Z"
        className="mask-accent"
      />
      <path
        d="M243 268L208 223L195 287L229 339L243 268Z"
        className="mask-accent"
      />
      <path d="M89 154L111 133L104 222L82 236L89 154Z" className="mask-side-plate" />
      <path d="M251 154L229 133L236 222L258 236L251 154Z" className="mask-side-plate" />
      <path
        d="M82 358L126 322L116 374L68 408L82 358Z"
        className="mask-edge-line"
      />
      <path
        d="M258 358L214 322L224 374L272 408L258 358Z"
        className="mask-edge-line"
      />
      <path
        d="M126 172L160 154L148 206L112 216L126 172Z"
        className="mask-eye-frame"
      />
      <path
        d="M214 172L180 154L192 206L228 216L214 172Z"
        className="mask-eye-frame"
      />
      <path
        d="M132 181L158 167L150 198L122 208L132 181Z"
        className="mask-eye-light"
        style={{ transform: `scale(${eyeScale}, ${Math.max(0.92, 1 + audioLevel * 0.34)})`, transformOrigin: "140px 188px" }}
      />
      <path
        d="M208 181L182 167L190 198L218 208L208 181Z"
        className="mask-eye-light"
        style={{ transform: `scale(${eyeScale}, ${Math.max(0.92, 1 + audioLevel * 0.34)})`, transformOrigin: "200px 188px" }}
      />
      <path d="M124 212L156 202" className="mask-eye-trail" />
      <path d="M216 212L184 202" className="mask-eye-trail" />
      <path d="M162 284H178V370H152L162 284Z" className="mask-nose" />
      <path d="M142 392H198L188 406H152L142 392Z" className="mask-mouth" />
      <path d="M146 96H194L182 142H158L146 96Z" className="mask-crown" />
      <path d="M105 88L145 71L132 123L112 135L105 88Z" className="mask-cheek-line" />
      <path d="M235 88L195 71L208 123L228 135L235 88Z" className="mask-cheek-line" />
      <path d="M170 430L144 390L170 452L196 390L170 430Z" className="mask-jaw-highlight" />
    </svg>
  );
}