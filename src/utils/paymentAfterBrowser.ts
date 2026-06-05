import { i18n } from '../config/i18n';
import {
  checkPaymentStatus,
  pollPaymentUntilFinal,
  type PaymentStatusResult,
} from '../services/PaymentService';
import { showPaymentStatusBar } from './paymentStatusBanner';
import { logger } from './logger';

export type BrowserCloseResult = { type: string };

/**
 * После закрытия in-app браузера оплаты: учёт dismiss/cancel и опрос бэкенда.
 */
export async function resolvePaymentAfterBrowser(
  transactionId: string,
  browserResult: BrowserCloseResult,
): Promise<PaymentStatusResult> {
  const dismissed = browserResult.type === 'dismiss' || browserResult.type === 'cancel';

  if (dismissed) {
    showPaymentStatusBar(i18n.t('payment.cancelledBanner'), 'warning');
  }

  try {
    let statusResult = await checkPaymentStatus(transactionId);

    if (!statusResult.success) {
      showPaymentStatusBar(i18n.t('errors.serverUnavailable'), 'error');
      return statusResult;
    }

    if (statusResult.status === 'success') {
      showPaymentStatusBar(i18n.t('payment.successBanner'), 'success');
      return statusResult;
    }
    if (statusResult.status === 'failed') {
      showPaymentStatusBar(i18n.t('payment.failedBanner'), 'error');
      return statusResult;
    }
    if (statusResult.status === 'cancelled') {
      showPaymentStatusBar(i18n.t('payment.cancelledBanner'), 'warning');
      return statusResult;
    }

    if (dismissed && statusResult.status === 'pending') {
      return statusResult;
    }

    if (statusResult.status === 'pending') {
      showPaymentStatusBar(i18n.t('payment.pendingBanner'), 'info');
      statusResult = await pollPaymentUntilFinal(transactionId, {
        intervalMs: 4000,
        maxWaitMs: 90000,
      });
      if (statusResult.status === 'success') {
        showPaymentStatusBar(i18n.t('payment.successBanner'), 'success');
      } else if (statusResult.status === 'failed') {
        showPaymentStatusBar(i18n.t('payment.failedBanner'), 'error');
      } else if (statusResult.status === 'cancelled') {
        showPaymentStatusBar(i18n.t('payment.cancelledBanner'), 'warning');
      } else if (statusResult.pendingLong) {
        showPaymentStatusBar(i18n.t('payment.stillProcessing'), 'info');
      }
    }

    return statusResult;
  } catch (e) {
    logger.error('[paymentAfterBrowser]', e);
    showPaymentStatusBar(i18n.t('errors.serverUnavailable'), 'error');
    return { success: false, error: i18n.t('errors.serverUnavailable') };
  }
}
