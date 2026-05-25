import { useEffect, useRef, useState } from "react";
import {
  API_BASE,
  connectSerial,
  disconnectSerial,
  getPorts,
  getStatus,
  resetSerial,
  startSerial,
  stopSerial,
} from "./api/http";
import { createTelemetrySocket, SocketState } from "./api/socket";
import AlarmLed from "./components/AlarmLed";
import ControlPanel from "./components/ControlPanel";
import DiagnosticPanel from "./components/DiagnosticPanel";
import EventLog from "./components/EventLog";
import FFTChart from "./components/FFTChart";
import StatusCard from "./components/StatusCard";
import TrendChart from "./components/TrendChart";
import { Alarmes, StatusResponse, TelemetryPacket, TrendPoint } from "./types/telemetry";

const MAX_POINTS = 200;

type LedState = "ok" | "warn" | "crit" | "idle";

const initialStatus: StatusResponse = {
  connected: false,
  port: "COM2",
  baud: 9600,
  aquisicao: false,
  last_packet: null,
  last_error: null,
};

function App() {
  const [status, setStatus] = useState<StatusResponse>(initialStatus);
  const [ports, setPorts] = useState<string[]>(["COM2"]);
  const [selectedPort, setSelectedPort] = useState("COM2");
  const [selectedBaud, setSelectedBaud] = useState(9600);
  const [socketState, setSocketState] = useState<SocketState>("connecting");
  const [lastTelemetry, setLastTelemetry] = useState<TelemetryPacket | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const lastDiagRef = useRef<string | null>(null);

  const handleTelemetry = (packet: TelemetryPacket) => {
    setLastTelemetry(packet);
    const timeLabel = formatTime(packet.timestamp_pc);
    setTrend((prev) => {
      const next = [
        ...prev,
        {
          t: timeLabel,
          temp: packet.medidas?.temperatura_c ?? null,
          vib: packet.medidas?.vibracao_rms_v ?? null,
          prim: packet.medidas?.corrente_primario_a ?? null,
          sec: packet.medidas?.corrente_secundario_a ?? null,
        },
      ];
      if (next.length > MAX_POINTS) {
        next.shift();
      }
      return next;
    });

    const diag = packet.diagnostico_python ?? packet.diagnostico_arduino;
    if (diag && diag !== lastDiagRef.current) {
      lastDiagRef.current = diag;
      setEvents((prev) => [`${timeLabel} - ${diag}`, ...prev].slice(0, 50));
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

  const alarmes = lastTelemetry?.alarmes ?? {};

  const fft120 = lastTelemetry?.fft?.amp_120hz ?? 0;
  const fft240 = lastTelemetry?.fft?.amp_240hz ?? 0;
  const geralText =
    typeof alarmes.geral === "string"
      ? alarmes.geral
      : status.connected
        ? "Conectado"
        : "Desconectado";
  const geralAccent =
    alarmes.geral !== undefined ? alarmToAccent(alarmes.geral) : status.connected ? "ok" : "idle";

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
          label="Temperatura"
          value={formatNumber(lastTelemetry?.medidas?.temperatura_c, 2)}
          unit="C"
          accent={alarmToAccent(alarmes.temperatura)}
        />
        <StatusCard
          label="Vibracao RMS"
          value={formatNumber(lastTelemetry?.medidas?.vibracao_rms_v, 3)}
          unit="V"
          accent={alarmToAccent(alarmes.vibracao)}
        />
        <StatusCard
          label="Corrente Primario"
          value={formatNumber(lastTelemetry?.medidas?.corrente_primario_a, 2)}
          unit="A"
          accent={alarmToAccent(alarmes.primario)}
        />
        <StatusCard
          label="Corrente Secundario"
          value={formatNumber(lastTelemetry?.medidas?.corrente_secundario_a, 2)}
          unit="A"
          accent={alarmToAccent(alarmes.secundario)}
        />
        <StatusCard
          label="FFT 120 Hz"
          value={formatNumber(fft120, 3)}
          unit="amp"
          accent={fft120 > 0.35 ? "warn" : "idle"}
        />
        <StatusCard
          label="FFT 240 Hz"
          value={formatNumber(fft240, 3)}
          unit="amp"
          accent={fft240 > 0.3 ? "warn" : "idle"}
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
          <AlarmLed label="Geral" status={alarmToAccent(alarmes.geral)} />
          <AlarmLed label="Temperatura" status={alarmToAccent(alarmes.temperatura)} />
          <AlarmLed label="Vibracao" status={alarmToAccent(alarmes.vibracao)} />
          <AlarmLed label="Primario" status={alarmToAccent(alarmes.primario)} />
          <AlarmLed label="Secundario" status={alarmToAccent(alarmes.secundario)} />
        </div>
      </section>

      <section className="charts-grid">
        <TrendChart title="Tendencia Temperatura" data={trend} dataKey="temp" color="#ff9f43" unit="C" />
        <TrendChart title="Tendencia Vibracao" data={trend} dataKey="vib" color="#2ed0ff" unit="V" />
        <TrendChart title="Tendencia Corrente Primario" data={trend} dataKey="prim" color="#34d399" unit="A" />
        <TrendChart title="Tendencia Corrente Secundario" data={trend} dataKey="sec" color="#c084fc" unit="A" />
        <FFTChart amp120={fft120} amp240={fft240} />
      </section>

      <section className="panel diagnostic-grid">
        <DiagnosticPanel
          diagnosticoArduino={lastTelemetry?.diagnostico_arduino}
          diagnosticoPython={lastTelemetry?.diagnostico_python}
        />
        <EventLog events={events} />
      </section>
    </div>
  );
}

function formatNumber(value?: number | null, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(digits);
}

function formatTime(iso?: string) {
  if (!iso) {
    return new Date().toLocaleTimeString();
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    return new Date().toLocaleTimeString();
  }
  return dt.toLocaleTimeString();
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

export default App;
