from __future__ import annotations

import csv
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional


FIELDS = [
    "timestamp_pc",
    "seq",
    "ms_arduino",
    "temperatura_c",
    "vibracao_rms_v",
    "corrente_primario_a",
    "corrente_secundario_a",
    "adc_ntc",
    "adc_vibracao",
    "adc_sct_primario",
    "adc_sct_secundario",
    "alarme_geral",
    "alarme_temperatura",
    "alarme_vibracao",
    "alarme_primario",
    "alarme_secundario",
    "diagnostico_arduino",
    "diagnostico_python",
    "fft_120hz",
    "fft_240hz",
]


class DataLogger:
    def __init__(self, base_dir: Path) -> None:
        self._base_dir = Path(base_dir)
        self._base_dir.mkdir(parents=True, exist_ok=True)
        self._file_path: Optional[Path] = None
        self._file = None
        self._writer: Optional[csv.DictWriter] = None
        self._lock = threading.Lock()
        self.start_new_session()

    @property
    def current_path(self) -> Optional[str]:
        return str(self._file_path) if self._file_path else None

    def start_new_session(self) -> None:
        with self._lock:
            if self._file:
                try:
                    self._file.close()
                except Exception:
                    pass

            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            filename = f"transformador_{timestamp}.csv"
            self._file_path = self._base_dir / filename
            self._file = open(self._file_path, "w", newline="", encoding="utf-8")
            self._writer = csv.DictWriter(self._file, fieldnames=FIELDS)
            self._writer.writeheader()
            self._file.flush()

    def log(self, row: Dict[str, Any]) -> None:
        with self._lock:
            if not self._writer:
                return
            payload = {field: row.get(field, "") for field in FIELDS}
            self._writer.writerow(payload)
            if self._file:
                self._file.flush()

    def close(self) -> None:
        with self._lock:
            if self._file:
                try:
                    self._file.close()
                except Exception:
                    pass
            self._file = None
            self._writer = None
