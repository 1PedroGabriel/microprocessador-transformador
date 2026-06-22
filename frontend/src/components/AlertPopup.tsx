import { DiagnosticAlert } from "../types/telemetry";

type AlertPopupProps = {
  alerts: DiagnosticAlert[];
  open: boolean;
  onClose: () => void;
};

function AlertPopup({ alerts, open, onClose }: AlertPopupProps) {
  if (!open || alerts.length === 0) {
    return null;
  }

  const criticalCount = alerts.filter((alert) => alert.severity === "crit").length;
  const title = criticalCount ? "Falha critica detectada" : "Aviso de manutencao";

  return (
    <div className="alert-overlay" role="presentation">
      <div className="alert-modal" role="alertdialog" aria-modal="true" aria-labelledby="alert-title">
        <div className="alert-modal-header">
          <div>
            <div className="alert-kicker">{criticalCount ? "Intervencao imediata" : "Atencao tecnica"}</div>
            <h2 id="alert-title">{title}</h2>
          </div>
          <button className="alert-close" type="button" onClick={onClose} aria-label="Fechar alerta">
            x
          </button>
        </div>

        <div className="alert-list">
          {alerts.map((alert) => (
            <div className={`alert-item alert-item-${alert.severity}`} key={alert.field}>
              <div className="alert-item-top">
                <strong>{alert.label}</strong>
                <span>{alert.severity === "crit" ? "Critico" : "Aviso"}</span>
              </div>
              <p>{alert.description}</p>
              <div className="alert-reading">
                Leitura: {formatReading(alert.value)} {alert.unit || ""}
                {alert.limit !== undefined && <> / limite: {formatReading(alert.limit)} {alert.unit || ""}</>}
              </div>
              <div className="alert-actions-title">Correcoes sugeridas</div>
              <ul>
                {alert.recommended_actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatReading(value?: number) {
  if (value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

export default AlertPopup;
