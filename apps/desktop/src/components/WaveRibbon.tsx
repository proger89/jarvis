type WaveRibbonProps = {
  className: string;
  mirrored?: boolean;
  samples: number[];
};

function smoothSamples(samples: number[]) {
  return samples.map((sample, index) => {
    const prev = samples[index - 1] ?? sample;
    const next = samples[index + 1] ?? sample;
    const mirrored = samples[samples.length - 1 - index] ?? sample;
    return (sample * 0.34 + prev * 0.2 + next * 0.2 + mirrored * 0.26);
  });
}

function buildWavePath(samples: number[], width: number, height: number, mirrored: boolean) {
  const baseline = height / 2;
  const step = width / Math.max(1, samples.length - 1);

  return samples
    .map((sample, index) => {
      const x = mirrored ? width - index * step : index * step;
      const y = baseline - sample * (height * 0.18);
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
      const y = baseline + sample * (height * 0.1);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function WaveRibbon({ className, mirrored = false, samples }: WaveRibbonProps) {
  const normalized = smoothSamples(samples).map((sample) => Math.min(1, sample * 0.58 + 0.03));
  const fine = normalized.map((sample) => sample * 0.42);

  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 520 120" preserveAspectRatio="none">
      <path className="wave-trace wave-trace-cyan" d={buildWavePath(normalized, 520, 120, mirrored)} />
      <path className="wave-trace wave-trace-amber" d={buildGlowPath(normalized, 520, 120, mirrored)} />
      <path className="wave-trace wave-trace-fine" d={`M0,60 L520,60`} />
      <path className="wave-trace wave-trace-fine" d={buildWavePath(fine, 520, 120, mirrored)} />
    </svg>
  );
}