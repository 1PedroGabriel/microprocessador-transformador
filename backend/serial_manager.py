from __future__ import annotations

import json
import threading
from typing import Any, Callable, Dict, Optional

import serial


class SerialManager:
    def __init__(
        self,
        on_packet: Callable[[Dict[str, Any]], None],
        default_port: str,
        default_baud: int,
    ) -> None:
        self._on_packet = on_packet
        self._port = default_port
        self._baud = default_baud
        self._serial: Optional[serial.Serial] = None
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._last_packet: Optional[Dict[str, Any]] = None
        self._connected = False
        self._last_error: Optional[str] = None
        self._aquisicao = False

    @property
    def port(self) -> str:
        return self._port

    @property
    def baud(self) -> int:
        return self._baud

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    @property
    def last_packet(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            return dict(self._last_packet) if self._last_packet else None

    @property
    def aquisicao(self) -> bool:
        return self._aquisicao

    def connect(self, port: str, baud: int) -> bool:
        self.disconnect()
        self._port = port
        self._baud = baud
        self._last_error = None

        try:
            self._serial = serial.Serial(
                port=port,
                baudrate=baud,
                timeout=1,
            )
        except serial.SerialException as exc:
            self._last_error = str(exc)
            self._connected = False
            return False

        self._connected = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()
        return True

    def disconnect(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        if self._serial and self._serial.is_open:
            try:
                self._serial.close()
            except Exception:
                pass
        self._serial = None
        self._thread = None
        self._connected = False

    def send_command(self, command: str) -> bool:
        if not self._connected or not self._serial:
            return False
        try:
            data = (command.strip() + "\n").encode("utf-8")
            self._serial.write(data)
            return True
        except Exception as exc:
            self._last_error = str(exc)
            return False

    def _read_loop(self) -> None:
        while not self._stop_event.is_set():
            if not self._serial:
                break
            try:
                raw = self._serial.readline()
            except Exception as exc:
                self._last_error = str(exc)
                break

            if not raw:
                continue

            try:
                line = raw.decode("utf-8", errors="ignore").strip()
            except Exception:
                continue

            if not line:
                continue

            print(f"[serial] {line}", flush=True)

            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue

            if not isinstance(payload, dict):
                continue

            with self._lock:
                self._last_packet = payload
                if "aquisicao" in payload:
                    self._aquisicao = bool(payload.get("aquisicao"))

            try:
                self._on_packet(payload)
            except Exception:
                continue

        self._connected = False
