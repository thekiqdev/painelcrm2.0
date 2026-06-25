import { logDevMount } from '@/lib/devMountTiming';

const MARK_BOOT = 'perf:app-bootstrap';
const MARK_SHELL = 'perf:shell-mount';
const MARK_PAGE = 'perf:page-mount';
const MARK_DASHBOARD = 'perf:dashboard-mount';

let bootMarked = false;

/** Marca início do bootstrap (DEV). */
export function markAppBootstrapStart(): void {
  if (!import.meta.env.DEV || bootMarked) return;
  bootMarked = true;
  performance.mark(MARK_BOOT);
}

/** Shell montado — mede desde bootstrap. */
export function markShellReady(component = 'AppShell'): void {
  if (!import.meta.env.DEV) return;
  performance.mark(MARK_SHELL);
  try {
    performance.measure('perf:shell', MARK_BOOT, MARK_SHELL);
    const entry = performance.getEntriesByName('perf:shell').pop();
    const ms = entry?.duration?.toFixed(1) ?? '?';
    console.info(`[perf:shell] ${component} ready @ ${ms}ms from bootstrap`);
  } catch {
    console.info(`[perf:shell] ${component} ready`);
  }
  logDevMount(component);
}

/** Primeira página montada dentro do shell. */
export function markPageReady(pageName: string): void {
  if (!import.meta.env.DEV) return;
  const markName = `${MARK_PAGE}:${pageName}`;
  if (performance.getEntriesByName(markName, 'mark').length > 0) return;
  performance.mark(markName);
  try {
    performance.measure(`perf:page:${pageName}`, MARK_SHELL, markName);
    const entry = performance.getEntriesByName(`perf:page:${pageName}`).pop();
    const ms = entry?.duration?.toFixed(1) ?? '?';
    console.info(`[perf:page] ${pageName} @ +${ms}ms from shell`);
  } catch {
    console.info(`[perf:page] ${pageName}`);
  }
}

/** Dashboard montado. */
export function markDashboardReady(): void {
  if (!import.meta.env.DEV) return;
  if (performance.getEntriesByName(MARK_DASHBOARD, 'mark').length > 0) return;
  performance.mark(MARK_DASHBOARD);
  try {
    performance.measure('perf:dashboard', MARK_SHELL, MARK_DASHBOARD);
    const entry = performance.getEntriesByName('perf:dashboard').pop();
    const ms = entry?.duration?.toFixed(1) ?? '?';
    console.info(`[perf:dashboard] @ +${ms}ms from shell`);
  } catch {
    console.info('[perf:dashboard] ready');
  }
  logDevMount('Dashboard');
}
