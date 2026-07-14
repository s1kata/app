import React, { useEffect, useRef } from 'react';
import { Linking, Alert, AppState, AppStateStatus } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { NavigationContainerRef } from '@react-navigation/native';
import { authSession } from '../services/AuthSession';
import { bookingService } from '../services/BookingService';
import { bonusService } from '../services/BonusService';
import { getLastPaymentTransaction, pollPaymentUntilFinal } from '../services/PaymentService';
import { presentPaymentPollOutcome } from '../utils/paymentPollOutcomes';
import { paymentUxBus } from '../services/PaymentUxBus';
import { i18n } from '../config/i18n';
import { logger } from '../utils/logger';
import { useLifecycleLog } from './useLifecycleLog';
import { logIosTestStep, IosTestStep } from '../utils/iosTestFlows';
import { reloadBookingsAfterPayment } from '../utils/paymentBookingsReload';
import { resolvePaymentStatusFromPoll } from '../utils/resolvePaymentStatusFromPoll';
import { showPaymentStatusBar } from '../utils/paymentStatusBanner';
import {
  markPaymentRelinkInProgress,
  shouldDismissInAppBrowserOnReturn,
  isExternalPaymentSession,
  markExternalPaymentSession,
} from '../services/PaymentRelinkState';

type Ref = React.RefObject<NavigationContainerRef<any> | null>;
const PAYMENT_RETURN_FALLBACK_MS = 30000;

/** URL оплаты: booking-success|fail или payment/success|fail */
function isPaymentReturnUrl(url: string): boolean {
  return (
    url.includes('booking-success') ||
    url.includes('booking-fail') ||
    url.includes('payment/success') ||
    url.includes('payment/fail')
  );
}

function isPaymentSuccessUrl(url: string): boolean {
  return url.includes('booking-success') || url.includes('payment/success');
}

/**
 * Диплинк travelhub://booking-success|fail или travelhub://payment/success|fail —
 * статус оплаты всегда с бэкенда (poll), не из URL.
 */
export function usePaymentDeepLinks(navigationRef: Ref) {
  useLifecycleLog('usePaymentDeepLinks');
  const cancelledRef = useRef(false);
  const isHandlingPaymentReturnRef = useRef(false);
  const queuedPaymentUrlRef = useRef<string | null>(null);
  const lastHandledKeyRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    cancelledRef.current = false;
    let initialUrlTimer: ReturnType<typeof setTimeout> | undefined;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;

    const parseBookingId = (url: string): string | null => {
      const match = url.match(/bookingId=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    };

    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const buildPaymentKey = (url: string): string => {
      const bookingId = parseBookingId(url) || 'none';
      const outcome = isPaymentSuccessUrl(url) ? 'success' : 'fail';
      return `${outcome}:${bookingId}`;
    };

    const shouldSkipPaymentKey = (url: string): boolean => {
      const key = buildPaymentKey(url);
      const now = Date.now();
      const last = lastHandledKeyRef.current;
      if (last && last.key === key && now - last.at < 8000) {
        logger.info('[DeepLink] Skip duplicated payment return', { key });
        return true;
      }
      lastHandledKeyRef.current = { key, at: now };
      return false;
    };

    const goBookings = async (): Promise<boolean> => {
      const maxAttempts = 20;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (cancelledRef.current) return false;
        const nav = navigationRef.current;
        const navReady = !!nav && (typeof nav.isReady !== 'function' || nav.isReady());
        if (!navReady) {
          await wait(200);
          continue;
        }
        try {
          nav.navigate('MainTabs', {
            screen: 'Bookings',
            params: { screen: 'BookingsMain' },
          });
          return true;
        } catch (navigateError) {
          logger.warn('[DeepLink] navigate Bookings failed, trying resetRoot', navigateError);
          try {
            nav.resetRoot({
              index: 0,
              routes: [
                {
                  name: 'MainTabs',
                  state: {
                    index: 1,
                    routes: [{ name: 'Home' }, { name: 'Bookings' }, { name: 'Profile' }],
                  },
                },
              ],
            });
            return true;
          } catch (resetError) {
            logger.warn('[DeepLink] resetRoot Bookings failed', resetError);
          }
        }
        await wait(150);
      }
      return false;
    };

    const processPaymentReturn = async (url: string) => {
      if (cancelledRef.current) return;
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(() => {
        if (!cancelledRef.current) {
          paymentUxBus.showPaymentRecovery(() => {
            void goBookings();
          });
        }
      }, PAYMENT_RETURN_FALLBACK_MS);
      const isSuccess = isPaymentSuccessUrl(url);
      if (isSuccess) {
        showPaymentStatusBar(i18n.t('payment.pendingBanner'), 'info');
      } else {
        showPaymentStatusBar(i18n.t('payment.cancelledBanner'), 'warning');
      }
      const bookingIdFromUrl = parseBookingId(url);

      try {
        const last = await getLastPaymentTransaction();
        if (cancelledRef.current) return;
        if (!last?.transactionId) {
          paymentUxBus.showPaymentRecovery(() => {
            void goBookings();
          });
          return;
        }

        if (bookingIdFromUrl && String(last.orderId) !== String(bookingIdFromUrl)) {
          logger.warn('[DeepLink] bookingId в URL не совпал с последней сессией оплаты — опираемся на последний transactionId');
        }

        const statusResult = await pollPaymentUntilFinal(last.transactionId, {
          intervalMs: 4000,
          maxWaitMs: 120000,
        });
        if (cancelledRef.current) return;

        const stored = await authSession.getStoredUser();
        const uid = stored?.id;
        presentPaymentPollOutcome({
          transactionId: last.transactionId,
          result: statusResult,
          onStatusResolved: async (result) => {
            if (!last.orderId) return;
            // Fail / cancel return + ещё pending у банка → разблокируем повторную оплату.
            if (!isSuccess && result.success && result.status === 'pending') {
              await bookingService.markPaymentStatus(last.orderId, 'pending');
              return;
            }
            const paymentStatus = resolvePaymentStatusFromPoll(result);
            if (!paymentStatus) return;
            const extra: { paidAt?: string } = {};
            if (paymentStatus === 'paid') {
              extra.paidAt = result.paidAt || new Date().toISOString();
            }
            await bookingService.markPaymentStatus(last.orderId, paymentStatus, extra);
          },
          onReload: reloadBookingsAfterPayment,
          onBeforeSuccessAlert: async () => {
            if (uid && last.orderId) {
              await bookingService.maybeAwardLoyaltyAfterPaidBooking(uid, last.orderId);
              const user = await authSession.getStoredUser();
              await bonusService.redeemAfterSuccessfulPayment(
                last.orderId,
                user?.email,
                user?.phone,
              );
            }
          },
          onPendingOk: () => {
            void goBookings();
          },
          alertSuccess: () => {
            if (recoveryTimer) clearTimeout(recoveryTimer);
            paymentUxBus.showPaymentSuccess(() => {
              void goBookings();
            });
          },
          alertFailed: () => {
            if (recoveryTimer) clearTimeout(recoveryTimer);
            Alert.alert(i18n.t('common.error'), i18n.t('payment.failedRetryMessage'), [
              { text: i18n.t('common.ok'), onPress: () => void goBookings() },
            ]);
          },
          alertFallbackError: () => {
            if (recoveryTimer) clearTimeout(recoveryTimer);
            Alert.alert(i18n.t('common.error'), i18n.t('payment.failedMessage'), [
              { text: i18n.t('common.ok'), onPress: () => void goBookings() },
            ]);
          },
          alertNetworkError: (message) => {
            if (recoveryTimer) clearTimeout(recoveryTimer);
            Alert.alert(i18n.t('common.error'), message, [
              { text: i18n.t('common.ok'), onPress: () => void goBookings() },
            ]);
          },
        });
      } catch (e) {
        logger.warn('[DeepLink] payment return:', e);
        if (recoveryTimer) clearTimeout(recoveryTimer);
        paymentUxBus.showPaymentRecovery(() => {
          void goBookings();
        });
      }
    };

    const runPaymentQueue = async () => {
      if (isHandlingPaymentReturnRef.current) return;
      const url = queuedPaymentUrlRef.current;
      if (!url) return;
      if (shouldSkipPaymentKey(url)) {
        queuedPaymentUrlRef.current = null;
        return true;
      }
      isHandlingPaymentReturnRef.current = true;
      queuedPaymentUrlRef.current = null;
      markExternalPaymentSession(false);
      markPaymentRelinkInProgress(true);
      logger.info('[DeepLink] Payment relink started');
      try {
        const bookingIdFromUrl = parseBookingId(url);
        const lastTx = await getLastPaymentTransaction();
        if (bookingIdFromUrl && lastTx?.orderId && String(lastTx.orderId) !== String(bookingIdFromUrl)) {
          logger.warn('[DeepLink] Skip stale payment URL by bookingId mismatch', {
            bookingIdFromUrl,
            lastOrderId: String(lastTx.orderId),
          });
          return;
        }

        const navigated = await goBookings();
        if (!navigated) {
          logger.warn('[DeepLink] Failed to navigate to Bookings before payment processing');
          paymentUxBus.showPaymentRecovery(() => {
            void goBookings();
          });
          return;
        }
        await processPaymentReturn(url);
      } finally {
        if (shouldDismissInAppBrowserOnReturn()) {
          await WebBrowser.dismissBrowser().catch(() => {});
        }
        markExternalPaymentSession(false);
        isHandlingPaymentReturnRef.current = false;
        markPaymentRelinkInProgress(false);
        logger.info('[DeepLink] Payment relink finished');
        if (queuedPaymentUrlRef.current) {
          void runPaymentQueue();
        }
      }
    };

    const enqueuePaymentUrl = (url: string) => {
      queuedPaymentUrlRef.current = url;
      void runPaymentQueue();
    };

    const handleUrl = (event: { url: string }) => {
      const url = event?.url || '';
      logger.info('[DeepLink] URL received', { url: url.slice(0, 120) });
      if (isPaymentReturnUrl(url)) {
        logIosTestStep(IosTestStep.BROWSER_RETURN, { success: isPaymentSuccessUrl(url) });
        enqueuePaymentUrl(url);
        return;
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);

    let externalReturnTimer: ReturnType<typeof setTimeout> | undefined;
    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active' || cancelledRef.current) return;
      if (!isExternalPaymentSession() || isHandlingPaymentReturnRef.current) return;
      if (externalReturnTimer) clearTimeout(externalReturnTimer);
      externalReturnTimer = setTimeout(() => {
        if (cancelledRef.current || isHandlingPaymentReturnRef.current) return;
        if (!isExternalPaymentSession()) return;
        logger.info('[DeepLink] External payment return without deep link — poll & recover');
        markExternalPaymentSession(false);
        void (async () => {
          try {
            const last = await getLastPaymentTransaction();
            if (cancelledRef.current || !last?.transactionId || !last.orderId) {
              paymentUxBus.showPaymentRecovery(() => {
                void goBookings();
              });
              return;
            }
            await goBookings();
            const statusResult = await pollPaymentUntilFinal(last.transactionId, {
              intervalMs: 3000,
              maxWaitMs: 20000,
            });
            if (cancelledRef.current) return;
            const stored = await authSession.getStoredUser();
            const uid = stored?.id;
            presentPaymentPollOutcome({
              transactionId: last.transactionId,
              result: statusResult,
              onStatusResolved: async (result) => {
                // Без deep link: pending после короткого опроса = не завершили оплату → снова «Оплатить».
                if (result.success && result.status === 'pending') {
                  await bookingService.markPaymentStatus(last.orderId, 'pending');
                  return;
                }
                const paymentStatus = resolvePaymentStatusFromPoll(result);
                if (!paymentStatus) return;
                const extra: { paidAt?: string } = {};
                if (paymentStatus === 'paid') {
                  extra.paidAt = result.paidAt || new Date().toISOString();
                }
                await bookingService.markPaymentStatus(last.orderId, paymentStatus, extra);
              },
              onReload: reloadBookingsAfterPayment,
              onBeforeSuccessAlert: async () => {
                if (uid && last.orderId) {
                  await bookingService.maybeAwardLoyaltyAfterPaidBooking(uid, last.orderId);
                  const user = await authSession.getStoredUser();
                  await bonusService.redeemAfterSuccessfulPayment(
                    last.orderId,
                    user?.email,
                    user?.phone,
                  );
                }
              },
              onPendingOk: () => {
                void goBookings();
              },
              alertSuccess: () => {
                paymentUxBus.showPaymentSuccess(() => {
                  void goBookings();
                });
              },
              alertFailed: () => {
                Alert.alert(i18n.t('common.error'), i18n.t('payment.failedRetryMessage'), [
                  { text: i18n.t('common.ok'), onPress: () => void goBookings() },
                ]);
              },
              alertFallbackError: () => {
                paymentUxBus.showPaymentRecovery(() => {
                  void goBookings();
                });
              },
              alertNetworkError: () => {
                paymentUxBus.showPaymentRecovery(() => {
                  void goBookings();
                });
              },
            });
          } catch (e) {
            logger.warn('[DeepLink] external return recover:', e);
            paymentUxBus.showPaymentRecovery(() => {
              void goBookings();
            });
          }
        })();
      }, 2000);
    });

    Linking.getInitialURL()
      .then((url) => {
        if (cancelledRef.current) return;
        if (url && isPaymentReturnUrl(url)) {
          initialUrlTimer = setTimeout(() => {
            enqueuePaymentUrl(url);
          }, 400);
        }
      })
      .catch((err) => {
        logger.warn('[DeepLink] getInitialURL failed:', (err as Error)?.message || err);
      });
    return () => {
      cancelledRef.current = true;
      markPaymentRelinkInProgress(false);
      markExternalPaymentSession(false);
      sub.remove();
      appStateSub.remove();
      if (initialUrlTimer) clearTimeout(initialUrlTimer);
      if (recoveryTimer) clearTimeout(recoveryTimer);
      if (externalReturnTimer) clearTimeout(externalReturnTimer);
    };
  }, [navigationRef]);
}
