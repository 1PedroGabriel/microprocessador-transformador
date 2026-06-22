from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
import numpy as np
import serial.tools.list_ports

from datalogger import DataLogger
from diagnostic_engine import DiagnosticEngine, FftAnalyzer
from report_generator import generate_report
from serial_manager import SerialManager

PORTA_PADRAO = "COM2"
BAUD_PADRAO = 57600
SAMPLE_RATE_HZ = 1000.0
FFT_BUFFER_SIZE = 256
ADC_MAX = 1023.0
TEMP_MAX_C = 100.0
CURRENT_MAX_A = 20.0


class SerialConnectRequest(BaseModel):
    port: str = PORTA_PADRAO
    baud: int = BAUD_PADRAO


class WebSocketManager:
    def __init__(self) -> None:
        self._clients: List[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.append(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self._clients:
                self._clients.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        async with self._lock:
            clients = list(self._clients)
        for websocket in clients:
            try:
                await websocket.send_json(message)
            except Exception:
                await self.disconnect(websocket)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.loop = asyncio.get_running_loop()
    datalogger.start_new_session()
    serial_manager.connect(PORTA_PADRAO, BAUD_PADRAO)
    try:
        yield
    finally:
        serial_manager.disconnect()
        datalogger.close()


app = FastAPI(title="Transformador Diagnostico", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ws_manager = WebSocketManager()
fft_analyzer = FftAnalyzer(sample_rate_hz=SAMPLE_RATE_HZ, buffer_size=FFT_BUFFER_SIZE)
diagnostic_engine = DiagnosticEngine()
logs_dir = Path(__file__).resolve().parent / "logs"
reports_dir = Path(__file__).resolve().parent / "reports"
datalogger = DataLogger(logs_dir)


def _to_float_list(values: Any) -> List[float]:
    if not isinstance(values, list):
        return []
    parsed: List[float] = []
    for value in values:
        try:
            parsed.append(float(value))
        except (TypeError, ValueError):
            continue
    return parsed


def _calc_stats(values: List[float]) -> tuple[Optional[float], Optional[float]]:
    if not values:
        return None, None
    data = np.array(values, dtype=float)
    mean = float(data.mean())
    rms = float(np.sqrt(np.mean(data**2)))
    return mean, rms


def _scale(value: Optional[float], max_input: float, max_output: float) -> Optional[float]:
    if value is None:
        return None
    return (value / max_input) * max_output


def handle_packet(packet: Dict[str, Any]) -> None:
    packet_type = packet.get("type")
    if packet_type not in {"telemetry", "samples"}:
        return

    timestamp_pc = datetime.now().isoformat(timespec="milliseconds")

    if packet_type == "samples":
        ntc_samples = _to_float_list(packet.get("ntc"))
        vib_samples = _to_float_list(packet.get("vibracao"))
        prim_samples = _to_float_list(packet.get("sct_primario"))
        sec_samples = _to_float_list(packet.get("sct_secundario"))

        fs = packet.get("fs") or SAMPLE_RATE_HZ
        try:
            fs = float(fs)
        except (TypeError, ValueError):
            fs = SAMPLE_RATE_HZ

        ntc_avg, _ = _calc_stats(ntc_samples)
        _, vib_rms = _calc_stats(vib_samples)
        _, prim_rms = _calc_stats(prim_samples)
        _, sec_rms = _calc_stats(sec_samples)

        temperatura_c = _scale(ntc_avg, ADC_MAX, TEMP_MAX_C)
        vibracao_rms_v = _scale(vib_rms, ADC_MAX, 1.0)
        corrente_primario_a = _scale(prim_rms, ADC_MAX, CURRENT_MAX_A)
        corrente_secundario_a = _scale(sec_rms, ADC_MAX, CURRENT_MAX_A)

        fft_120, fft_240 = fft_analyzer.analyze_samples(vib_samples, sample_rate=fs)

        medidas = {
            "temperatura_c": temperatura_c,
            "vibracao_rms_v": vibracao_rms_v,
            "corrente_primario_a": corrente_primario_a,
            "corrente_secundario_a": corrente_secundario_a,
        }

        diagnostic_details = diagnostic_engine.analyze_details(
            {"medidas": medidas}, fft_120, fft_240
        )
        diagnostico_python = diagnostic_details["diagnostico"]

        payload = {
            "timestamp_pc": timestamp_pc,
            "type": "telemetry",
            "data_mode": "samples",
            "seq": packet.get("seq"),
            "ms": packet.get("ms"),
            "fs": fs,
            "samples": {
                "ntc": ntc_samples,
                "vibracao": vib_samples,
                "sct_primario": prim_samples,
                "sct_secundario": sec_samples,
            },
            "sample_stats": {
                "ntc_avg": ntc_avg,
                "vibracao_rms": vib_rms,
                "sct_primario_rms": prim_rms,
                "sct_secundario_rms": sec_rms,
            },
            "adc": {
                "ntc": ntc_avg,
                "vibracao": vib_rms,
                "sct_primario": prim_rms,
                "sct_secundario": sec_rms,
            },
            "medidas": medidas,
            "alarmes": {},
            "diagnostico_arduino": None,
            "diagnostico_python": diagnostico_python,
            "diagnostic_alerts": diagnostic_details["issues"],
            "diagnostic_severity": diagnostic_details["severity"],
            "fft": {
                "amp_120hz": fft_120,
                "amp_240hz": fft_240,
            },
        }

        datalogger.log(
            {
                "timestamp_pc": timestamp_pc,
                "seq": packet.get("seq"),
                "ms_arduino": packet.get("ms"),
                "temperatura_c": temperatura_c,
                "vibracao_rms_v": vibracao_rms_v,
                "corrente_primario_a": corrente_primario_a,
                "corrente_secundario_a": corrente_secundario_a,
                "adc_ntc": ntc_avg,
                "adc_vibracao": vib_rms,
                "adc_sct_primario": prim_rms,
                "adc_sct_secundario": sec_rms,
                "alarme_geral": None,
                "alarme_temperatura": None,
                "alarme_vibracao": None,
                "alarme_primario": None,
                "alarme_secundario": None,
                "diagnostico_arduino": None,
                "diagnostico_python": diagnostico_python,
                "fft_120hz": fft_120,
                "fft_240hz": fft_240,
            }
        )
    else:
        adc = packet.get("adc") or {}
        medidas = packet.get("medidas") or {}
        alarmes = packet.get("alarmes") or {}

        fft_120, fft_240 = fft_analyzer.add_sample(adc.get("vibracao"))
        diagnostic_details = diagnostic_engine.analyze_details(packet, fft_120, fft_240)
        diagnostico_python = diagnostic_details["diagnostico"]
        diagnostico_arduino = packet.get("diagnostico")

        payload = {
            "timestamp_pc": timestamp_pc,
            "type": "telemetry",
            "data_mode": "telemetry",
            "seq": packet.get("seq"),
            "ms": packet.get("ms"),
            "adc": adc,
            "medidas": medidas,
            "alarmes": alarmes,
            "diagnostico_arduino": diagnostico_arduino,
            "diagnostico_python": diagnostico_python,
            "diagnostic_alerts": diagnostic_details["issues"],
            "diagnostic_severity": diagnostic_details["severity"],
            "fft": {
                "amp_120hz": fft_120,
                "amp_240hz": fft_240,
            },
        }

        datalogger.log(
            {
                "timestamp_pc": timestamp_pc,
                "seq": packet.get("seq"),
                "ms_arduino": packet.get("ms"),
                "temperatura_c": medidas.get("temperatura_c"),
                "vibracao_rms_v": medidas.get("vibracao_rms_v"),
                "corrente_primario_a": medidas.get("corrente_primario_a"),
                "corrente_secundario_a": medidas.get("corrente_secundario_a"),
                "adc_ntc": adc.get("ntc"),
                "adc_vibracao": adc.get("vibracao"),
                "adc_sct_primario": adc.get("sct_primario"),
                "adc_sct_secundario": adc.get("sct_secundario"),
                "alarme_geral": alarmes.get("geral"),
                "alarme_temperatura": alarmes.get("temperatura"),
                "alarme_vibracao": alarmes.get("vibracao"),
                "alarme_primario": alarmes.get("primario"),
                "alarme_secundario": alarmes.get("secundario"),
                "diagnostico_arduino": diagnostico_arduino,
                "diagnostico_python": diagnostico_python,
                "fft_120hz": fft_120,
                "fft_240hz": fft_240,
            }
        )

    app.state.last_telemetry = payload
    loop = getattr(app.state, "loop", None)
    if loop:
        asyncio.run_coroutine_threadsafe(ws_manager.broadcast(payload), loop)


serial_manager = SerialManager(
    on_packet=handle_packet,
    default_port=PORTA_PADRAO,
    default_baud=BAUD_PADRAO,
)


@app.get("/api/status")
def get_status() -> Dict[str, Any]:
    return {
        "connected": serial_manager.is_connected,
        "port": serial_manager.port,
        "baud": serial_manager.baud,
        "aquisicao": serial_manager.aquisicao,
        "last_packet": serial_manager.last_packet,
        "last_error": serial_manager.last_error,
    }


@app.get("/api/telemetry/latest", response_model=None)
def get_latest_telemetry() -> Dict[str, Any] | Response:
    payload = getattr(app.state, "last_telemetry", None)
    if not payload:
        return Response(status_code=204)
    return payload


@app.post("/api/serial/connect")
def connect_serial(payload: SerialConnectRequest) -> Dict[str, Any]:
    ok = serial_manager.connect(payload.port, payload.baud)
    if ok:
        datalogger.start_new_session()
    return {"ok": ok}


@app.post("/api/serial/disconnect")
def disconnect_serial() -> Dict[str, Any]:
    serial_manager.disconnect()
    return {"ok": True}


@app.post("/api/serial/start")
def start_serial() -> Dict[str, Any]:
    return {"ok": serial_manager.send_command("START")}


@app.post("/api/serial/stop")
def stop_serial() -> Dict[str, Any]:
    return {"ok": serial_manager.send_command("STOP")}


@app.post("/api/serial/reset")
def reset_serial() -> Dict[str, Any]:
    return {"ok": serial_manager.send_command("RESET")}


@app.get("/api/ports")
def list_ports() -> Dict[str, List[str]]:
    ports = [port.device for port in serial.tools.list_ports.comports()]
    if PORTA_PADRAO not in ports:
        ports.insert(0, PORTA_PADRAO)
    return {"ports": ports}


@app.get("/api/logs/export")
def export_logs() -> FileResponse:
    current_path = datalogger.current_path
    if not current_path:
        raise HTTPException(status_code=404, detail="Log not found")
    return FileResponse(current_path, filename=Path(current_path).name)


@app.get("/api/report/pdf")
def export_report() -> FileResponse:
    current_path = datalogger.current_path
    if not current_path:
        raise HTTPException(status_code=404, detail="Log not found")
    pdf_path = generate_report(current_path, str(reports_dir))
    return FileResponse(pdf_path, filename=Path(pdf_path).name)


@app.websocket("/ws/telemetry")
async def ws_telemetry(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
