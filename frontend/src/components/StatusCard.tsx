type StatusCardProps = {
  label: string;
  value: string | number;
  unit?: string;
  accent?: "ok" | "warn" | "crit" | "idle";
};

function StatusCard({ label, value, unit, accent = "idle" }: StatusCardProps) {
  return (
    <div className={`card status-card accent-${accent}`}>
      <div className="status-label">{label}</div>
      <div className="status-value">
        <span>{value}</span>
        {unit && <span className="status-unit">{unit}</span>}
      </div>
    </div>
  );
}

export default StatusCard;
