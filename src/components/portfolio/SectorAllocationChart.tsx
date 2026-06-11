import { Chart, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import type { SectorSlice } from "@/lib/portfolio";

Chart.register(ArcElement, Tooltip, Legend);

const PALETTE = [
  "#6366F1",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#84CC16",
];
const OTHER_COLOR = "#6B7280";

interface Props {
  slices: SectorSlice[];
}

export default function SectorAllocationChart({ slices }: Props) {
  if (slices.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 py-16 text-center">
        <p className="text-gray-500">No positions to display</p>
      </div>
    );
  }

  const backgroundColors = slices.map((s, i) =>
    s.sector === "Other" ? OTHER_COLOR : (PALETTE[i % PALETTE.length] ?? OTHER_COLOR),
  );

  const data = {
    labels: slices.map((s) => s.sector),
    datasets: [
      {
        data: slices.map((s) => s.value),
        backgroundColor: backgroundColors,
        borderWidth: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right" as const,
        labels: {
          color: "rgb(55, 65, 81)",
          padding: 12,
          font: { size: 12 },
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { label?: string; dataIndex: number }) => {
            const slice = slices[ctx.dataIndex] as SectorSlice | undefined;
            if (!slice) return "";
            return ` ${slice.sector}: ${slice.percentage.toFixed(1)}% (${slice.value.toFixed(2)})`; // value is unitless — mixed-currency portfolios sum across currencies by design
          },
        },
      },
    },
  };

  return (
    <div className="relative h-[300px]">
      <Doughnut data={data} options={options} />
    </div>
  );
}
