import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { ModulePermissionError } from '../permissions/index.js';
import { buildContractPdfBuffer } from '../services/contractPdfService.js';
import { buildEvidenceSummary } from '../services/contractEvidenceSummaryService.js';

export async function getContractPdf(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const result = await buildContractPdfBuffer({ contractId: id, requestUserId: userId, req });
    if (!result) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'CONTRACT_PDF_NO_SNAPSHOT') {
      res.status(400).json({
        error: 'Não é possível gerar PDF sem documento congelado (snapshot).',
        code: 'CONTRACT_PDF_NO_SNAPSHOT',
      });
      return;
    }
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getContractPdf:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getContractEvidenceSummary(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const summary = await buildEvidenceSummary({ contractId: id, requestUserId: userId, req });
    if (!summary) {
      res.status(404).json({ error: 'Contrato não encontrado' });
      return;
    }
    res.json(summary);
  } catch (error: unknown) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getContractEvidenceSummary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
