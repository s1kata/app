import React, { useEffect, useRef } from 'react';
import { Linking, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { NavigationContainerRef } from '@react-navigation/native';
import { authSession } from '../services/AuthSession';
import { bookingService } from '../services/BookingService';
import { getLastPaymentTransaction, pollPaymentUntilFinal } from '../services/PaymentService';
import { presentPaymentPollOutcome } from '../utils/paymentPollOutcomes';
import { i18n } from '../config/i18n';
import { logger } from '../utils/logger';
import { useLifecycleLog } from './useLifecycleLog';
import { logIosTestStep, IosTestStep } from '../utils/iosTestFlows';
import { reloadBookingsAfterPayment } from '../utils/paymentBookingsReload';
import { showPaymentStatusBar } from '../utils/paymentStatusBanner';

type Ref = React.RefObject<NavigationContainerRef<any> | null>;

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

  useEffect(() => {
    cancelledRef.current = false;
    let initialUrlTimer: ReturnType<typeof setTimeout> | undefined;

    const parseBookingId = (url: string): string | null => {
      const match = url.match(/bookingId=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    };

    const goBookings = () =>
      navigationRef.current?.navigate('MainTabs', {
        screen: 'Bookings',
        params: { screen: 'BookingsMain' },
      });

    const handlePaymentReturn = async (url: string) => {
      if (cancelledRef.current) return;
      void WebBrowser.dismissBrowser().catch(() => {});
      goBookings();
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
          Alert.alert(
            isSuccess ? i18n.t('payment.pendingTitle') : i18n.t('common.error'),
            i18n.t('payment.pendingMessage'),
            [{ text: i18n.t('common.ok'), onPress: goBookings }],
          );
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
          onReload: reloadBookingsAfterPayment,
          onBeforeSuccessAlert: async () => {
            if (uid && last.orderId) {
              await bookingService.maybeAwardLoyaltyAfterPaidBooking(uid, last.orderId);
            }
          },
          onPendingOk: goBookings,
          alertSuccess: () =>
            Alert.alert(i18n.t('payment.successTitle'), i18n.t('payment.successMessage'), [
              { text: i18n.t('common.ok'), onPress: goBookings },
            ]),
          alertFailed: () =>
            Alert.alert(i18n.t('common.error'), i18n.t('payment.failedMessage'), [
              { text: i18n.t('common.ok'), onPress: goBookings },
            ]),
          alertFallbackError: () =>
            Alert.alert(i18n.t('common.error'), i18n.t('payment.failedMessage'), [
              { text: i18n.t('common.ok'), onPress: goBookings },
            ]),
          alertNetworkError: (message) =>
            Alert.alert(i18n.t('common.error'), message, [{ text: i18n.t('common.ok'), onPress: goBookings }]),
        });
      } catch (e) {
        logger.warn('[DeepLink] payment return:', e);
        Alert.alert(i18n.t('common.error'), i18n.t('errors.serverUnavailable'), [
          { text: i18n.t('common.ok'), onPress: goBookings },
        ]);
      }
    };

    const handleUrl = (event: { url: string }) => {
      const url = event?.url || '';
      logger.info('[DeepLink] URL received', { url: url.slice(0, 120) });
      if (isPaymentReturnUrl(url)) {
        logIosTestStep(IosTestStep.BROWSER_RETURN, { success: isPaymentSuccessUrl(url) });
        void handlePaymentReturn(url);
        return;
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL()
      .then((url) => {
        if (cancelledRef.current) return;
        if (url && isPaymentReturnUrl(url)) {
          initialUrlTimer = setTimeout(() => void handlePaymentReturn(url), 400);
        }
      })
      .catch((err) => {
        logger.warn('[DeepLink] getInitialURL failed:', (err as Error)?.message || err);
      });
    return () => {
      cancelledRef.current = true;
      sub.remove();
      if (initialUrlTimer) clearTimeout(initialUrlTimer);
    };
  }, [navigationRef]);
}
