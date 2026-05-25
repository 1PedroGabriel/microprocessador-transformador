import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendPoint } from "../types/telemetry";

type TrendChartProps = {
  title: string;
  data: TrendPoint[];
  dataKey: keyof TrendPoint;
  color: string;
  unit?: string;
};

function TrendChart({ title, data, dataKey, color, unit }: TrendChartProps) {
  return (
    <div className="card chart-card">
      <div className="status-label">{title}</div>
      {data.length === 0 ? (
        <div className="placeholder">Sem dados</div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
            <XAxis dataKey="t" tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <Tooltip
              formatter={(value: number) =>
                `${Number(value).toFixed(3)}${unit ? ` ${unit}` : ""}`
              }
              contentStyle={{
                background: "#0f1a24",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
            <Line
              type="monotone"
              dataKey={dataKey as string}
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

export default TrendChart;
