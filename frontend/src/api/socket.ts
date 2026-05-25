import { TelemetryPacket } from "../types/telemetry";

export type SocketState = "connected" | "disconnected" | "connecting";

type PacketHandler = (packet: TelemetryPacket) => void;
type StateHandler = (state: SocketState) => void;

export function createTelemetrySocket(onPacket: PacketHandler, onState?: StateHandler) {
  let socket: WebSocket | null = null;
  let retryCount = 0;
  let closedByUser = false;

  const connect = () => {
    closedByUser = false;
    onState?.("connecting");
    socket = new WebSocket("ws://localhost:8000/ws/telemetry");

    socket.onopen = () => {
      retryCount = 0;
      onState?.("connected");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as TelemetryPacket;
        onPacket(data);
      } catch {
        // Ignore malformed payloads
      }
    };

    socket.onclose = () => {
      onState?.("disconnected");
      if (!closedByUser) {
        retryCount += 1;
        const delay = Math.min(5000, 500 + retryCount * 500);
        setTimeout(connect, delay);
      }
    };

    socket.onerror = () => {
      socket?.close();
    };
  };

  connect();

  return {
    close: () => {
      closedByUser = true;
      socket?.close();
    },
  };
}
