import { StatusResponse } from "../types/telemetry";

export const API_BASE = "http://localhost:8000/api";

type ApiResponse<T> = T;

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getStatus(): Promise<StatusResponse> {
  return request<StatusResponse>("/status");
}

export async function getPorts(): Promise<string[]> {
  const data = await request<{ ports: string[] }>("/ports");
  return data.ports || [];
}

export async function connectSerial(port: string, baud: number): Promise<boolean> {
  const data = await request<{ ok: boolean }>("/serial/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ port, baud }),
  });
  return data.ok;
}

export async function disconnectSerial(): Promise<boolean> {
  const data = await request<{ ok: boolean }>("/serial/disconnect", {
    method: "POST",
  });
  return data.ok;
}

export async function startSerial(): Promise<boolean> {
  const data = await request<{ ok: boolean }>("/serial/start", {
    method: "POST",
  });
  return data.ok;
}

export async function stopSerial(): Promise<boolean> {
  const data = await request<{ ok: boolean }>("/serial/stop", {
    method: "POST",
  });
  return data.ok;
}

export async function resetSerial(): Promise<boolean> {
  const data = await request<{ ok: boolean }>("/serial/reset", {
    method: "POST",
  });
  return data.ok;
}
