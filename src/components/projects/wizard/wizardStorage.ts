/**
 * Persistência temporária do wizard (Fase 4).
 * Chave no sessionStorage para recuperar rascunho após refresh.
 */

import type { WizardState } from "./types";
import { getInitialWizardState } from "./types";

const STORAGE_KEY = "project_wizard_draft";

export function saveWizardDraft(state: WizardState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Erro ao salvar rascunho do wizard:", e);
  }
}

export function loadWizardDraft(): WizardState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardState;
    if (!parsed || typeof parsed.step !== "number") return null;
    return {
      step: Math.min(4, Math.max(1, parsed.step)) as 1 | 2 | 3 | 4,
      projectType: parsed.projectType ?? null,
      templateId: parsed.templateId ?? null,
      basicConfig: {
        name: String(parsed.basicConfig?.name ?? ""),
        clientId: parsed.basicConfig?.clientId ?? null,
        description: String(parsed.basicConfig?.description ?? ""),
        responsibleIds: Array.isArray(parsed.basicConfig?.responsibleIds)
          ? parsed.basicConfig.responsibleIds
          : [],
        startDate: parsed.basicConfig?.startDate ?? null,
        endDate: parsed.basicConfig?.endDate ?? null,
      },
      specificConfig: {
        areas: Array.isArray(parsed.specificConfig?.areas)
          ? parsed.specificConfig.areas
          : undefined,
        createFirstVersion: parsed.specificConfig?.createFirstVersion,
        firstVersionName: parsed.specificConfig?.firstVersionName,
        firstVersionDate: parsed.specificConfig?.firstVersionDate ?? undefined,
      },
    };
  } catch {
    return null;
  }
}

export function clearWizardDraft(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function hasWizardDraft(): boolean {
  return !!sessionStorage.getItem(STORAGE_KEY);
}
