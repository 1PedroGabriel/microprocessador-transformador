import { DiagnosticAlert } from "../types/telemetry";

type DiagnosticPanelProps = {
  diagnosticoArduino?: string;
  diagnosticoPython?: string;
  alerts?: DiagnosticAlert[];
};

function DiagnosticPanel({ diagnosticoArduino, diagnosticoPython, alerts = [] }: DiagnosticPanelProps) {
  return (
    <div className="card diagnostic-box">
      <div className="section-title">Diagnostico Tecnico</div>
      <div>
        <strong>Arduino:</strong> {diagnosticoArduino || "Sem dados"}
      </div>
      <div style={{ marginTop: "10px" }}>
        <strong>Python:</strong> {diagnosticoPython || "Sem dados"}
      </div>
      {alerts.length > 0 && (
        <div className="diagnostic-alerts">
          {alerts.map((alert) => (
            <div className={`diagnostic-alert diagnostic-alert-${alert.severity}`} key={alert.field}>
              <div className="diagnostic-alert-title">
                <strong>{alert.label}</strong>
                <span>{alert.severity === "crit" ? "Critico" : "Aviso"}</span>
              </div>
              <div>{alert.description}</div>
              <ul>
                {alert.recommended_actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DiagnosticPanel;
