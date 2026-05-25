export type Alarmes = {
  geral?: string;
  temperatura?: boolean;
  vibracao?: boolean;
  primario?: boolean;
  secundario?: boolean;
};

export type TelemetryPacket = {
  timestamp_pc?: string;
  type?: string;
  seq?: number;
  ms?: number;
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
