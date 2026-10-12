type Point = { label: string; value: number };

type BarChartProps = {
  title: string;
  /** Headline shown next to the title, e.g. the total of the period. */
  summary: string;
  points: Point[];
  format?: (value: number) => string;
};

/**
 * Single-series daily bars. One measure per chart, so the title names the series and
 * no legend is needed; hovering (or focusing) a column shows its exact value.
 */
export function BarChart({ title, summary, points, format = String }: BarChartProps) {
  const max = Math.max(...points.map((point) => point.value), 1);

  return (
    <figure className="card flex flex-col gap-3">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-muted">{title}</span>
        <span className="text-lg font-semibold tabular-nums">{summary}</span>
      </figcaption>
      <div className="relative flex h-36 items-end gap-0.5 border-b border-line">
        <span className="absolute left-0 top-0 text-[11px] tabular-nums text-muted">{format(max)}</span>
        {points.map((point) => (
          <div
            key={point.label}
            tabIndex={0}
            aria-label={`${point.label}: ${format(point.value)}`}
            className="group relative flex h-full flex-1 items-end outline-none"
          >
            <div
              className="w-full rounded-t bg-series group-hover:brightness-125 group-focus:brightness-125"
              style={{ height: `${(point.value / max) * 100}%`, minHeight: point.value > 0 ? 2 : 0 }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-raised px-2 py-1 text-xs group-hover:block group-focus:block">
              <span className="text-muted">{point.label}</span> <strong>{format(point.value)}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted">
        <span>{points[0]?.label}</span>
        <span>{points.at(-1)?.label}</span>
      </div>
    </figure>
  );
}
