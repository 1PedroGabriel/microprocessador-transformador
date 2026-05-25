import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type FFTChartProps = {
  amp120: number;
  amp240: number;
};

function FFTChart({ amp120, amp240 }: FFTChartProps) {
  const data = [
    { name: "120 Hz", amp: amp120 },
    { name: "240 Hz", amp: amp240 },
  ];

  return (
    <div className="card chart-card">
      <div className="status-label">FFT (120/240 Hz)</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
          <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip
            formatter={(value: number) => `${Number(value).toFixed(3)} amp`}
            contentStyle={{
              background: "#0f1a24",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
          <Bar dataKey="amp" fill="#2ed0ff" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="placeholder">
        120 Hz e harmonicos indicam magnetostricao e folgas no nucleo.
      </div>
    </div>
  );
}

export default FFTChart;
