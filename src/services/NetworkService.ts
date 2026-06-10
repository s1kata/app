/**
 * Сервис для отслеживания состояния сети.
 * Поддерживает офлайн-режим приложения.
 * Использует NetInfo + fetch для проверки (NetInfo на iOS иногда даёт ложный офлайн).
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { getBackendBaseUrl } from '../api/apiClient';
import { logger } from '../utils/logger';

export type NetworkState = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
};

export type NetworkBlockReason = 'vpn' | 'dns_filter' | 'unknown' | null;

export type NetworkPolicyState = {
  isBlocked: boolean;
  reason: NetworkBlockReason;
  canProceed: boolean;
};

type Listener = (state: NetworkState) => void;

function getConnectivityCheckUrls(): string[] {
  const urls = [
    'https://connectivitycheck.gstatic.com/generate_204',
    'https://www.google.com/generate_204',
    'https://clients3.google.com/generate_204',
    'https://exp.host/--/ping',
  ];
  // iOS/LTE: Google может быть недоступен, а travelhub63.ru — доступен (важно для CRM-очереди)
  try {
    const site = getBackendBaseUrl();
    if (site) {
      urls.unshift(`${site}/api/tourvisor-mobile/departures`);
    }
  } catch {
    /* ignore */
  }
  return urls;
}
const FETCH_TIMEOUT_MS = 8000;

/**
 * Реальная проверка: есть ли доступ в интернет (fetch к внешнему URL).
 * Пробует несколько URL, чтобы не считать офлайн из-за блокировки одного домена.
 */
async function pingInternet(): Promise<boolean> {
  for (const url of getConnectivityCheckUrls()) {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
      clearTimeout(timeout);
      // 204 / 200 или любой успешный ответ считаем за "интернет есть"
      if (res && (res.status === 204 || res.status === 200 || res.ok)) return true;
    } catch (e) {
      logger.debug('[NetworkService] ping URL failed:', url, (e as Error)?.message || e);
    }
  }
  return false;
}

class NetworkService {
  private static instance: NetworkService;
  private _isOffline = false;
  private listeners = new Set<Listener>();
  private unsubscribe: (() => void) | null = null;
  private _pingInProgress = false;
  private _policy: NetworkPolicyState = { isBlocked: false, reason: null, canProceed: true };

  static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  get isOffline(): boolean {
    return this._isOffline;
  }

  get isOnline(): boolean {
    return !this._isOffline;
  }

  get policy(): NetworkPolicyState {
    return this._policy;
  }

  /**
   * Проверить подключение к интернету
   */
  async checkConnection(): Promise<NetworkState> {
    try {
      const state = await NetInfo.fetch();
      const isConnected = state.isConnected ?? false;
      const result: NetworkState = {
        isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      };
      this._updatePolicyFromState(state, result);

      // NetInfo на iOS иногда даёт isConnected: false при работающем WiFi.
      // Если NetInfo говорит офлайн — проверяем реальным запросом.
      if (!isConnected) {
        const hasInternet = await this._verifyWithFetch();
        if (hasInternet) {
          result.isConnected = true;
          this._setPolicy({ isBlocked: false, reason: null, canProceed: true });
          this._setOffline(false);
          return result;
        }
      }

      this._updateOfflineState(result);
      return result;
    } catch (error) {
      logger.error('Network check error:', error);
      const hasInternet = await this._verifyWithFetch();
      if (!hasInternet) {
        this._setPolicy({ isBlocked: false, reason: null, canProceed: true });
        this._setOffline(true);
      } else {
        this._setPolicy({ isBlocked: false, reason: null, canProceed: true });
        this._setOffline(false);
      }
      return {
        isConnected: !this._isOffline,
        isInternetReachable: !this._isOffline,
        type: 'unknown',
      };
    }
  }

  private async _verifyWithFetch(): Promise<boolean> {
    if (this._pingInProgress) return !this._isOffline;
    this._pingInProgress = true;
    try {
      return await pingInternet();
    } finally {
      this._pingInProgress = false;
    }
  }

  private _setOffline(offline: boolean): void {
    if (this._isOffline !== offline) {
      this._isOffline = offline;
      logger.log(`📶 Сеть: ${offline ? 'офлайн' : 'онлайн'}`);
      this._notifyListeners();
    }
  }

  private _setPolicy(next: NetworkPolicyState): void {
    const changed =
      this._policy.isBlocked !== next.isBlocked ||
      this._policy.reason !== next.reason ||
      this._policy.canProceed !== next.canProceed;
    if (!changed) return;
    this._policy = next;
    if (next.isBlocked) {
      logger.warn('[NetworkService] blocked policy:', next.reason);
    } else {
      logger.debug('[NetworkService] policy cleared');
    }
    this._notifyListeners();
  }

  private _updatePolicyFromState(raw: NetInfoState, normalized: NetworkState): void {
    const type = String(raw.type || normalized.type || '').toLowerCase();
    const connected = normalized.isConnected;
    const reachable = normalized.isInternetReachable;

    if (type === 'vpn') {
      this._setPolicy({ isBlocked: true, reason: 'vpn', canProceed: false });
      return;
    }

    if (connected && reachable === false) {
      this._setPolicy({ isBlocked: true, reason: 'dns_filter', canProceed: false });
      return;
    }

    this._setPolicy({ isBlocked: false, reason: null, canProceed: true });
  }

  private _updateOfflineState(state: NetInfoState | NetworkState): void {
    const isConnected = state.isConnected ?? false;
    // NetInfo говорит онлайн — доверяем
    if (isConnected) {
      this._setOffline(false);
      return;
    }
      // NetInfo говорит офлайн — ждём реальную проверку (на iOS иначе CRM уходит в «очередь» навсегда)
    void this._verifyWithFetch().then((hasInternet) => {
      this._setOffline(!hasInternet);
    });
  }

  /**
   * Дождаться актуального статуса сети (для CRM/брони сразу после checkConnection).
   */
  async ensureOnlineVerified(): Promise<boolean> {
    await this.checkConnection();
    if (this._policy.isBlocked) return false;
    if (!this._isOffline) return true;
    const hasInternet = await this._verifyWithFetch();
    this._setOffline(!hasInternet);
    return hasInternet;
  }

  private _notifyListeners(): void {
    const state: NetworkState = {
      isConnected: !this._isOffline,
      isInternetReachable: this._isOffline ? false : true,
      type: 'unknown',
    };
    this.listeners.forEach((cb) => cb(state));
  }

  /**
   * Подписаться на изменения состояния сети
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPolicyState(): NetworkPolicyState {
    return this._policy;
  }

  /**
   * Запустить мониторинг сети
   */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = NetInfo.addEventListener((state) => {
      this._updateOfflineState(state);
    });
    this.checkConnection();
  }

  /**
   * Остановить мониторинг
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}

export const networkService = NetworkService.getInstance();
