import { monitorEventLoopDelay, PerformanceObserver, type PerformanceEntry } from 'perf_hooks';
import { getObservabilityConfig } from './config.js';
import { ensureCounter, ensureGauge, setGauge, incCounter } from './registry.js';

let timer: ReturnType<typeof setInterval> | null = null;
let elHistogram: ReturnType<typeof monitorEventLoopDelay> | null = null;
let lastCpu: NodeJS.CpuUsage | null = null;
let lastWallMs = 0;
let gcObs: PerformanceObserver | null = null;

export function registerRuntimeMetricDefs(): void {
  ensureGauge('process_uptime_seconds', 'Process uptime');
  ensureGauge('process_resident_memory_bytes', 'RSS memory');
  ensureGauge('process_heap_used_bytes', 'V8 heap used');
  ensureGauge('process_heap_total_bytes', 'V8 heap total');
  ensureGauge('process_external_memory_bytes', 'V8 external memory');
  ensureGauge('process_cpu_user_ratio', 'Approx user CPU ratio since last sample');
  ensureGauge('process_cpu_system_ratio', 'Approx system CPU ratio since last sample');
  ensureGauge('nodejs_eventloop_delay_p50_ms', 'Event loop delay p50');
  ensureGauge('nodejs_eventloop_delay_p99_ms', 'Event loop delay p99');
  ensureGauge('nodejs_eventloop_delay_max_ms', 'Event loop delay max');
  ensureCounter('nodejs_gc_runs_total', 'GC runs observed via PerformanceObserver (best-effort)');
}

export function startRuntimeMetricsSampler(): void {
  const cfg = getObservabilityConfig();
  if (!cfg.enabled) return;
  if (timer) return;
  registerRuntimeMetricDefs();

  try {
    elHistogram = monitorEventLoopDelay({ resolution: 20 });
    elHistogram.enable();
  } catch {
    elHistogram = null;
  }

  try {
    gcObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'gc') {
          const kind = String((entry as PerformanceEntry & { kind?: number }).kind ?? 'unknown');
          incCounter('nodejs_gc_runs_total', { kind });
        }
      }
    });
    gcObs.observe({ entryTypes: ['gc'], buffered: true });
  } catch {
    gcObs = null;
  }

  lastCpu = process.cpuUsage();
  lastWallMs = Date.now();

  timer = setInterval(() => {
    sampleOnce();
  }, cfg.runtimePollMs);
  if (typeof timer.unref === 'function') timer.unref();
  sampleOnce();
}

function sampleOnce(): void {
  const mem = process.memoryUsage();
  setGauge('process_uptime_seconds', process.uptime());
  setGauge('process_resident_memory_bytes', mem.rss);
  setGauge('process_heap_used_bytes', mem.heapUsed);
  setGauge('process_heap_total_bytes', mem.heapTotal);
  setGauge('process_external_memory_bytes', mem.external);

  const now = Date.now();
  const wall = Math.max(1, (now - lastWallMs) * 1000);
  const cpu = process.cpuUsage(lastCpu || undefined);
  lastCpu = process.cpuUsage();
  lastWallMs = now;
  setGauge('process_cpu_user_ratio', Math.min(1, cpu.user / wall));
  setGauge('process_cpu_system_ratio', Math.min(1, cpu.system / wall));

  if (elHistogram) {
    setGauge('nodejs_eventloop_delay_p50_ms', elHistogram.percentile(50) / 1e6);
    setGauge('nodejs_eventloop_delay_p99_ms', elHistogram.percentile(99) / 1e6);
    setGauge('nodejs_eventloop_delay_max_ms', elHistogram.max / 1e6);
    elHistogram.reset();
  }
}

export function stopRuntimeMetricsSamplerForTests(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (elHistogram) {
    elHistogram.disable();
    elHistogram = null;
  }
  if (gcObs) {
    gcObs.disconnect();
    gcObs = null;
  }
}
