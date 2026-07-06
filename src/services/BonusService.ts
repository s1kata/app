import { BonusTransaction, BonusBalance, SotaApiResponse } from '../types';
import { sotaCrmService } from './SotaCrmService';
import { logger } from '../utils/logger';
import { computeBonusBalanceStats } from '../utils/bonusBalance';
import {
  BONUS_RULES,
  computeBonusQuote,
  type BonusQuote,
  type BonusQuoteResult,
} from '../config/bonusRules';
import {
  getCrmBackendBaseUrl,
  fetchBonusBalanceViaBackend,
  fetchBonusQuoteViaBackend,
  activateBonusCardViaBackend,
  createBonusOperationViaBackend,
} from './crm/CrmBackendClient';
import {
  getPendingBonusRedemption,
  savePendingBonusRedemption,
  clearPendingBonusRedemption,
  isBonusDeductedForBooking,
  markBonusDeductedForBooking,
} from './BonusRedemptionStore';

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

  private enrichBalance(transactions: BonusTransaction[], balance?: number): BonusBalance {
    const stats = computeBonusBalanceStats(transactions);
    return {
      balance: balance ?? stats.balance,
      availableBalance: stats.availableBalance,
      expiringWithin7Days: stats.expiringWithin7Days,
      bcId: stats.bcId,
      transactions,
      rules: BONUS_RULES,
    };
  }

  computeBalanceFromTransactions(transactions: BonusTransaction[]): number {
    return computeBonusBalanceStats(transactions).balance;
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
        const txs = (r.data.transactions || []) as BonusTransaction[];
        const enriched: BonusBalance = {
          ...r.data,
          transactions: txs,
          availableBalance:
            r.data.availableBalance ?? computeBonusBalanceStats(txs).availableBalance,
          expiringWithin7Days:
            r.data.expiringWithin7Days ?? computeBonusBalanceStats(txs).expiringWithin7Days,
          bcId: r.data.bcId ?? computeBonusBalanceStats(txs).bcId,
          rules: r.data.rules ?? BONUS_RULES,
        };
        return { success: true, data: enriched };
      }
      if (r.error && r.error !== 'no_backend') {
        return {
          success: false,
          error: this.mapFriendlyError(r.error),
          data: { balance: 0, transactions: [], availableBalance: 0 },
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
      return { success: true, data: { balance: 0, transactions: [], availableBalance: 0 } };
    }

    const response = await sotaCrmService.getBonusTransactionsByUser(clientId);
    if (!response.success || !response.data) {
      return {
        success: false,
        error: this.mapFriendlyError(response.error),
        data: { balance: 0, transactions: [], availableBalance: 0 },
      };
    }

    const transactions = response.data;
    return { success: true, data: this.enrichBalance(transactions) };
  }

  async quoteRedemption(params: {
    tourPrice: number;
    bonusesToSpend: number;
    email?: string;
    phone?: string;
    availableBalance?: number;
    bcId?: number | null;
  }): Promise<BonusQuoteResult> {
    const spend = Math.max(0, Math.floor(params.bonusesToSpend));
    const price = Math.max(0, Math.floor(params.tourPrice));

    if (getCrmBackendBaseUrl()) {
      const r = await fetchBonusQuoteViaBackend({
        tourPrice: price,
        bonusesToSpend: spend,
        email: params.email,
        phone: params.phone,
      });
      if (r.success && r.data) {
        return { success: true, data: r.data };
      }
      if (r.error && r.error !== 'no_backend') {
        return { success: false, error: this.mapFriendlyError(r.error) };
      }
    }

    let available = params.availableBalance;
    if (available == null && (params.email || params.phone)) {
      const bal = await this.getBonusBalanceAndHistory(params);
      available = bal.data?.availableBalance ?? 0;
    }
    return computeBonusQuote(price, spend, available ?? 0);
  }

  async saveRedemptionForBooking(params: {
    bookingId: string;
    tourPrice: number;
    bonusesToSpend: number;
    bcId: number;
    email?: string;
    phone?: string;
  }): Promise<{ success: boolean; quote?: BonusQuote; error?: string }> {
    const quoteRes = await this.quoteRedemption({
      tourPrice: params.tourPrice,
      bonusesToSpend: params.bonusesToSpend,
      email: params.email,
      phone: params.phone,
    });
    if (!quoteRes.success || !quoteRes.data) {
      return { success: false, error: quoteRes.error };
    }
    if (quoteRes.data.bonusesToSpend <= 0) {
      await clearPendingBonusRedemption(params.bookingId);
      return { success: true, quote: quoteRes.data };
    }
    await savePendingBonusRedemption({
      bookingId: params.bookingId,
      bonusesToSpend: quoteRes.data.bonusesToSpend,
      discountRub: quoteRes.data.discountRub,
      tourPrice: quoteRes.data.tourPrice,
      bcId: params.bcId,
      createdAt: Date.now(),
    });
    return { success: true, quote: quoteRes.data };
  }

  async redeemAfterSuccessfulPayment(
    bookingId: string,
    email?: string,
    phone?: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (await isBonusDeductedForBooking(bookingId)) {
      return { success: true };
    }
    const pending = await getPendingBonusRedemption(bookingId);
    if (!pending || pending.bonusesToSpend <= 0) {
      return { success: true };
    }

    const result = await this.deductBonuses({
      bc_id: pending.bcId,
      amount: pending.bonusesToSpend,
      reason: `Списание по заявке ${bookingId}`,
      email,
      phone,
    });

    if (result.success) {
      await markBonusDeductedForBooking(bookingId);
      await clearPendingBonusRedemption(bookingId);
      return { success: true };
    }
    logger.warn('[BonusService] redeemAfterSuccessfulPayment failed', result.error);
    return { success: false, error: result.error || BONUS_UNAVAILABLE };
  }

  async getBalance(email?: string, phone?: string): Promise<number> {
    const res = await this.getBonusBalanceAndHistory({ email, phone });
    return res.success && res.data ? (res.data.availableBalance ?? res.data.balance) : 0;
  }

  async getBonusHistory(email?: string, phone?: string): Promise<BonusTransaction[]> {
    const res = await this.getBonusBalanceAndHistory({ email, phone });
    if (!res.success || !res.data) return [];
    const list = res.data.transactions || [];
    return [...list].sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''));
  }

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
