type AlarmLedProps = {
  label: string;
  status?: "ok" | "warn" | "crit" | "idle";
};

function AlarmLed({ label, status = "idle" }: AlarmLedProps) {
  return (
    <div className="led-item">
      <div className={`led led-${status}`} />
      <span>{label}</span>
    </div>
  );
}

export default AlarmLed;
