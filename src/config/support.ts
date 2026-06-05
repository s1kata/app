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
