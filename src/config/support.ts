/**
 * Единые контакты службы поддержки (приложение, mailto, tel).
 */
export const SUPPORT_EMAIL = 'hello@travelhub63.ru';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
/** E.164 без пробелов — для Linking.openURL('tel:...') */
export const SUPPORT_PHONE_E164 = '+74956603666';
export const SUPPORT_PHONE_TEL = `tel:${SUPPORT_PHONE_E164}`;
/** Отображение в UI */
export const SUPPORT_PHONE_DISPLAY = '+7 (495) 660-36-66';

/** Чат поддержки в Telegram */
export const SUPPORT_TELEGRAM_USERNAME = 'travelhub63';
export const SUPPORT_TELEGRAM_URL = `https://t.me/${SUPPORT_TELEGRAM_USERNAME}`;

/** Официальный сайт */
export const SUPPORT_WEBSITE_URL = 'https://travelhub63.ru';
/** Условия использования */
export const TERMS_URL = 'https://travelhub63.ru/terms.html';

/**
 * Открыть чат поддержки: Telegram, при неудаче — email.
 * @param openUrl обычно Linking.openURL
 */
export async function openSupportChat(
  openUrl: (url: string) => Promise<unknown>,
): Promise<void> {
  try {
    await openUrl(SUPPORT_TELEGRAM_URL);
  } catch {
    try {
      await openUrl(SUPPORT_MAILTO);
    } catch {
      /* игнорируем — вызывающий код покажет ошибку при необходимости */
    }
  }
}
