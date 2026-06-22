export type Alarmes = {
  geral?: string;
  temperatura?: boolean;
  vibracao?: boolean;
  primario?: boolean;
  secundario?: boolean;
};

export type DiagnosticAlert = {
  field: string;
  label: string;
  severity: "ok" | "warn" | "crit";
  value?: number;
  unit?: string;
  limit?: number;
  description: string;
  recommended_actions: string[];
};

export type TelemetryPacket = {
  timestamp_pc?: string;
  type?: string;
  data_mode?: "telemetry" | "samples";
  seq?: number;
  ms?: number;
  fs?: number;
  samples?: {
    ntc?: number[];
    vibracao?: number[];
    sct_primario?: number[];
    sct_secundario?: number[];
  };
  sample_stats?: {
    ntc_avg?: number;
    vibracao_rms?: number;
    sct_primario_rms?: number;
    sct_secundario_rms?: number;
  };
  adc?: {
    ntc?: number;
    vibracao?: number;
    sct_primario?: number;
    sct_secundario?: number;
  };
  medidas?: {
    temperatura_c?: number;
    vibracao_rms_v?: number;
    corrente_primario_a?: number;
    corrente_secundario_a?: number;
  };
  alarmes?: Alarmes;
  diagnostico_arduino?: string;
  diagnostico_python?: string;
  diagnostic_alerts?: DiagnosticAlert[];
  diagnostic_severity?: "ok" | "warn" | "crit";
  fft?: {
    amp_120hz?: number;
    amp_240hz?: number;
  };
};

export type StatusResponse = {
  connected: boolean;
  port?: string;
  baud?: number;
  aquisicao?: boolean;
  last_packet?: Record<string, unknown> | null;
  last_error?: string | null;
};

export type TrendPoint = {
  t: string;
  temp?: number | null;
  vib?: number | null;
  prim?: number | null;
  sec?: number | null;
};
