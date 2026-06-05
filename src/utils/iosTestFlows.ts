import { logger } from './logger';

/** Шаги чек-листа iOS-тестирования — ищите в Xcode по префиксу `[iOS Test]` */
export const IosTestStep = {
  LAUNCH: '1_launch',
  AUTH: '2_auth',
  TOUR_SEARCH: '3_tour_search',
  TOUR_CARD: '4_tour_card',
  BOOKING: '5_booking',
  PAYMENT: '6_payment',
  BROWSER_RETURN: '7_browser_return',
  NOTIFICATIONS: '8_notifications',
} as const;

export type IosTestStepId = (typeof IosTestStep)[keyof typeof IosTestStep];

export function logIosTestStep(step: IosTestStepId, detail?: Record<string, unknown>): void {
  logger.info(`[iOS Test] ${step}`, detail);
}
