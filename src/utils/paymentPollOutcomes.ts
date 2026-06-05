import { Alert } from 'react-native';
import { i18n } from '../config/i18n';
import { recheckPaymentUntilFinal, type PaymentStatusResult } from '../services/PaymentService';
import { showPaymentStatusBar } from './paymentStatusBanner';

function networkErrorMessage(error?: string): string {
  if (error && !/network|fetch|timeout|connection|недоступен|unavailable/i.test(error)) {
    return error;
  }
  return i18n.t('errors.serverUnavailable');
}

export type PresentPaymentPollOutcomeParams = {
  transactionId: string;
  result: PaymentStatusResult;
  onReload?: () => Promise<void>;
  onBeforeSuccessAlert?: () => Promise<void>;
  /** После «OK» при pending (короткий или длинный сценарий) */
  onPendingOk?: () => void;
  alertSuccess: () => void;
  alertFailed: () => void;
  alertFallbackError: () => void;
  alertNetworkError: (message: string) => void;
};

/**
 * Единая реакция на результат опроса оплаты: успех / отказ / pending (короткий или «ещё обрабатывается» + «Проверить снова»).
 */
export function presentPaymentPollOutcome(params: PresentPaymentPollOutcomeParams): void {
  const {
    transactionId,
    result,
    onReload,
    onBeforeSuccessAlert,
    onPendingOk,
    alertSuccess,
    alertFailed,
    alertFallbackError,
    alertNetworkError,
  } = params;

  const run = async () => {
    try {
      if (result.success && result.status === 'success') {
        showPaymentStatusBar(i18n.t('payment.successBanner'), 'success');
        await onReload?.();
        await onBeforeSuccessAlert?.();
        alertSuccess();
        return;
      }
      if (result.success && result.status === 'failed') {
        showPaymentStatusBar(i18n.t('payment.failedBanner'), 'error');
        await onReload?.();
        alertFailed();
        return;
      }
      if (result.success && result.status === 'cancelled') {
        showPaymentStatusBar(i18n.t('payment.cancelledBanner'), 'warning');
        await onReload?.();
        alertFailed();
        return;
      }
      if (result.success && result.status === 'pending') {
        showPaymentStatusBar(i18n.t('payment.pendingBanner'), 'info');
        await onReload?.();
        if (result.pendingLong) {
          Alert.alert(i18n.t('payment.pendingTitle'), i18n.t('payment.stillProcessing'), [
            { text: i18n.t('common.ok'), style: 'cancel', onPress: () => onPendingOk?.() },
            {
              text: i18n.t('payment.checkAgain'),
              onPress: () => {
                void (async () => {
                  const r2 = await recheckPaymentUntilFinal(transactionId);
                  presentPaymentPollOutcome({ ...params, result: r2 });
                })();
              },
            },
          ]);
        } else {
          Alert.alert(i18n.t('payment.pendingTitle'), i18n.t('payment.pendingMessage'), [
            { text: i18n.t('common.ok'), onPress: () => onPendingOk?.() },
          ]);
        }
        return;
      }
      if (!result.success) {
        showPaymentStatusBar(networkErrorMessage(result.error), 'error');
        await onReload?.();
        alertNetworkError(networkErrorMessage(result.error));
        return;
      }
      await onReload?.();
      alertFallbackError();
    } catch {
      alertNetworkError(i18n.t('errors.serverUnavailable'));
    }
  };

  void run();
}
