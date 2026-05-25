import { useEffect, useRef } from "react";

type SpectrogramChartProps = {
  title: string;
  columns: number[][];
  sampleRate?: number;
};

const MIN_DB = -80;
const MAX_DB = -10;

function SpectrogramChart({ title, columns, sampleRate }: SpectrogramChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!columns.length) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const frame = canvas.parentElement;
    if (!frame) {
      return;
    }

    const width = frame.clientWidth;
    const height = frame.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const bins = columns[0]?.length ?? 0;
    if (!bins) {
      return;
    }

    const colWidth = width / columns.length;
    const binHeight = height / bins;

    for (let x = 0; x < columns.length; x += 1) {
      const column = columns[x] ?? [];
      for (let y = 0; y < bins; y += 1) {
        const value = column[y] ?? MIN_DB;
        ctx.fillStyle = colorForValue(value);
        const yPos = height - (y + 1) * binHeight;
        ctx.fillRect(x * colWidth, yPos, colWidth + 1, binHeight + 1);
      }
    }
  }, [columns]);

  const nyquist = sampleRate ? Math.round(sampleRate / 2) : null;

  return (
    <div className="card chart-card">
      <div className="status-label">{title}</div>
      {columns.length === 0 ? (
        <div className="placeholder">Sem dados</div>
      ) : (
        <>
          <div className="spectrogram-frame">
            <canvas ref={canvasRef} className="spectrogram-canvas" />
          </div>
          <div className="spectrogram-axis">
            <span>0 Hz</span>
            <span>{nyquist ? `${nyquist} Hz` : "Nyquist"}</span>
          </div>
        </>
      )}
    </div>
  );
}

function colorForValue(dbValue: number) {
  const clamped = Math.min(MAX_DB, Math.max(MIN_DB, dbValue));
  const t = (clamped - MIN_DB) / (MAX_DB - MIN_DB);
  const stops = [
    { t: 0, c: [8, 12, 20] },
    { t: 0.35, c: [24, 82, 140] },
    { t: 0.65, c: [40, 200, 140] },
    { t: 1, c: [255, 205, 80] },
  ];

  for (let i = 0; i < stops.length - 1; i += 1) {
    const current = stops[i];
    const next = stops[i + 1];
    if (t >= current.t && t <= next.t) {
      const localT = (t - current.t) / (next.t - current.t);
      const r = lerp(current.c[0], next.c[0], localT);
      const g = lerp(current.c[1], next.c[1], localT);
      const b = lerp(current.c[2], next.c[2], localT);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  return "rgb(8, 12, 20)";
}

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

export default SpectrogramChart;
