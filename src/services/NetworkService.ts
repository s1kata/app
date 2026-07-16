/**
 * Мониторинг сети: баннер только при реальных проблемах, без ложного офлайна через apple.com.
 */
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { isDeviceOffline, pingBackendHealth, pingSiteReachable } from '../utils/backendHealth';
import { getNetworkIssueMessage } from '../utils/networkMessages';
import { logger } from '../utils/logger';

export type NetworkIssue = 'offline' | 'backend_unreachable' | null;
export type ConnectionStatus = 'checking' | 'ok' | 'degraded' | 'offline';

export type NetworkConnectionState = {
  status: ConnectionStatus;
  issue: NetworkIssue;
};

/** @deprecated — используйте NetworkConnectionState */
export type NetworkBlockReason = NetworkIssue;
/** @deprecated */
export type NetworkPolicyState = {
  isBlocked: boolean;
  reason: NetworkBlockReason;
  canProceed: boolean;
};

type ConnectionListener = (state: NetworkConnectionState, prev: NetworkConnectionState) => void;
type RecoveryListener = () => void;
type LegacyListener = () => void;

const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 30000;
const CONSECUTIVE_FAILS_FOR_BANNER = 3;

class NetworkService {
  private static instance: NetworkService;
  private _state: NetworkConnectionState = { status: 'checking', issue: null };
  private connectionListeners = new Set<ConnectionListener>();
  private recoveryListeners = new Set<RecoveryListener>();
  private legacyListeners = new Set<LegacyListener>();
  private netUnsubscribe: (() => void) | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private _checkInProgress = false;
  private _pendingRecheck = false;
  private _retryAttempt = 0;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _isOffline = false;
  private _backendFailStreak = 0;

  static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  get connection(): NetworkConnectionState {
    return this._state;
  }

  get isBackendOk(): boolean {
    return this._state.status === 'ok';
  }

  /** @deprecated */
  get isOnline(): boolean {
    return this._state.status === 'ok';
  }

  /** @deprecated */
  get isOffline(): boolean {
    return this._isOffline;
  }

  /** @deprecated */
  get policy(): NetworkPolicyState {
    return this._toLegacyPolicy();
  }

  subscribeConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  onRecovery(listener: RecoveryListener): () => void {
    this.recoveryListeners.add(listener);
    return () => this.recoveryListeners.delete(listener);
  }

  /** @deprecated — для CRM-очереди и старых подписчиков */
  subscribe(listener: LegacyListener): () => void {
    this.legacyListeners.add(listener);
    return () => this.legacyListeners.delete(listener);
  }

  async checkConnection(): Promise<NetworkConnectionState> {
    if (this._checkInProgress) {
      this._pendingRecheck = true;
      return this._state;
    }
    this._checkInProgress = true;
    try {
      const offline = await isDeviceOffline();
      if (offline) {
        this._backendFailStreak = 0;
        this._setOffline(true);
        this._applyState({ status: 'offline', issue: 'offline' });
        return this._state;
      }
      this._setOffline(false);

      const backendOk = await pingBackendHealth();
      if (backendOk) {
        this._backendFailStreak = 0;
        this._applyState({ status: 'ok', issue: null });
        return this._state;
      }

      // На части Wi-Fi/роутеров POST health может флапать, хотя хост доступен.
      // Если базовый хост отвечает, не показываем тревожный баннер.
      const siteReachable = await pingSiteReachable();
      if (siteReachable) {
        this._backendFailStreak = 0;
        this._applyState({ status: 'ok', issue: null });
        return this._state;
      }

      this._backendFailStreak += 1;
      if (this._backendFailStreak >= CONSECUTIVE_FAILS_FOR_BANNER || this._state.status === 'degraded') {
        this._applyState({ status: 'degraded', issue: 'backend_unreachable' });
      } else if (this._state.status === 'checking') {
        // Первая неудача — не пугаем баннером (мог быть cold start / таймаут).
        this._applyState({ status: 'ok', issue: null });
      }
      return this._state;
    } catch (error) {
      logger.error('[NetworkService] checkConnection error:', error);
      this._backendFailStreak += 1;
      if (this._backendFailStreak >= CONSECUTIVE_FAILS_FOR_BANNER) {
        this._applyState({ status: 'degraded', issue: 'backend_unreachable' });
      }
      return this._state;
    } finally {
      this._checkInProgress = false;
      if (this._pendingRecheck) {
        this._pendingRecheck = false;
        void this.checkConnection();
      }
    }
  }

  async refreshConnection(): Promise<NetworkConnectionState> {
    return this.checkConnection();
  }

  /** @deprecated */
  async ensureCanProceed(): Promise<boolean> {
    await this.checkConnection();
    return this.isBackendOk;
  }

  /** @deprecated */
  getPolicyState(): NetworkPolicyState {
    return this._toLegacyPolicy();
  }

  /** @deprecated */
  getBlockErrorMessage(): string {
    return getNetworkIssueMessage(this._state.issue);
  }

  start(): void {
    if (this.netUnsubscribe) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    this.netUnsubscribe = NetInfo.addEventListener(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void this.checkConnection(), 600);
    });

    this.appStateSubscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void this.checkConnection();
    });

    void this.checkConnection();
  }

  stop(): void {
    this.netUnsubscribe?.();
    this.netUnsubscribe = null;
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this._cancelRetry();
  }

  private _toLegacyPolicy(): NetworkPolicyState {
    const blocked = this._state.status === 'offline' || this._state.status === 'degraded';
    return {
      isBlocked: blocked,
      reason: this._state.issue,
      canProceed: !blocked,
    };
  }

  private _applyState(next: NetworkConnectionState): void {
    const prev = this._state;
    if (prev.status === next.status && prev.issue === next.issue) return;
    this._state = next;

    if (prev.status !== 'ok' && next.status === 'ok') {
      this._retryAttempt = 0;
      this._cancelRetry();
      this.recoveryListeners.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          logger.warn('[NetworkService] recovery listener error:', e);
        }
      });
    } else if (next.status !== 'ok') {
      this._scheduleRetry();
    }

    if (next.status === 'ok') {
      this._cancelRetry();
    }

    this.connectionListeners.forEach((cb) => cb(next, prev));
    this.legacyListeners.forEach((cb) => cb());
    logger.debug('[NetworkService] status:', next.status, next.issue);
  }

  private _scheduleRetry(): void {
    if (this._retryTimer) return;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(1.5, this._retryAttempt));
    this._retryAttempt += 1;
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      void this.checkConnection();
    }, delay);
  }

  private _cancelRetry(): void {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

  private _setOffline(offline: boolean): void {
    if (this._isOffline !== offline) {
      this._isOffline = offline;
      logger.log(`📶 Сеть: ${offline ? 'офлайн' : 'онлайн'}`);
    }
  }

  /** Для CRM: не блокируем отправку — только информируем UI. */
  async ensureOnlineVerified(): Promise<boolean> {
    await this.checkConnection();
    return true;
  }
}

export const networkService = NetworkService.getInstance();
