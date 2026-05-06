import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getCatalogEntry } from '../services/adminScripts/adminScriptsCatalog.js';
import {
  AdminScriptNotImplementedError,
  AdminScriptValidationError,
  listScriptsWithLastRun,
  runAdminScript,
} from '../services/adminScripts/adminScriptsService.js';
import { getWhatsappAvatarCacheWorkerStatusSnapshot } from '../services/whatsappAvatarCacheWorker.js';
import { pool } from '../utils/db.js';

/** Texto exato aceito em `acknowledgeStatement` para execuções que alteram dados de mídia. */
export const ADMIN_SCRIPT_MEDIA_ACK_STATEMENT =
  'Entendo que esta ação irá alterar dados de mídia.';

export async function getWhatsappAvatarCacheWorkerStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const status = await getWhatsappAvatarCacheWorkerStatusSnapshot(pool);
    res.json({ ok: true, ...status });
  } catch (e: unknown) {
    console.error('[admin-scripts] avatar-cache-worker-status', e);
    const msg = e instanceof Error ? e.message : 'Erro interno';
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function listAdminScripts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const scripts = await listScriptsWithLastRun();
    res.json({ scripts });
  } catch (e: unknown) {
    console.error('[admin-scripts] list', e);
    const msg = e instanceof Error ? e.message : 'Erro interno';
    res.status(500).json({ error: msg });
  }
}

export async function previewAdminScript(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }
  const scriptKey = req.params.scriptKey;
  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  try {
    const { runId, result } = await runAdminScript({
      scriptKey,
      mode: 'preview',
      userId,
      body: body as Record<string, unknown>,
    });
    res.json({ runId, result });
  } catch (e: unknown) {
    if (e instanceof AdminScriptValidationError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    if (e instanceof AdminScriptNotImplementedError) {
      res.status(501).json({ error: e.message });
      return;
    }
    console.error('[admin-scripts] preview', e);
    const msg = e instanceof Error ? e.message : 'Erro interno';
    res.status(500).json({ error: msg });
  }
}

export async function executeAdminScript(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }
  const scriptKey = req.params.scriptKey;
  const entry = getCatalogEntry(scriptKey);
  if (!entry) {
    res.status(404).json({ error: 'Script desconhecido.' });
    return;
  }
  if (entry.auditOnly || entry.category === 'audit') {
    res.status(400).json({ error: 'Este script não pode ser executado (somente auditoria).' });
    return;
  }
  if ((entry.category === 'repair' || entry.category === 'reprocess') && entry.key.startsWith('media.')) {
    const body = req.body as {
      acknowledgeMediaDataChange?: boolean;
      acknowledgeStatement?: string;
    };
    const statementOk =
      typeof body?.acknowledgeStatement === 'string' &&
      body.acknowledgeStatement.trim() === ADMIN_SCRIPT_MEDIA_ACK_STATEMENT;
    const ok = body?.acknowledgeMediaDataChange === true || statementOk;
    if (!ok) {
      res.status(400).json({
        error:
          'Confirmação obrigatória: indique que compreende a alteração de dados de mídia (acknowledgeMediaDataChange ou acknowledgeStatement).',
        requiredAcknowledge: true,
      });
      return;
    }
  }

  const payload =
    typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};
  try {
    const { runId, result } = await runAdminScript({
      scriptKey,
      mode: 'execute',
      userId,
      body: payload,
    });
    res.json({ runId, result });
  } catch (e: unknown) {
    if (e instanceof AdminScriptValidationError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    if (e instanceof AdminScriptNotImplementedError) {
      res.status(501).json({ error: e.message });
      return;
    }
    console.error('[admin-scripts] execute', e);
    const msg = e instanceof Error ? e.message : 'Erro interno';
    res.status(500).json({ error: msg });
  }
}
