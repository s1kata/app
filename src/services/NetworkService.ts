/**
 * Мониторинг сети: быстрый баннер при проблемах, фоновые ретраи до HTTP 200 от бэкенда.
 */
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { pingBackendHealth, pingGeneralInternet } from '../utils/backendHealth';
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

const FAST_FAIL_MS = 2500;
const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 30000;

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
  private _fastFailTimer: ReturnType<typeof setTimeout> | null = null;
  private _isOffline = false;

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
    this._armFastFail();
    try {
      const hasInternet = await pingGeneralInternet();
      if (!hasInternet) {
        this._disarmFastFail();
        this._setOffline(true);
        this._applyState({ status: 'offline', issue: 'offline' });
        return this._state;
      }
      this._setOffline(false);

      const backendOk = await pingBackendHealth();
      this._disarmFastFail();
      if (!backendOk) {
        this._applyState({ status: 'degraded', issue: 'backend_unreachable' });
        return this._state;
      }

      this._applyState({ status: 'ok', issue: null });
      return this._state;
    } catch (error) {
      logger.error('[NetworkService] checkConnection error:', error);
      this._disarmFastFail();
      this._applyState({ status: 'degraded', issue: 'backend_unreachable' });
      return this._state;
    } finally {
      this._checkInProgress = false;
      if (this._pendingRecheck) {
        this._pendingRecheck = false;
        void this.checkConnection();
      }
    }
  }

  /** Актуальная проверка перед действием (не блокирует UI). */
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
    this._disarmFastFail();
  }

  private _toLegacyPolicy(): NetworkPolicyState {
    const blocked = this._state.status === 'offline' || this._state.status === 'degraded';
    return {
      isBlocked: blocked,
      reason: this._state.issue,
      canProceed: !blocked,
    };
  }

  private _armFastFail(): void {
    if (this._state.status === 'ok') return;
    if (this._fastFailTimer) return;
    this._fastFailTimer = setTimeout(() => {
      this._fastFailTimer = null;
      if (this._checkInProgress && this._state.status === 'checking') {
        this._applyState({ status: 'degraded', issue: 'backend_unreachable' });
      }
    }, FAST_FAIL_MS);
  }

  private _disarmFastFail(): void {
    if (this._fastFailTimer) {
      clearTimeout(this._fastFailTimer);
      this._fastFailTimer = null;
    }
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
  /** @deprecated — используйте isBackendOk / refreshConnection */
  async ensureOnlineVerified(): Promise<boolean> {
    await this.checkConnection();
    return this.isBackendOk;
  }
}

export const networkService = NetworkService.getInstance();
