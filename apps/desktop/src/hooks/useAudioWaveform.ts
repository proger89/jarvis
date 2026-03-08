import { useEffect, useRef, useState } from "react";

const SAMPLE_COUNT = 32;
const FRAME_INTERVAL_MS = 33;

export type AudioPermissionState = "pending" | "granted" | "denied" | "unavailable";

type AudioWaveformState = {
  permission: AudioPermissionState;
  level: number;
  samples: number[];
  start: () => Promise<void>;
  stop: () => void;
};

function createEmptySamples() {
  return Array.from({ length: SAMPLE_COUNT }, () => 0);
}

export function useAudioWaveform(inputDeviceId?: string): AudioWaveformState {
  const [permission, setPermission] = useState<AudioPermissionState>("pending");
  const [level, setLevel] = useState(0);
  const [samples, setSamples] = useState<number[]>(() => createEmptySamples());

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);

  function cleanupAudio() {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    analyserRef.current = null;

    if (contextRef.current) {
      void contextRef.current.close();
      contextRef.current = null;
    }
  }

  async function start() {
    if (!("mediaDevices" in navigator) || !navigator.mediaDevices?.getUserMedia) {
      setPermission("unavailable");
      return;
    }

    cleanupAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          ...(inputDeviceId && inputDeviceId !== "default"
            ? { deviceId: { exact: inputDeviceId } }
            : {}),
        },
      });

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.84;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      streamRef.current = stream;
      contextRef.current = audioContext;
      analyserRef.current = analyser;
      setPermission("granted");

      const timeDomain = new Uint8Array(analyser.fftSize);

      const tick = (timestamp: number) => {
        frameRef.current = requestAnimationFrame(tick);

        if (timestamp - lastFrameAtRef.current < FRAME_INTERVAL_MS) {
          return;
        }

        lastFrameAtRef.current = timestamp;
        analyser.getByteTimeDomainData(timeDomain);

        const nextSamples = createEmptySamples();
        const bucketSize = Math.floor(timeDomain.length / SAMPLE_COUNT);
        let energy = 0;

        for (let sampleIndex = 0; sampleIndex < SAMPLE_COUNT; sampleIndex += 1) {
          const startIndex = sampleIndex * bucketSize;
          const endIndex = sampleIndex === SAMPLE_COUNT - 1 ? timeDomain.length : startIndex + bucketSize;

          let bucketPeak = 0;
          for (let index = startIndex; index < endIndex; index += 1) {
            const centered = (timeDomain[index] - 128) / 128;
            const amplitude = Math.abs(centered);
            bucketPeak = Math.max(bucketPeak, amplitude);
            energy += centered * centered;
          }

          nextSamples[sampleIndex] = Math.min(1, bucketPeak * 1.9);
        }

        setSamples(nextSamples);
        setLevel(Math.min(1, Math.sqrt(energy / timeDomain.length) * 2.8));
      };

      frameRef.current = requestAnimationFrame(tick);
    } catch {
      setPermission("denied");
      setSamples(createEmptySamples());
      setLevel(0);
    }
  }

  function stop() {
    cleanupAudio();
    setSamples(createEmptySamples());
    setLevel(0);
    setPermission((current) => (current === "unavailable" ? current : "pending"));
  }

  useEffect(() => {
    void start();

    return () => {
      cleanupAudio();
    };
  }, [inputDeviceId]);

  return {
    permission,
    level,
    samples,
    start,
    stop,
  };
}