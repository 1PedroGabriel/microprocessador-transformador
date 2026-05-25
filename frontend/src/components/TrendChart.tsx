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
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="2 6" stroke="var(--grid-soft)" />
            <XAxis
              dataKey="t"
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
              type="linear"
              dataKey={dataKey as string}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 2, strokeWidth: 0 }}
              activeDot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default TrendChart;
