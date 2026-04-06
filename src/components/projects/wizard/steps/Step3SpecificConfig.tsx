/**
 * Etapa 3: conteúdo varia por projectType.
 * Para novo tipo, adicionar branch aqui e criar Step3X.tsx; ver EXTENSIBILIDADE.md.
 */
import React from "react";
import type { ProjectType } from "../types";
import type { WizardSpecificConfig } from "../types";
import { Step3Simple } from "./Step3Simple";
import { Step3Areas } from "./Step3Areas";
import { Step3Advanced } from "./Step3Advanced";
import { Step3Template } from "./Step3Template";

interface Step3SpecificConfigProps {
  projectType: ProjectType | null;
  specificConfig: WizardSpecificConfig;
  templateId: string | null;
  onSpecificConfigChange: (partial: Partial<WizardSpecificConfig>) => void;
  onTemplateIdChange: (id: string | null) => void;
}

export function Step3SpecificConfig({
  projectType,
  specificConfig,
  templateId,
  onSpecificConfigChange,
  onTemplateIdChange,
}: Step3SpecificConfigProps) {
  if (!projectType) return null;
  if (projectType === "simple") return <Step3Simple />;
  if (projectType === "areas")
    return (
      <Step3Areas config={specificConfig} onChange={onSpecificConfigChange} />
    );
  if (projectType === "advanced")
    return (
      <Step3Advanced config={specificConfig} onChange={onSpecificConfigChange} />
    );
  if (projectType === "template")
    return (
      <Step3Template
        selectedTemplateId={templateId}
        onSelect={onTemplateIdChange}
      />
    );
  return null;
}
