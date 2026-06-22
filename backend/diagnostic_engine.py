from __future__ import annotations

from collections import deque
from typing import Any, Dict, Iterable, List, Tuple

import numpy as np


class FftAnalyzer:
    def __init__(self, sample_rate_hz: float = 1000.0, buffer_size: int = 256) -> None:
        self.sample_rate_hz = sample_rate_hz
        self.buffer_size = buffer_size
        self._buffer = deque(maxlen=buffer_size)

    def add_sample(self, value: Any) -> Tuple[float, float]:
        return self.add_samples([value])

    def add_samples(self, values: Iterable[Any]) -> Tuple[float, float]:
        for value in values:
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                continue
            self._buffer.append(numeric)

        if len(self._buffer) < self.buffer_size:
            return 0.0, 0.0

        return self._compute_fft(np.array(self._buffer, dtype=float), self.sample_rate_hz)

    def analyze_samples(
        self, values: Iterable[Any], sample_rate: float | None = None
    ) -> Tuple[float, float]:
        samples = []
        for value in values:
            try:
                samples.append(float(value))
            except (TypeError, ValueError):
                continue

        if len(samples) < 8:
            return 0.0, 0.0

        rate = float(sample_rate) if sample_rate else self.sample_rate_hz
        return self._compute_fft(np.array(samples, dtype=float), rate)

    def _compute_fft(self, data: np.ndarray, sample_rate: float) -> Tuple[float, float]:
        data = data - np.mean(data)
        window = np.hanning(len(data))
        spectrum = np.fft.rfft(data * window)
        freqs = np.fft.rfftfreq(len(data), d=1.0 / sample_rate)
        mags = np.abs(spectrum) / len(data)

        amp_120 = self._pick_nearest(freqs, mags, 120.0)
        amp_240 = self._pick_nearest(freqs, mags, 240.0)
        return float(amp_120), float(amp_240)

    @staticmethod
    def _pick_nearest(freqs: np.ndarray, mags: np.ndarray, target: float) -> float:
        if freqs.size == 0:
            return 0.0
        idx = int(np.argmin(np.abs(freqs - target)))
        return float(mags[idx])


class DiagnosticEngine:
    TEMP_ALERTA = 70.0
    TEMP_CRITICO = 85.0
    VIB_ALERTA = 0.70
    VIB_CRITICO = 0.95
    CORRENTE_PRIM_ALERTA = 12.0
    CORRENTE_PRIM_CRITICO = 16.0
    CORRENTE_SEC_ALERTA = 8.0
    CORRENTE_SEC_CRITICO = 11.0

    FFT_120_ALERTA = 0.35
    FFT_240_ALERTA = 0.30
    TREND_DELTA = 5.0
    TREND_WINDOW = 12

    def __init__(self) -> None:
        self._temp_history = deque(maxlen=self.TREND_WINDOW)

    def analyze(self, telemetry: Dict[str, Any], fft_120: float, fft_240: float) -> str:
        return self.analyze_details(telemetry, fft_120, fft_240)["diagnostico"]

    def analyze_details(
        self, telemetry: Dict[str, Any], fft_120: float, fft_240: float
    ) -> Dict[str, Any]:
        medidas = telemetry.get("medidas") or {}
        temp = self._safe_float(medidas.get("temperatura_c"))
        vib = self._safe_float(medidas.get("vibracao_rms_v"))
        prim = self._safe_float(medidas.get("corrente_primario_a"))
        sec = self._safe_float(medidas.get("corrente_secundario_a"))

        issues: List[Dict[str, Any]] = []
        if temp is not None:
            self._temp_history.append(temp)
            self._append_threshold_issue(
                issues,
                field="temperatura",
                label="Temperatura",
                value=temp,
                unit="C",
                warn_limit=self.TEMP_ALERTA,
                crit_limit=self.TEMP_CRITICO,
                description="Temperatura acima da faixa segura do transformador.",
                actions=[
                    "Verificar ventilacao, obstrucoes e funcionamento de coolers/exaustores.",
                    "Reduzir carga temporariamente e confirmar se a temperatura estabiliza.",
                    "Inspecionar isolamento, conexoes aquecidas e pontos de mau contato.",
                ],
            )

        if vib is not None:
            self._append_threshold_issue(
                issues,
                field="vibracao",
                label="Vibracao RMS",
                value=vib,
                unit="V",
                warn_limit=self.VIB_ALERTA,
                crit_limit=self.VIB_CRITICO,
                description="Vibracao elevada no conjunto mecanico.",
                actions=[
                    "Checar fixacao do nucleo, bobinas e base do transformador.",
                    "Procurar folgas mecanicas, desalinhamento ou ressonancia na instalacao.",
                    "Comparar a leitura com uma nova aquisicao apos reaperto mecanico.",
                ],
            )

        if prim is not None:
            self._append_threshold_issue(
                issues,
                field="primario",
                label="Corrente do primario",
                value=prim,
                unit="A",
                warn_limit=self.CORRENTE_PRIM_ALERTA,
                crit_limit=self.CORRENTE_PRIM_CRITICO,
                description="Corrente elevada no enrolamento primario.",
                actions=[
                    "Verificar inrush, saturacao do nucleo e tensao de alimentacao.",
                    "Inspecionar sinais de falha inicial de isolacao no primario.",
                    "Confirmar se a carga conectada esta dentro da especificacao do ensaio.",
                ],
            )

        if sec is not None:
            self._append_threshold_issue(
                issues,
                field="secundario",
                label="Corrente do secundario",
                value=sec,
                unit="A",
                warn_limit=self.CORRENTE_SEC_ALERTA,
                crit_limit=self.CORRENTE_SEC_CRITICO,
                description="Corrente elevada no enrolamento secundario.",
                actions=[
                    "Verificar sobrecarga, curto parcial ou carga conectada fora do previsto.",
                    "Medir a corrente com instrumento externo para confirmar a leitura.",
                    "Isolar cargas suspeitas e repetir o teste por etapas.",
                ],
            )

        if fft_120 >= self.FFT_120_ALERTA:
            issues.append(
                self._build_issue(
                    field="fft_120hz",
                    label="FFT 120 Hz",
                    severity="warn",
                    value=fft_120,
                    unit="amp",
                    limit=self.FFT_120_ALERTA,
                    description="Assinatura de vibracao em 120 Hz fora do padrao.",
                    actions=[
                        "Verificar aperto mecanico do nucleo magnetico.",
                        "Conferir fixacao das laminas e pontos de acoplamento mecanico.",
                        "Repetir a coleta apos reaperto para comparar a amplitude.",
                    ],
                )
            )

        if fft_240 >= self.FFT_240_ALERTA:
            issues.append(
                self._build_issue(
                    field="fft_240hz",
                    label="FFT 240 Hz",
                    severity="warn",
                    value=fft_240,
                    unit="amp",
                    limit=self.FFT_240_ALERTA,
                    description="Componente harmonica em 240 Hz acima do esperado.",
                    actions=[
                        "Investigar ressonancia mecanica ou deformacao no conjunto magnetico.",
                        "Comparar com a assinatura historica do equipamento em carga similar.",
                        "Inspecionar fixacoes e isoladores antes de manter operacao continua.",
                    ],
                )
            )

        if self._is_temp_rising():
            issues.append(
                self._build_issue(
                    field="tendencia_temperatura",
                    label="Tendencia de temperatura",
                    severity="warn",
                    value=self._temp_history[-1],
                    unit="C",
                    limit=self.TREND_DELTA,
                    description="Temperatura em subida consistente na janela recente.",
                    actions=[
                        "Acompanhar a evolucao antes de aumentar carga.",
                        "Conferir ventilacao e pontos de aquecimento local.",
                        "Planejar parada se a tendencia continuar mesmo com carga reduzida.",
                    ],
                )
            )

        alerts = sum(1 for issue in issues if issue["severity"] == "warn")
        critical = sum(1 for issue in issues if issue["severity"] == "crit")

        if critical >= 1 and (alerts + critical) >= 2:
            diagnostico = (
                "Critico: multiplos indicadores anormais. Recomenda-se inspecao imediata "
                "do transformador."
            )
        elif (alerts + critical) >= 2:
            diagnostico = (
                "Critico: multiplos indicadores anormais. Recomenda-se inspecao imediata "
                "do transformador."
            )
        elif temp is not None and temp >= self.TEMP_ALERTA:
            diagnostico = (
                "Alerta termico: temperatura elevada. Verificar ventilacao, carga e "
                "isolamento."
            )
        elif fft_120 >= self.FFT_120_ALERTA:
            diagnostico = (
                "Manutencao: assinatura de vibracao em 120 Hz fora do padrao. "
                "Verificar aperto mecanico do nucleo magnetico."
            )
        elif prim is not None and prim >= self.CORRENTE_PRIM_ALERTA:
            diagnostico = (
                "Alerta eletrico: corrente elevada no primario. Possivel inrush intenso, "
                "saturacao do nucleo ou falha inicial de isolacao."
            )
        elif sec is not None and sec >= self.CORRENTE_SEC_ALERTA:
            diagnostico = (
                "Alerta de sobrecarga: corrente elevada no secundario. Verificar carga conectada."
            )
        else:
            diagnostico = "Operacao normal dentro dos limites simulados."

        return {
            "diagnostico": diagnostico,
            "severity": "crit" if critical else "warn" if alerts else "ok",
            "issues": issues,
        }

    def _is_temp_rising(self) -> bool:
        if len(self._temp_history) < 5:
            return False
        return (self._temp_history[-1] - self._temp_history[0]) >= self.TREND_DELTA

    @staticmethod
    def _safe_float(value: Any) -> float | None:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _append_threshold_issue(
        self,
        issues: List[Dict[str, Any]],
        field: str,
        label: str,
        value: float,
        unit: str,
        warn_limit: float,
        crit_limit: float,
        description: str,
        actions: List[str],
    ) -> None:
        if value >= crit_limit:
            issues.append(
                self._build_issue(
                    field,
                    label,
                    "crit",
                    value,
                    unit,
                    crit_limit,
                    description,
                    actions,
                )
            )
        elif value >= warn_limit:
            issues.append(
                self._build_issue(
                    field,
                    label,
                    "warn",
                    value,
                    unit,
                    warn_limit,
                    description,
                    actions,
                )
            )

    @staticmethod
    def _build_issue(
        field: str,
        label: str,
        severity: str,
        value: float,
        unit: str,
        limit: float,
        description: str,
        actions: List[str],
    ) -> Dict[str, Any]:
        return {
            "field": field,
            "label": label,
            "severity": severity,
            "value": round(float(value), 4),
            "unit": unit,
            "limit": round(float(limit), 4),
            "description": description,
            "recommended_actions": actions,
        }
