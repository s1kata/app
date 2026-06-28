/** Понятные сообщения для пользователя по HTTP-статусам Tourvisor proxy. */
export function mapTourvisorHttpError(status: number, body: string): string {
  const lower = body.toLowerCase();

  if (status === 400) {
    if (lower.includes('meal')) {
      return 'Неверный фильтр питания. Выберите другой тип или «Любое».';
    }
    return 'Неверные параметры поиска. Измените фильтры и повторите.';
  }
  if (status === 401) {
    return 'Сервис временно недоступен. Попробуйте позже.';
  }
  if (status === 404) {
    return 'Туры не найдены. Попробуйте другие параметры.';
  }
  if (status >= 500) {
    return 'Сервис временно недоступен. Попробуйте позже.';
  }
  return 'Не удалось выполнить запрос. Проверьте интернет.';
}
