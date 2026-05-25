import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SampleChartProps = {
  title: string;
  samples: number[];
  color: string;
};

function SampleChart({ title, samples, color }: SampleChartProps) {
  const data = samples.map((value, index) => ({ i: index, v: value }));

  return (
    <div className="card chart-card">
      <div className="status-label">{title}</div>
      {data.length === 0 ? (
        <div className="placeholder">Sem amostras</div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="2 6" stroke="var(--grid-soft)" />
            <XAxis
              dataKey="i"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip
              formatter={(value: number) => `${Number(value).toFixed(1)} adc`}
              contentStyle={{
                background: "#0f1a24",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
            <Line
              type="linear"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default SampleChart;
