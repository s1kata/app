import { authApiClient } from '../AuthApiClient';
import { authSession } from '../AuthSession';
import { logger } from '../../utils/logger';

function parseTime(iso?: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

class ProfileSyncService {
  async reconcileFromServer(): Promise<void> {
    const stored = await authSession.getStoredUser();
    if (!stored || stored.id.startsWith('guest_')) return;

    try {
      const fresh = await authApiClient.me();
      if (!fresh) return;

      const localUpdated = parseTime(stored.updatedAt);
      const serverUpdated = parseTime(fresh.updatedAt);
      if (serverUpdated >= localUpdated) {
        await authSession.updateStoredUser(fresh);
        return;
      }

      if (localUpdated > serverUpdated) {
        await authApiClient.updateProfile({
          fullName: stored.fullName,
          phone: stored.phone,
          passport: stored.passport as Record<string, unknown> | null | undefined,
        });
      }
    } catch (e) {
      logger.debug('[ProfileSync] reconcile failed:', e);
    }
  }
}

export const profileSyncService = new ProfileSyncService();
