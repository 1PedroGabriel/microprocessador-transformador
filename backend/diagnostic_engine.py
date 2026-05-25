from __future__ import annotations

from collections import deque
from typing import Any, Dict, Iterable, Tuple

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
        medidas = telemetry.get("medidas") or {}
        temp = self._safe_float(medidas.get("temperatura_c"))
        vib = self._safe_float(medidas.get("vibracao_rms_v"))
        prim = self._safe_float(medidas.get("corrente_primario_a"))
        sec = self._safe_float(medidas.get("corrente_secundario_a"))

        alerts = 0
        critical = 0

        if temp is not None:
            if temp >= self.TEMP_CRITICO:
                critical += 1
            elif temp >= self.TEMP_ALERTA:
                alerts += 1
            self._temp_history.append(temp)

        if vib is not None:
            if vib >= self.VIB_CRITICO:
                critical += 1
            elif vib >= self.VIB_ALERTA:
                alerts += 1

        if prim is not None:
            if prim >= self.CORRENTE_PRIM_CRITICO:
                critical += 1
            elif prim >= self.CORRENTE_PRIM_ALERTA:
                alerts += 1

        if sec is not None:
            if sec >= self.CORRENTE_SEC_CRITICO:
                critical += 1
            elif sec >= self.CORRENTE_SEC_ALERTA:
                alerts += 1

        if fft_120 >= self.FFT_120_ALERTA:
            alerts += 1

        if fft_240 >= self.FFT_240_ALERTA:
            alerts += 1

        if self._is_temp_rising():
            alerts += 1

        if critical >= 1 and (alerts + critical) >= 2:
            return (
                "Critico: multiplos indicadores anormais. Recomenda-se inspecao imediata "
                "do transformador."
            )

        if (alerts + critical) >= 2:
            return (
                "Critico: multiplos indicadores anormais. Recomenda-se inspecao imediata "
                "do transformador."
            )

        if temp is not None and temp >= self.TEMP_ALERTA:
            return (
                "Alerta termico: temperatura elevada. Verificar ventilacao, carga e "
                "isolamento."
            )

        if fft_120 >= self.FFT_120_ALERTA:
            return (
                "Manutencao: assinatura de vibracao em 120 Hz fora do padrao. "
                "Verificar aperto mecanico do nucleo magnetico."
            )

        if prim is not None and prim >= self.CORRENTE_PRIM_ALERTA:
            return (
                "Alerta eletrico: corrente elevada no primario. Possivel inrush intenso, "
                "saturacao do nucleo ou falha inicial de isolacao."
            )

        if sec is not None and sec >= self.CORRENTE_SEC_ALERTA:
            return "Alerta de sobrecarga: corrente elevada no secundario. Verificar carga conectada."

        return "Operacao normal dentro dos limites simulados."

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
