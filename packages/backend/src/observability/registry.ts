/**
 * Registry in-process (sem dependência Prometheus externa).
 * Expõe JSON + texto estilo Prometheus para scrape.
 */

export type LabelMap = Record<string, string>;

type Counter = { name: string; help: string; values: Map<string, number> };
type Gauge = { name: string; help: string; values: Map<string, number> };
type Hist = {
  name: string;
  help: string;
  buckets: number[];
  values: Map<string, { counts: number[]; sum: number; count: number }>;
};

function labelKey(labels?: LabelMap): string {
  if (!labels) return '';
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',');
}

function parseLabels(key: string): LabelMap {
  if (!key) return {};
  const out: LabelMap = {};
  for (const part of key.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

const counters = new Map<string, Counter>();
const gauges = new Map<string, Gauge>();
const hists = new Map<string, Hist>();

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

export function ensureCounter(name: string, help: string): void {
  if (!counters.has(name)) counters.set(name, { name, help, values: new Map() });
}

export function ensureGauge(name: string, help: string): void {
  if (!gauges.has(name)) gauges.set(name, { name, help, values: new Map() });
}

export function ensureHistogram(name: string, help: string, buckets = DEFAULT_BUCKETS): void {
  if (!hists.has(name)) hists.set(name, { name, help, buckets: [...buckets], values: new Map() });
}

export function incCounter(name: string, labels?: LabelMap, by = 1): void {
  const c = counters.get(name);
  if (!c) return;
  const k = labelKey(labels);
  c.values.set(k, (c.values.get(k) || 0) + by);
}

export function setGauge(name: string, value: number, labels?: LabelMap): void {
  const g = gauges.get(name);
  if (!g) return;
  g.values.set(labelKey(labels), value);
}

export function observeHistogram(name: string, valueMs: number, labels?: LabelMap): void {
  const h = hists.get(name);
  if (!h) return;
  const k = labelKey(labels);
  let row = h.values.get(k);
  if (!row) {
    row = { counts: h.buckets.map(() => 0), sum: 0, count: 0 };
    h.values.set(k, row);
  }
  row.sum += valueMs;
  row.count += 1;
  for (let i = 0; i < h.buckets.length; i++) {
    if (valueMs <= h.buckets[i]!) row.counts[i]! += 1;
  }
}

export type MetricsSnapshot = {
  ts: string;
  uptime_s: number;
  counters: Record<string, Array<{ labels: LabelMap; value: number }>>;
  gauges: Record<string, Array<{ labels: LabelMap; value: number }>>;
  histograms: Record<
    string,
    Array<{ labels: LabelMap; count: number; sum: number; avg: number; buckets: number[] }>
  >;
};

export function getMetricsSnapshot(): MetricsSnapshot {
  const countersOut: MetricsSnapshot['counters'] = {};
  for (const [name, c] of counters) {
    countersOut[name] = [...c.values.entries()].map(([k, value]) => ({
      labels: parseLabels(k),
      value,
    }));
  }
  const gaugesOut: MetricsSnapshot['gauges'] = {};
  for (const [name, g] of gauges) {
    gaugesOut[name] = [...g.values.entries()].map(([k, value]) => ({
      labels: parseLabels(k),
      value,
    }));
  }
  const histOut: MetricsSnapshot['histograms'] = {};
  for (const [name, h] of hists) {
    histOut[name] = [...h.values.entries()].map(([k, row]) => ({
      labels: parseLabels(k),
      count: row.count,
      sum: row.sum,
      avg: row.count ? row.sum / row.count : 0,
      buckets: h.buckets,
    }));
  }
  return {
    ts: new Date().toISOString(),
    uptime_s: process.uptime(),
    counters: countersOut,
    gauges: gaugesOut,
    histograms: histOut,
  };
}

/** Formato texto Prometheus (subset). */
export function renderPrometheusText(): string {
  const lines: string[] = [];
  for (const c of counters.values()) {
    lines.push(`# HELP ${c.name} ${c.help}`);
    lines.push(`# TYPE ${c.name} counter`);
    for (const [k, v] of c.values) {
      const labels = k ? `{${k}}` : '';
      lines.push(`${c.name}${labels} ${v}`);
    }
  }
  for (const g of gauges.values()) {
    lines.push(`# HELP ${g.name} ${g.help}`);
    lines.push(`# TYPE ${g.name} gauge`);
    for (const [k, v] of g.values) {
      const labels = k ? `{${k}}` : '';
      lines.push(`${g.name}${labels} ${v}`);
    }
  }
  for (const h of hists.values()) {
    lines.push(`# HELP ${h.name} ${h.help}`);
    lines.push(`# TYPE ${h.name} summary`);
    for (const [k, row] of h.values) {
      const base = k ? `{${k}}` : '';
      lines.push(`${h.name}_count${base} ${row.count}`);
      lines.push(`${h.name}_sum${base} ${row.sum}`);
    }
  }
  return lines.join('\n') + '\n';
}

/** Test helper */
export function resetMetricsRegistryForTests(): void {
  counters.clear();
  gauges.clear();
  hists.clear();
}
