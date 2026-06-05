import { BonusTransaction, BonusBalance, SotaApiResponse } from '../types';
import { sotaCrmService } from './SotaCrmService';
import { logger } from '../utils/logger';
import { getCrmBackendBaseUrl, fetchBonusBalanceViaBackend } from './crm/CrmBackendClient';

/**
 * Сервис бонусов: баланс и история берутся из SOTA (U-ON).
 * Начисление и списание (в т.ч. обнуление старых бонусов) выполняются в системе.
 */
class BonusService {
  private static instance: BonusService;

  static getInstance(): BonusService {
    if (!BonusService.instance) {
      BonusService.instance = new BonusService();
    }
    return BonusService.instance;
  }

  /**
   * Вычисление текущего баланса по списку транзакций U-ON.
   * increase=1 → +amount, decrease=1 → -amount.
   */
  computeBalanceFromTransactions(transactions: BonusTransaction[]): number {
    return (transactions || []).reduce((sum, t) => {
      if (t.increase === 1) return sum + (t.amount ?? 0);
      if (t.decrease === 1) return sum - (t.amount ?? 0);
      return sum;
    }, 0);
  }

  /**
   * Получение баланса и истории бонусов по email или телефону клиента в SOTA.
   */
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
        return { success: false, error: r.error, data: { balance: 0, transactions: [] } };
      }
    }

    if (!sotaCrmService.hasCredentials()) {
      return { success: false, error: 'Сервис бонусов не настроен' };
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
      return { success: false, error: response.error, data: { balance: 0, transactions: [] } };
    }

    const transactions = response.data;
    const balance = this.computeBalanceFromTransactions(transactions);
    return {
      success: true,
      data: { balance, transactions },
    };
  }

  /**
   * Только баланс бонусов.
   */
  async getBalance(email?: string, phone?: string): Promise<number> {
    const res = await this.getBonusBalanceAndHistory({ email, phone });
    return res.success && res.data ? res.data.balance : 0;
  }

  /**
   * Только история транзакций бонусов (от новых к старым).
   */
  async getBonusHistory(email?: string, phone?: string): Promise<BonusTransaction[]> {
    const res = await this.getBonusBalanceAndHistory({ email, phone });
    if (!res.success || !res.data) return [];
    const list = res.data.transactions || [];
    return [...list].sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''));
  }
}

export const bonusService = BonusService.getInstance();
