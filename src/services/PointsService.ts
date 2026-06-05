import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { AuthService } from './AuthService';

interface PointsTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'earn' | 'spend';
  reason: string;
  bookingId?: string;
  createdAt: Date;
}

class PointsService {
  private static instance: PointsService;
  private readonly POINTS_PER_RUBLE = 0.01; // 1 балл за каждые 100 рублей

  static getInstance(): PointsService {
    if (!PointsService.instance) {
      PointsService.instance = new PointsService();
    }
    return PointsService.instance;
  }

  async getUserPoints(userId: string): Promise<number> {
    try {
      const stored = await AsyncStorage.getItem(`points_${userId}`);
      return stored ? parseInt(stored, 10) : 0;
    } catch (error) {
      logger.error('Error getting points:', error);
      return 0;
    }
  }

  async addPoints(userId: string, amount: number, reason: string, bookingId?: string): Promise<number> {
    try {
      const current = await this.getUserPoints(userId);
      const newTotal = current + amount;
      
      await AsyncStorage.setItem(`points_${userId}`, newTotal.toString());
      
      // Сохраняем транзакцию
      await this.saveTransaction({
        id: `${Date.now()}_${Math.random()}`,
        userId,
        amount,
        type: 'earn',
        reason,
        bookingId,
        createdAt: new Date(),
      });
      
      return newTotal;
    } catch (error) {
      logger.error('Error adding points:', error);
      return 0;
    }
  }

  async spendPoints(userId: string, amount: number, reason: string, bookingId?: string): Promise<number> {
    try {
      const current = await this.getUserPoints(userId);
      if (current < amount) {
        throw new Error('Недостаточно баллов');
      }
      
      const newTotal = current - amount;
      await AsyncStorage.setItem(`points_${userId}`, newTotal.toString());
      
      // Сохраняем транзакцию
      await this.saveTransaction({
        id: `${Date.now()}_${Math.random()}`,
        userId,
        amount,
        type: 'spend',
        reason,
        bookingId,
        createdAt: new Date(),
      });
      
      return newTotal;
    } catch (error) {
      logger.error('Error spending points:', error);
      throw error;
    }
  }

  calculatePointsForPurchase(amount: number): number {
    // 1 балл за каждые 100 рублей
    return Math.floor(amount * this.POINTS_PER_RUBLE);
  }

  async hasEarnedForBooking(userId: string, bookingId: string): Promise<boolean> {
    try {
      const txs = await this.getTransactions(userId);
      return txs.some((t) => t.type === 'earn' && t.bookingId === bookingId);
    } catch {
      return false;
    }
  }

  async awardPointsForBooking(userId: string, bookingId: string, totalPrice: number): Promise<number> {
    if (await this.hasEarnedForBooking(userId, bookingId)) {
      return this.getUserPoints(userId);
    }
    const points = this.calculatePointsForPurchase(totalPrice);
    return await this.addPoints(
      userId,
      points,
      `Бронирование тура на ${totalPrice ? totalPrice.toLocaleString() : 'По запросу'} ₽`,
      bookingId
    );
  }

  private async saveTransaction(transaction: PointsTransaction): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(`points_transactions_${transaction.userId}`);
      const transactions: PointsTransaction[] = stored ? JSON.parse(stored) : [];
      transactions.push(transaction);
      
      // Храним только последние 100 транзакций
      const limited = transactions.slice(-100);
      await AsyncStorage.setItem(
        `points_transactions_${transaction.userId}`,
        JSON.stringify(limited)
      );
    } catch (error) {
      logger.error('Error saving transaction:', error);
    }
  }

  async getTransactions(userId: string): Promise<PointsTransaction[]> {
    try {
      const stored = await AsyncStorage.getItem(`points_transactions_${userId}`);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      logger.error('Error getting transactions:', error);
      return [];
    }
  }
}

export const pointsService = PointsService.getInstance();












