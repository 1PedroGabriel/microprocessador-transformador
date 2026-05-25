from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List

import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def generate_report(csv_path: str, output_dir: str) -> str:
    data_path = Path(csv_path)
    if not data_path.exists():
        raise FileNotFoundError("CSV not found")

    output_dir_path = Path(output_dir)
    output_dir_path.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    pdf_path = output_dir_path / f"relatorio_transformador_{timestamp}.pdf"

    df = pd.read_csv(data_path)

    c = canvas.Canvas(str(pdf_path), pagesize=A4)
    width, height = A4
    y = height - 60

    def draw_line(text: str, size: int = 11, bold: bool = False) -> None:
        nonlocal y
        font = "Helvetica-Bold" if bold else "Helvetica"
        c.setFont(font, size)
        c.drawString(50, y, text)
        y -= size + 6

    draw_line("Relatorio de Diagnostico de Saude de Transformador", 14, True)

    if df.empty:
        draw_line("Sem dados registrados para esta sessao.")
        c.save()
        return str(pdf_path)

    start_time = str(df["timestamp_pc"].iloc[0]) if "timestamp_pc" in df else "N/A"
    end_time = str(df["timestamp_pc"].iloc[-1]) if "timestamp_pc" in df else "N/A"

    draw_line(f"Inicio: {start_time}")
    draw_line(f"Fim: {end_time}")
    draw_line(f"Quantidade de amostras: {len(df)}")

    metrics = [
        ("temperatura_c", "Temperatura (C)"),
        ("vibracao_rms_v", "Vibracao RMS (V)"),
        ("corrente_primario_a", "Corrente Primario (A)"),
        ("corrente_secundario_a", "Corrente Secundario (A)"),
        ("fft_120hz", "FFT 120 Hz"),
        ("fft_240hz", "FFT 240 Hz"),
    ]

    draw_line("Resumo de medidas:", 12, True)
    for column, label in metrics:
        if column not in df:
            continue
        series = pd.to_numeric(df[column], errors="coerce").dropna()
        if series.empty:
            continue
        draw_line(
            f"{label}: media {series.mean():.3f}, min {series.min():.3f}, max {series.max():.3f}"
        )

    alarm_counts: List[str] = []
    for column, label in [
        ("alarme_temperatura", "Temperatura"),
        ("alarme_vibracao", "Vibracao"),
        ("alarme_primario", "Primario"),
        ("alarme_secundario", "Secundario"),
    ]:
        if column in df:
            flags = df[column].astype(str).str.lower().isin(["true", "1", "sim"])
            count = int(flags.sum())
            alarm_counts.append(f"{label}: {count}")

    if alarm_counts:
        draw_line("Alarmes detectados:", 12, True)
        for item in alarm_counts:
            draw_line(item)

    if "diagnostico_python" in df:
        draw_line("Principais diagnosticos:", 12, True)
        counts = df["diagnostico_python"].value_counts().head(3)
        for text, count in counts.items():
            draw_line(f"{text} ({int(count)})")

    draw_line("Observacoes tecnicas:", 12, True)
    draw_line("Revisar tendencias de aquecimento e harmonicos de 120/240 Hz.")
    draw_line("Agendar inspecao preventiva se houver alarmes recorrentes.")

    c.save()
    return str(pdf_path)
