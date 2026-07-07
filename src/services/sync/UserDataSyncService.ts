import type { AppUser } from '../../types/auth';
import { bookingSyncService } from './BookingSyncService';
import { profileSyncService } from './ProfileSyncService';
import { favoritesService } from '../FavoritesService';
import { logger } from '../../utils/logger';

class UserDataSyncService {
  private syncInFlight: Promise<void> | null = null;

  async syncAll(user?: AppUser | null): Promise<void> {
    if (!user?.uid || user.uid.startsWith('guest_') || user.isAnonymous) return;

    if (this.syncInFlight) {
      await this.syncInFlight;
      return;
    }

    this.syncInFlight = this.doSyncAll(user);
    try {
      await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  private async doSyncAll(user: AppUser): Promise<void> {
    const contact = {
      email: user.email,
      phone: user.phoneNumber,
    };

    await Promise.all([
      profileSyncService.reconcileFromServer(),
      bookingSyncService.syncForUser(user.uid, contact),
      favoritesService.syncFromServer(),
    ]).catch((e) => {
      logger.warn('[UserDataSync] partial failure:', e);
    });
  }

  async syncOnLogin(user?: AppUser | null): Promise<void> {
    await this.syncAll(user);
  }

  async syncOnForeground(user?: AppUser | null): Promise<void> {
    await this.syncAll(user);
  }
}

export const userDataSyncService = new UserDataSyncService();
