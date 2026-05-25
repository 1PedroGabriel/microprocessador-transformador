type DiagnosticPanelProps = {
  diagnosticoArduino?: string;
  diagnosticoPython?: string;
};

function DiagnosticPanel({ diagnosticoArduino, diagnosticoPython }: DiagnosticPanelProps) {
  return (
    <div className="card diagnostic-box">
      <div className="section-title">Diagnostico Tecnico</div>
      <div>
        <strong>Arduino:</strong> {diagnosticoArduino || "Sem dados"}
      </div>
      <div style={{ marginTop: "10px" }}>
        <strong>Python:</strong> {diagnosticoPython || "Sem dados"}
      </div>
    </div>
  );
}

export default DiagnosticPanel;
