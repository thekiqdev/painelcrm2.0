/**

 * Testes S29 / S29.1 — ensure_conversation (normalização, parse, idempotência, DM-only).

 */

import { describe, expect, it } from 'vitest';

import {

  normalizeEnsureConversationPhone,

  parseEnsureConversationData,

  previewNormalizedPhone,

  resolveEnsureIdempotencyKey,

} from './flowEnsureConversation.js';



describe('S29 ensure_conversation', () => {

  describe('normalizeEnsureConversationPhone', () => {

    it('prefixa 55 em celular BR 11 dígitos', () => {

      const r = normalizeEnsureConversationPhone('(11) 98888-7777', true);

      expect(r).toEqual({ ok: true, digits: '5511988887777' });

    });



    it('aceita já com 55', () => {

      const r = normalizeEnsureConversationPhone('+55 11 98888-7777', true);

      expect(r).toEqual({ ok: true, digits: '5511988887777' });

    });



    it('sem normalize_br não prefixa 55', () => {

      const r = normalizeEnsureConversationPhone('11988887777', false);

      expect(r).toEqual({ ok: true, digits: '11988887777' });

    });



    it('rejeita vazio', () => {

      const r = normalizeEnsureConversationPhone('  ', true);

      expect(r.ok).toBe(false);

      if (!r.ok) expect(r.error).toMatch(/vazio/i);

    });



    it('rejeita inválido curto', () => {

      const r = normalizeEnsureConversationPhone('123', true);

      expect(r.ok).toBe(false);

      if (!r.ok) expect(r.error).toMatch(/inválido/i);

    });



    it('S29.1 DM-only: rejeita JID de grupo', () => {

      const r = normalizeEnsureConversationPhone('120363@g.us', true);

      expect(r.ok).toBe(false);

      if (!r.ok) expect(r.error).toMatch(/1:1|DM|grupo/i);

    });

  });



  describe('parseEnsureConversationData', () => {

    it('defaults: normalize_br true, reuse open, idempotency vazio', () => {

      expect(parseEnsureConversationData({ phone: '{{order.phone}}' })).toEqual({

        phone: '{{order.phone}}',

        normalize_br: true,

        instance_id: null,

        reuse_policy: 'open',

        idempotency_key: '',

      });

    });



    it('aceita reuse_policy, instance_id e idempotency_key', () => {

      const id = '11111111-1111-1111-1111-111111111111';

      expect(

        parseEnsureConversationData({

          phone: '1199',

          normalize_br: false,

          reuse_policy: 'always_create',

          instance_id: id,

          idempotency_key: '{{order.id}}',

        })

      ).toEqual({

        phone: '1199',

        normalize_br: false,

        instance_id: id,

        reuse_policy: 'always_create',

        idempotency_key: '{{order.id}}',

      });

    });

  });



  describe('previewNormalizedPhone', () => {

    it('formata preview com +', () => {

      expect(previewNormalizedPhone('11988887777', true)).toBe('+5511988887777');

    });



    it('vazio se inválido', () => {

      expect(previewNormalizedPhone('xx', true)).toBe('');

    });

  });



  describe('S29.1 resolveEnsureIdempotencyKey', () => {

    it('vazio / só espaços → null (idempotência off)', () => {

      expect(resolveEnsureIdempotencyKey('', {})).toBeNull();

      expect(resolveEnsureIdempotencyKey('   ', {})).toBeNull();

      expect(resolveEnsureIdempotencyKey(null, {})).toBeNull();

    });



    it('interpola {{order.id}}', () => {

      expect(

        resolveEnsureIdempotencyKey('{{order.id}}', { 'order.id': 'WOO-42', order_id: 'WOO-42' })

      ).toBe('WOO-42');

    });



    it('trunca chave longa', () => {

      const long = 'x'.repeat(300);

      expect(resolveEnsureIdempotencyKey(long, {})?.length).toBe(256);

    });



    it('template resolvido vazio → null', () => {

      expect(resolveEnsureIdempotencyKey('{{missing}}', {})).toBeNull();

    });

  });

});


