import { BonusTransaction, BonusBalance, SotaApiResponse } from '../types';
import { sotaCrmService } from './SotaCrmService';
import { logger } from '../utils/logger';
import {
  getCrmBackendBaseUrl,
  fetchBonusBalanceViaBackend,
  activateBonusCardViaBackend,
  createBonusOperationViaBackend,
} from './crm/CrmBackendClient';

const BONUS_UNAVAILABLE = 'Бонусы временно недоступны';

/**
 * Сервис бонусов: баланс и история из U-ON (через серверный прокси или dev-ключ).
 */
class BonusService {
  private static instance: BonusService;

  static getInstance(): BonusService {
    if (!BonusService.instance) {
      BonusService.instance = new BonusService();
    }
    return BonusService.instance;
  }

  private mapFriendlyError(error?: string): string {
    if (!error) return BONUS_UNAVAILABLE;
    const e = error.toLowerCase();
    if (e.includes('unauthorized') || e.includes('сессия')) return 'Требуется авторизация';
    if (e.includes('503') || e.includes('not configured') || e.includes('не настроен')) {
      return BONUS_UNAVAILABLE;
    }
    if (e.includes('404') || e.includes('network')) return BONUS_UNAVAILABLE;
    return error;
  }

  computeBalanceFromTransactions(transactions: BonusTransaction[]): number {
    return (transactions || []).reduce((sum, t) => {
      if (t.increase === 1) return sum + (t.amount ?? 0);
      if (t.decrease === 1) return sum - (t.amount ?? 0);
      return sum;
    }, 0);
  }

  getCardIdFromTransactions(transactions: BonusTransaction[]): number | null {
    const withCard = (transactions || []).find((t) => t.bcard_id > 0);
    return withCard ? withCard.bcard_id : null;
  }

  async getBonusBalanceAndHistory(params: {
    email?: string;
    phone?: string;
  }): Promise<SotaApiResponse<BonusBalance>> {
    if (getCrmBackendBaseUrl()) {
      const r = await fetchBonusBalanceViaBackend(params.email, params.phone);
      if (r.success && r.data) {
        return { success: true, data: r.data as BonusBalance };
      }
      if (r.error && r.error !== 'no_backend') {
        return {
          success: false,
          error: this.mapFriendlyError(r.error),
          data: { balance: 0, transactions: [] },
        };
      }
    }

    if (!sotaCrmService.hasDirectUonCredentials()) {
      return { success: false, error: BONUS_UNAVAILABLE };
    }
    if (!params.email && !params.phone) {
      return { success: false, error: 'Укажите email или телефон' };
    }

    const clientId = await sotaCrmService.getClientId(params);
    if (clientId == null) {
      logger.debug('[BonusService] Клиент не найден');
      return { success: true, data: { balance: 0, transactions: [] } };
    }

    const response = await sotaCrmService.getBonusTransactionsByUser(clientId);
    if (!response.success || !response.data) {
      return {
        success: false,
        error: this.mapFriendlyError(response.error),
        data: { balance: 0, transactions: [] },
      };
    }

    const transactions = response.data;
    const balance = this.computeBalanceFromTransactions(transactions);
    return { success: true, data: { balance, transactions } };
  }

  async getBalance(email?: string, phone?: string): Promise<number> {
    const res = await this.getBonusBalanceAndHistory({ email, phone });
    return res.success && res.data ? res.data.balance : 0;
  }

  async getBonusHistory(email?: string, phone?: string): Promise<BonusTransaction[]> {
    const res = await this.getBonusBalanceAndHistory({ email, phone });
    if (!res.success || !res.data) return [];
    const list = res.data.transactions || [];
    return [...list].sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''));
  }

  /**
   * Активация бонусной карты (U-ON: bcard-activate/create).
   */
  async activateBonusCard(params: {
    bc_number: string;
    email?: string;
    phone?: string;
  }): Promise<SotaApiResponse<unknown>> {
    const bcNumber = params.bc_number?.trim();
    if (!bcNumber) {
      return { success: false, error: 'Укажите номер карты' };
    }

    if (getCrmBackendBaseUrl()) {
      let userId: number | undefined;
      if (sotaCrmService.hasDirectUonCredentials() && (params.email || params.phone)) {
        const id = await sotaCrmService.getClientId(params);
        if (id != null) userId = id;
      }
      const r = await activateBonusCardViaBackend(bcNumber, userId);
      if (r.success) return { success: true, data: r.data };
      if (r.error && r.error !== 'no_backend') {
        return { success: false, error: this.mapFriendlyError(r.error) };
      }
    }

    if (!sotaCrmService.hasDirectUonCredentials()) {
      return { success: false, error: BONUS_UNAVAILABLE };
    }

    const clientId = await sotaCrmService.getClientId(params);
    if (clientId == null) {
      return { success: false, error: 'Клиент не найден в CRM' };
    }

    return sotaCrmService.activateBonusCard(clientId, bcNumber);
  }

  /**
   * Списание бонусов при оплате (U-ON: bcard-bonus/create, type=2).
   */
  async deductBonuses(params: {
    bc_id: number;
    amount: number;
    reason?: string;
    email?: string;
    phone?: string;
  }): Promise<SotaApiResponse<unknown>> {
    const amount = Math.floor(params.amount);
    if (params.bc_id <= 0 || amount <= 0) {
      return { success: false, error: 'Некорректные параметры списания' };
    }

    if (getCrmBackendBaseUrl()) {
      const r = await createBonusOperationViaBackend({
        bc_id: params.bc_id,
        type: 2,
        bonuses: amount,
        reason: params.reason,
      });
      if (r.success) return { success: true, data: r.data };
      if (r.error && r.error !== 'no_backend') {
        return { success: false, error: this.mapFriendlyError(r.error) };
      }
    }

    if (!sotaCrmService.hasDirectUonCredentials()) {
      return { success: false, error: BONUS_UNAVAILABLE };
    }

    return sotaCrmService.createBonusOperation({
      bc_id: params.bc_id,
      type: 2,
      bonuses: amount,
      reason: params.reason,
    });
  }
}

export const bonusService = BonusService.getInstance();
