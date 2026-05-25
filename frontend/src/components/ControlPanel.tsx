type ControlPanelProps = {
  ports: string[];
  selectedPort: string;
  selectedBaud: number;
  onPortChange: (value: string) => void;
  onBaudChange: (value: number) => void;
  onRefreshPorts: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onExportCsv: () => void;
  onReportPdf: () => void;
  connected: boolean;
};

const baudRates = [9600, 57600, 115200];

function ControlPanel({
  ports,
  selectedPort,
  selectedBaud,
  onPortChange,
  onBaudChange,
  onRefreshPorts,
  onConnect,
  onDisconnect,
  onStart,
  onStop,
  onReset,
  onExportCsv,
  onReportPdf,
  connected,
}: ControlPanelProps) {
  const portOptions = ports.length ? ports : ["COM2"];

  return (
    <div>
      <div className="control-grid">
        <div>
          <label>Porta COM</label>
          <select value={selectedPort} onChange={(e) => onPortChange(e.target.value)}>
            {portOptions.map((port) => (
              <option key={port} value={port}>
                {port}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Baud Rate</label>
          <select value={selectedBaud} onChange={(e) => onBaudChange(Number(e.target.value))}>
            {baudRates.map((baud) => (
              <option key={baud} value={baud}>
                {baud}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Portas</label>
          <button onClick={onRefreshPorts}>Atualizar Portas</button>
        </div>
      </div>
      <div className="control-actions">
        <button className="btn-primary" onClick={onConnect}>
          Conectar
        </button>
        <button onClick={onDisconnect}>Desconectar</button>
        <button className="btn-primary" onClick={onStart} disabled={!connected}>
          Iniciar Aquisicao
        </button>
        <button className="btn-warn" onClick={onStop} disabled={!connected}>
          Parar Aquisicao
        </button>
        <button className="btn-danger" onClick={onReset} disabled={!connected}>
          Reset / Ack Alarmes
        </button>
        <button onClick={onExportCsv}>Exportar CSV</button>
        <button onClick={onReportPdf}>Gerar Relatorio PDF</button>
      </div>
    </div>
  );
}

export default ControlPanel;
