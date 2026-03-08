type WaveRibbonProps = {
  className: string;
  mirrored?: boolean;
  samples: number[];
};

function buildWavePath(samples: number[], width: number, height: number, mirrored: boolean) {
  const baseline = height / 2;
  const step = width / Math.max(1, samples.length - 1);

  return samples
    .map((sample, index) => {
      const x = mirrored ? width - index * step : index * step;
      const y = baseline - sample * (height * 0.38);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildGlowPath(samples: number[], width: number, height: number, mirrored: boolean) {
  const baseline = height / 2;
  const step = width / Math.max(1, samples.length - 1);

  return samples
    .map((sample, index) => {
      const x = mirrored ? width - index * step : index * step;
      const y = baseline + sample * (height * 0.22);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function WaveRibbon({ className, mirrored = false, samples }: WaveRibbonProps) {
  const normalized = samples.map((sample, index) => {
    const pulse = index % 3 === 0 ? 0.07 : 0;
    return Math.min(1, sample + pulse);
  });

  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 520 120" preserveAspectRatio="none">
      <path className="wave-trace wave-trace-cyan" d={buildWavePath(normalized, 520, 120, mirrored)} />
      <path className="wave-trace wave-trace-amber" d={buildGlowPath(normalized, 520, 120, mirrored)} />
      <path className="wave-trace wave-trace-fine" d={buildWavePath(normalized.map((sample) => sample * 0.52), 520, 120, mirrored)} />
    </svg>
  );
}