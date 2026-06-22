import { useEffect, useRef, useState } from "react";
import {
  API_BASE,
  connectSerial,
  disconnectSerial,
  getLatestTelemetry,
  getPorts,
  getStatus,
  resetSerial,
  startSerial,
  stopSerial,
} from "./api/http";
import { createTelemetrySocket, SocketState } from "./api/socket";
import AlertPopup from "./components/AlertPopup";
import AlarmLed from "./components/AlarmLed";
import ControlPanel from "./components/ControlPanel";
import DiagnosticPanel from "./components/DiagnosticPanel";
import EventLog from "./components/EventLog";
import FFTChart from "./components/FFTChart";
import SampleChart from "./components/SampleChart";
import SpectrogramChart from "./components/SpectrogramChart";
import StatusCard from "./components/StatusCard";
import TrendChart from "./components/TrendChart";
import { Alarmes, DiagnosticAlert, StatusResponse, TelemetryPacket, TrendPoint } from "./types/telemetry";

const MAX_POINTS = 200;
const MAX_SPEC_COLUMNS = 120;

type LedState = "ok" | "warn" | "crit" | "idle";

type Accumulator = {
  key: string;
  label: string;
  tempSum: number;
  tempCount: number;
  vibSum: number;
  vibCount: number;
  primSum: number;
  primCount: number;
  secSum: number;
  secCount: number;
};

const initialStatus: StatusResponse = {
  connected: false,
  port: "COM2",
  baud: 57600,
  aquisicao: false,
  last_packet: null,
  last_error: null,
};

function App() {
  const [status, setStatus] = useState<StatusResponse>(initialStatus);
  const [ports, setPorts] = useState<string[]>(["COM2"]);
  const [selectedPort, setSelectedPort] = useState("COM2");
  const [selectedBaud, setSelectedBaud] = useState(57600);
  const [socketState, setSocketState] = useState<SocketState>("connecting");
  const [lastTelemetry, setLastTelemetry] = useState<TelemetryPacket | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [spectrogram, setSpectrogram] = useState<number[][]>([]);
  const [alertPopupOpen, setAlertPopupOpen] = useState(false);
  const perSecondRef = useRef<Accumulator | null>(null);
  const specSecondRef = useRef<string | null>(null);
  const lastDiagRef = useRef<string | null>(null);
  const lastPayloadKeyRef = useRef<string | null>(null);
  const activeAlertKeyRef = useRef<string | null>(null);
  const dismissedAlertKeyRef = useRef<string | null>(null);

  const handleTelemetry = (packet: TelemetryPacket) => {
    setLastTelemetry(packet);
    const alertKey = getAlertSignature(packet.diagnostic_alerts ?? []);
    activeAlertKeyRef.current = alertKey;
    if (alertKey) {
      if (dismissedAlertKeyRef.current !== alertKey) {
        setAlertPopupOpen(true);
      }
    } else {
      dismissedAlertKeyRef.current = null;
      setAlertPopupOpen(false);
    }

    const { secondKey, timeLabel } = getTimeInfo(packet.timestamp_pc);
    const isSamples = packet.data_mode === "samples";
    const stats = isSamples ? buildSampleStats(packet) : undefined;
    const tempValue = isSamples
      ? stats?.ntc_avg ?? null
      : packet.medidas?.temperatura_c ?? null;
    const vibValue = isSamples
      ? stats?.vibracao_rms ?? null
      : packet.medidas?.vibracao_rms_v ?? null;
    const primValue = isSamples
      ? stats?.sct_primario_rms ?? null
      : packet.medidas?.corrente_primario_a ?? null;
    const secValue = isSamples
      ? stats?.sct_secundario_rms ?? null
      : packet.medidas?.corrente_secundario_a ?? null;

    const currentAcc = perSecondRef.current;
    if (!currentAcc || currentAcc.key !== secondKey) {
      const nextAcc = createAccumulator(secondKey, timeLabel, tempValue, vibValue, primValue, secValue);
      perSecondRef.current = nextAcc;
      setTrend((prev) => {
        const next = [...prev, toTrendPoint(nextAcc)];
        if (next.length > MAX_POINTS) {
          next.shift();
        }
        return next;
      });
    } else {
      addAccumulatorValues(currentAcc, tempValue, vibValue, primValue, secValue);
      currentAcc.label = timeLabel;
      setTrend((prev) => {
        if (!prev.length) {
          return [toTrendPoint(currentAcc)];
        }
        const next = [...prev];
        next[next.length - 1] = toTrendPoint(currentAcc);
        return next;
      });
    }

    const diag = packet.diagnostico_python ?? packet.diagnostico_arduino;
    if (diag && diag !== lastDiagRef.current) {
      lastDiagRef.current = diag;
      setEvents((prev) => [`${timeLabel} - ${diag}`, ...prev].slice(0, 50));
    }

    if (packet.data_mode === "samples") {
      const spectrum = computeSpectrum(packet.samples?.vibracao ?? []);
      if (spectrum.length) {
        setSpectrogram((prev) => {
          if (prev.length && prev[0].length !== spectrum.length) {
            return [spectrum];
          }
          if (specSecondRef.current === secondKey) {
            const next = [...prev];
            if (next.length === 0) {
              return [spectrum];
            }
            next[next.length - 1] = spectrum;
            return next;
          }
          const next = [...prev, spectrum];
          if (next.length > MAX_SPEC_COLUMNS) {
            next.shift();
          }
          return next;
        });
        specSecondRef.current = secondKey;
      }
    }
  };

  const refreshStatus = async () => {
    try {
      const data = await getStatus();
      setStatus(data);
    } catch {
      setStatus((prev) => ({ ...prev, connected: false }));
    }
  };

  const refreshPorts = async () => {
    try {
      const list = await getPorts();
      setPorts(list.length ? list : ["COM2"]);
    } catch {
      setPorts(["COM2"]);
    }
  };

  useEffect(() => {
    refreshStatus();
    refreshPorts();
    const interval = setInterval(refreshStatus, 5000);
    const socket = createTelemetrySocket(handleTelemetry, setSocketState);
    return () => {
      clearInterval(interval);
      socket.close();
    };
  }, []);

  useEffect(() => {
    const pollLatest = async () => {
      if (socketState === "connected") {
        return;
      }
      try {
        const latest = await getLatestTelemetry();
        if (!latest) {
          return;
        }
        const key = getPayloadKey(latest);
        if (key && key === lastPayloadKeyRef.current) {
          return;
        }
        lastPayloadKeyRef.current = key;
        handleTelemetry(latest);
      } catch {
        // Ignore polling errors
      }
    };

    const poll = setInterval(pollLatest, 1000);
    return () => clearInterval(poll);
  }, [socketState]);

  const handleConnect = async () => {
    await connectSerial(selectedPort, selectedBaud);
    refreshStatus();
  };

  const handleDisconnect = async () => {
    await disconnectSerial();
    refreshStatus();
  };

  const handleStart = async () => {
    await startSerial();
  };

  const handleStop = async () => {
    await stopSerial();
  };

  const handleReset = async () => {
    await resetSerial();
  };

  const handleExportCsv = () => {
    window.open(`${API_BASE}/logs/export`, "_blank");
  };

  const handleReportPdf = () => {
    window.open(`${API_BASE}/report/pdf`, "_blank");
  };

  const handleCloseAlert = () => {
    dismissedAlertKeyRef.current = activeAlertKeyRef.current;
    setAlertPopupOpen(false);
  };

  const alarmes = lastTelemetry?.alarmes ?? {};
  const diagnosticAlerts = lastTelemetry?.diagnostic_alerts ?? [];
  const diagnosticAccent = severityToAccent(lastTelemetry?.diagnostic_severity);
  const isSamples = lastTelemetry?.data_mode === "samples";
  const sampleStats = isSamples ? buildSampleStats(lastTelemetry) : undefined;

  const fft120 = lastTelemetry?.fft?.amp_120hz ?? 0;
  const fft240 = lastTelemetry?.fft?.amp_240hz ?? 0;
  const geralText =
    diagnosticAccent === "crit"
      ? "Falha critica"
      : diagnosticAccent === "warn"
        ? "Aviso ativo"
        : typeof alarmes.geral === "string"
      ? alarmes.geral
      : status.connected
        ? "Conectado"
        : "Desconectado";
  const geralAccent =
    diagnosticAccent !== "idle"
      ? diagnosticAccent
      : alarmes.geral !== undefined
        ? alarmToAccent(alarmes.geral)
        : status.connected
          ? "ok"
          : "idle";

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="header-title">Painel Supervisao de Transformador</div>
          <div className="header-sub">Diagnostico em tempo real via Serial + WebSocket</div>
        </div>
        <div className="status-pill">
          <span>WS</span>
          <strong>{socketState}</strong>
          <span className="status-mode">{isSamples ? "samples" : "telemetry"}</span>
        </div>
      </header>

      <section className="panel">
        <div className="section-title">Controle</div>
        <ControlPanel
          ports={ports}
          selectedPort={selectedPort}
          selectedBaud={selectedBaud}
          onPortChange={setSelectedPort}
          onBaudChange={setSelectedBaud}
          onRefreshPorts={refreshPorts}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onStart={handleStart}
          onStop={handleStop}
          onReset={handleReset}
          onExportCsv={handleExportCsv}
          onReportPdf={handleReportPdf}
          connected={status.connected}
        />
      </section>

      <section className="grid-cards">
        <StatusCard
          label={isSamples ? "NTC (ADC)" : "Temperatura"}
          value={
            formatNumber(
              isSamples ? sampleStats?.ntc_avg : lastTelemetry?.medidas?.temperatura_c,
              2
            )
          }
          unit={isSamples ? "adc" : "C"}
          accent={mergeAccent(alarmToAccent(alarmes.temperatura), alertAccentFor(diagnosticAlerts, ["temperatura", "tendencia_temperatura"]))}
        />
        <StatusCard
          label={isSamples ? "Vibracao RMS (ADC)" : "Vibracao RMS"}
          value={
            formatNumber(
              isSamples ? sampleStats?.vibracao_rms : lastTelemetry?.medidas?.vibracao_rms_v,
              3
            )
          }
          unit={isSamples ? "adc" : "V"}
          accent={mergeAccent(alarmToAccent(alarmes.vibracao), alertAccentFor(diagnosticAlerts, ["vibracao"]))}
        />
        <StatusCard
          label={isSamples ? "SCT Prim RMS (ADC)" : "Corrente Primario"}
          value={
            formatNumber(
              isSamples
                ? sampleStats?.sct_primario_rms
                : lastTelemetry?.medidas?.corrente_primario_a,
              2
            )
          }
          unit={isSamples ? "adc" : "A"}
          accent={mergeAccent(alarmToAccent(alarmes.primario), alertAccentFor(diagnosticAlerts, ["primario"]))}
        />
        <StatusCard
          label={isSamples ? "SCT Sec RMS (ADC)" : "Corrente Secundario"}
          value={
            formatNumber(
              isSamples
                ? sampleStats?.sct_secundario_rms
                : lastTelemetry?.medidas?.corrente_secundario_a,
              2
            )
          }
          unit={isSamples ? "adc" : "A"}
          accent={mergeAccent(alarmToAccent(alarmes.secundario), alertAccentFor(diagnosticAlerts, ["secundario"]))}
        />
        <StatusCard
          label="FFT 120 Hz"
          value={formatNumber(fft120, 3)}
          unit="amp"
          accent={mergeAccent(fft120 > 0.35 ? "warn" : "idle", alertAccentFor(diagnosticAlerts, ["fft_120hz"]))}
        />
        <StatusCard
          label="FFT 240 Hz"
          value={formatNumber(fft240, 3)}
          unit="amp"
          accent={mergeAccent(fft240 > 0.3 ? "warn" : "idle", alertAccentFor(diagnosticAlerts, ["fft_240hz"]))}
        />
        <StatusCard
          label="Status Geral"
          value={geralText}
          unit={status.port ?? "COM2"}
          accent={geralAccent}
        />
      </section>

      <section className="panel">
        <div className="section-title">LEDs de Alarme</div>
        <div className="grid-leds">
          <AlarmLed label="Geral" status={geralAccent} />
          <AlarmLed
            label="Temperatura"
            status={mergeAccent(alarmToAccent(alarmes.temperatura), alertAccentFor(diagnosticAlerts, ["temperatura", "tendencia_temperatura"]))}
          />
          <AlarmLed
            label="Vibracao"
            status={mergeAccent(alarmToAccent(alarmes.vibracao), alertAccentFor(diagnosticAlerts, ["vibracao", "fft_120hz", "fft_240hz"]))}
          />
          <AlarmLed
            label="Primario"
            status={mergeAccent(alarmToAccent(alarmes.primario), alertAccentFor(diagnosticAlerts, ["primario"]))}
          />
          <AlarmLed
            label="Secundario"
            status={mergeAccent(alarmToAccent(alarmes.secundario), alertAccentFor(diagnosticAlerts, ["secundario"]))}
          />
        </div>
      </section>

      <section className="charts-grid">
        <TrendChart
          title={isSamples ? "Tendencia NTC (ADC)" : "Tendencia Temperatura"}
          data={trend}
          dataKey="temp"
          color="#ff9f43"
          unit={isSamples ? "adc" : "C"}
        />
        <TrendChart
          title={isSamples ? "Tendencia Vibracao (ADC)" : "Tendencia Vibracao"}
          data={trend}
          dataKey="vib"
          color="#2ed0ff"
          unit={isSamples ? "adc" : "V"}
        />
        <TrendChart
          title={isSamples ? "Tendencia SCT Prim (ADC)" : "Tendencia Corrente Primario"}
          data={trend}
          dataKey="prim"
          color="#34d399"
          unit={isSamples ? "adc" : "A"}
        />
        <TrendChart
          title={isSamples ? "Tendencia SCT Sec (ADC)" : "Tendencia Corrente Secundario"}
          data={trend}
          dataKey="sec"
          color="#c084fc"
          unit={isSamples ? "adc" : "A"}
        />
        <FFTChart amp120={fft120} amp240={fft240} />
        {isSamples && (
          <SampleChart
            title="Amostras Vibracao (ADC)"
            samples={lastTelemetry?.samples?.vibracao ?? []}
            color="#2ed0ff"
          />
        )}
        {isSamples && (
          <SpectrogramChart
            title="Espectrograma Vibracao"
            columns={spectrogram}
            sampleRate={lastTelemetry?.fs}
          />
        )}
      </section>

      <section className="panel diagnostic-grid">
        <DiagnosticPanel
          diagnosticoArduino={lastTelemetry?.diagnostico_arduino}
          diagnosticoPython={lastTelemetry?.diagnostico_python}
          alerts={diagnosticAlerts}
        />
        <EventLog events={events} />
      </section>
      <AlertPopup alerts={diagnosticAlerts} open={alertPopupOpen} onClose={handleCloseAlert} />
    </div>
  );
}

function formatNumber(value?: number | null, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(digits);
}

function getTimeInfo(iso?: string) {
  const dt = iso ? new Date(iso) : new Date();
  const safeDate = Number.isNaN(dt.getTime()) ? new Date() : dt;
  const secondKey = safeDate.toISOString().slice(0, 19);
  const timeLabel = safeDate.toLocaleTimeString();
  return { secondKey, timeLabel };
}

function alarmToAccent(value: Alarmes[keyof Alarmes] | undefined): LedState {
  if (value === undefined || value === null) {
    return "idle";
  }
  if (typeof value === "boolean") {
    return value ? "crit" : "ok";
  }
  const normalized = value.toLowerCase();
  if (normalized.includes("vermelho") || normalized.includes("red")) {
    return "crit";
  }
  if (normalized.includes("amarelo") || normalized.includes("yellow")) {
    return "warn";
  }
  if (normalized.includes("verde") || normalized.includes("green")) {
    return "ok";
  }
  return "idle";
}

function severityToAccent(value: TelemetryPacket["diagnostic_severity"] | undefined): LedState {
  if (value === "crit" || value === "warn" || value === "ok") {
    return value;
  }
  return "idle";
}

function alertAccentFor(alerts: DiagnosticAlert[], fields: string[]): LedState {
  let accent: LedState = "idle";
  for (const alert of alerts) {
    if (!fields.includes(alert.field)) {
      continue;
    }
    accent = mergeAccent(accent, severityToAccent(alert.severity));
  }
  return accent;
}

function mergeAccent(current: LedState, incoming: LedState): LedState {
  const rank: Record<LedState, number> = {
    idle: 0,
    ok: 1,
    warn: 2,
    crit: 3,
  };
  return rank[incoming] > rank[current] ? incoming : current;
}

function getAlertSignature(alerts: DiagnosticAlert[]) {
  if (!alerts.length) {
    return null;
  }
  return alerts
    .map((alert) => `${alert.field}:${alert.severity}:${alert.limit ?? ""}`)
    .sort()
    .join("|");
}

function computeSpectrum(samples: number[]) {
  const n = samples.length;
  if (n < 8) {
    return [];
  }

  const windowed = samples.map((value, index) => {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (n - 1)));
    return value * w;
  });

  const half = Math.floor(n / 2);
  const spectrum = new Array(half).fill(0).map((_, k) => {
    let real = 0;
    let imag = 0;
    for (let i = 0; i < n; i += 1) {
      const angle = (2 * Math.PI * k * i) / n;
      real += windowed[i] * Math.cos(angle);
      imag -= windowed[i] * Math.sin(angle);
    }
    const mag = Math.sqrt(real * real + imag * imag) / n;
    return 20 * Math.log10(mag + 1e-9);
  });

  return spectrum;
}

function normalizeValue(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : null;
}

function buildSampleStats(packet?: TelemetryPacket | null) {
  if (!packet) {
    return undefined;
  }

  const stats = packet.sample_stats;
  if (
    stats &&
    (stats.ntc_avg !== undefined ||
      stats.vibracao_rms !== undefined ||
      stats.sct_primario_rms !== undefined ||
      stats.sct_secundario_rms !== undefined)
  ) {
    return stats;
  }

  const ntc = packet.samples?.ntc ?? [];
  const vib = packet.samples?.vibracao ?? [];
  const prim = packet.samples?.sct_primario ?? [];
  const sec = packet.samples?.sct_secundario ?? [];

  return {
    ntc_avg: meanValue(ntc),
    vibracao_rms: rmsValue(vib),
    sct_primario_rms: rmsValue(prim),
    sct_secundario_rms: rmsValue(sec),
  };
}

function meanValue(values: number[]) {
  if (!values.length) {
    return undefined;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function rmsValue(values: number[]) {
  if (!values.length) {
    return undefined;
  }
  let sum = 0;
  for (const value of values) {
    sum += value * value;
  }
  return Math.sqrt(sum / values.length);
}

function getPayloadKey(payload: TelemetryPacket) {
  if (payload.timestamp_pc) {
    return payload.timestamp_pc;
  }
  if (payload.ms !== undefined && payload.ms !== null) {
    return String(payload.ms);
  }
  return null;
}

function createAccumulator(
  key: string,
  label: string,
  temp: number | null,
  vib: number | null,
  prim: number | null,
  sec: number | null
): Accumulator {
  const acc: Accumulator = {
    key,
    label,
    tempSum: 0,
    tempCount: 0,
    vibSum: 0,
    vibCount: 0,
    primSum: 0,
    primCount: 0,
    secSum: 0,
    secCount: 0,
  };
  addAccumulatorValues(acc, temp, vib, prim, sec);
  return acc;
}

function addAccumulatorValues(
  acc: Accumulator,
  temp: number | null,
  vib: number | null,
  prim: number | null,
  sec: number | null
) {
  if (temp !== null && !Number.isNaN(temp)) {
    acc.tempSum += temp;
    acc.tempCount += 1;
  }
  if (vib !== null && !Number.isNaN(vib)) {
    acc.vibSum += vib;
    acc.vibCount += 1;
  }
  if (prim !== null && !Number.isNaN(prim)) {
    acc.primSum += prim;
    acc.primCount += 1;
  }
  if (sec !== null && !Number.isNaN(sec)) {
    acc.secSum += sec;
    acc.secCount += 1;
  }
}

function toTrendPoint(acc: Accumulator): TrendPoint {
  return {
    t: acc.label,
    temp: acc.tempCount ? acc.tempSum / acc.tempCount : null,
    vib: acc.vibCount ? acc.vibSum / acc.vibCount : null,
    prim: acc.primCount ? acc.primSum / acc.primCount : null,
    sec: acc.secCount ? acc.secSum / acc.secCount : null,
  };
}

export default App;
