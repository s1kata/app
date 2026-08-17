/**
 * Единые контакты службы поддержки (приложение, mailto, tel).
 * NAP: Самара (как на сайте и в CRM-боте).
 */
export const SUPPORT_EMAIL = 'hello@travelhub63.ru';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
/** E.164 без пробелов — для Linking.openURL('tel:...') */
export const SUPPORT_PHONE_E164 = '+78462541656';
export const SUPPORT_PHONE_TEL = `tel:${SUPPORT_PHONE_E164}`;
/** Отображение в UI */
export const SUPPORT_PHONE_DISPLAY = '+7 (846) 254-16-56';

/** Офис */
export const SUPPORT_OFFICE_ADDRESS = 'Самара, Московское шоссе, 81Б, ТЦ «Парк Хаус»';

/** @deprecated используйте экран HelperChat в приложении */
export const SUPPORT_CHAT_PLACEHOLDER_URL = 'https://travelhub63.ru/support-chat';

/** Официальный сайт */
export const SUPPORT_WEBSITE_URL = 'https://travelhub63.ru';
/** Условия использования */
export const TERMS_URL = 'https://travelhub63.ru/terms.html';

/**
 * Открыть чат: предпочтительно навигация на HelperChat (caller).
 * Fallback — mailto.
 */
export async function openSupportChat(
  openUrl: (url: string) => Promise<unknown>,
): Promise<void> {
  try {
    await openUrl(SUPPORT_MAILTO);
  } catch {
    /* caller shows error if needed */
  }
}
