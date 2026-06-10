import type { CrmQueueTask, CrmBookingQueuePayload } from '../../types/crmQueue';
import { generateUuidV4 } from '../../utils/uuid';
import { logger } from '../../utils/logger';
import { networkService } from '../NetworkService';
import { sotaCrmService } from '../SotaCrmService';
import { getCrmBackendBaseUrl, submitBookingToBackend } from './CrmBackendClient';
import { loadQueueFromStorage, saveQueueToStorage } from './CrmOutboundQueueStore';
import { classifyCrmErrorMessage } from './CrmApiErrors';

const MAX_QUEUE_RETRIES = 5;
const BASE_BACKOFF_MS = 1500;

/** Ответ прокси без маршрута / неверный метод — имеет смысл пробовать прямой U-ON при наличии ключа в приложении. */
function isCrmProxyRouteMissing(error?: string): boolean {
  const e = (error || '').trim();
  return /^HTTP 404$/i.test(e) || /^HTTP 405$/i.test(e) || /\b404\b/.test(e);
}

function isCrmAuthError(error?: string): boolean {
  const e = (error || '').toLowerCase();
  return (
    e.includes('invalid or expired auth token') ||
    e.includes('unauthorized') ||
    e.includes('требуется авторизация') ||
    /^http 401$/i.test(e.trim())
  );
}

export type PersistAfterCrmHandler = (
  payload: CrmBookingQueuePayload,
  crmRequestId: string,
  idempotencyKey: string,
) => Promise<{ firestoreBookingId: string }>;

/**
 * Очередь исходящих операций в CRM (U-ON).
 * — Персистентность: AsyncStorage (аналог localStorage в RN).
 * — Последовательная обработка (одна задача за раз).
 * — Retry с экспоненциальной задержкой на уровне очереди (поверх retry внутри SotaCrmService).
 * — Idempotency: один idempotencyKey → один r_id_internal в CRM.
 */
class CrmOutboundQueue {
  private tasks: CrmQueueTask[] = [];
  private persistHandler: PersistAfterCrmHandler | null = null;
  private drainPromise: Promise<void> | null = null;
  private started = false;
  /** Цепочка промисов — все CRM-операции строго последовательны (нет гонок и двойной отправки). */
  private serialTail: Promise<void> = Promise.resolve();

  private enqueueSerial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.serialTail.then(() => fn());
    this.serialTail = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  setPersistHandler(handler: PersistAfterCrmHandler): void {
    this.persistHandler = handler;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.tasks = await loadQueueFromStorage();
    networkService.subscribe(() => {
      if (networkService.isOnline) {
        void this.drain();
      }
    });
    if (networkService.isOnline) {
      void this.drain();
    }
  }

  /**
   * Добавить создание заявки в очередь (идемпотентный ключ генерируется снаружи или здесь).
   */
  async enqueue(payload: CrmBookingQueuePayload, idempotencyKey?: string): Promise<CrmQueueTask> {
    const key = idempotencyKey || generateUuidV4();
    const now = Date.now();
    const task: CrmQueueTask = {
      id: generateUuidV4(),
      type: 'CREATE_APPLICATION',
      idempotencyKey: key,
      status: 'pending',
      retries: 0,
      createdAt: now,
      updatedAt: now,
      payload,
    };
    this.tasks.push(task);
    await saveQueueToStorage(this.tasks);
    logger.log(`[CrmQueue] enqueued task ${task.id} idempotency=${key}`);
    return task;
  }

  /**
   * Обработать одну задачу до конца (CRM → Firestore). Вызывается из BookingService при онлайне.
   */
  processTaskNow(taskId: string): Promise<{
    ok: boolean;
    firestoreBookingId?: string;
    error?: string;
    queuedOffline?: boolean;
  }> {
    return this.enqueueSerial(async () => {
      await this.ensureLoaded();
      const task = this.tasks.find((t) => t.id === taskId);
      if (!task) {
        return { ok: false, error: 'Задача не найдена' };
      }
      if (!networkService.isOnline) {
        return { ok: false, queuedOffline: true, error: 'Нет сети' };
      }
      return this.runSingleTask(task);
    });
  }

  /** Фоновая обработка всех pending (после восстановления сети / старта приложения) */
  async drain(): Promise<void> {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = this.enqueueSerial(async () => {
      try {
        await this.ensureLoaded();
        if (!networkService.isOnline) return;
        const pending = this.tasks.filter((t) => t.status === 'pending' || t.status === 'processing');
        for (const t of pending) {
          if (t.status === 'processing') {
            t.status = 'pending';
            await saveQueueToStorage(this.tasks);
          }
          await this.runSingleTask(t);
        }
      } finally {
        this.drainPromise = null;
      }
    });
    return this.drainPromise;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.tasks.length === 0) {
      this.tasks = await loadQueueFromStorage();
    }
  }

  private async runSingleTask(task: CrmQueueTask): Promise<{
    ok: boolean;
    firestoreBookingId?: string;
    error?: string;
    queuedOffline?: boolean;
  }> {
    if (!this.persistHandler) {
      logger.error('[CrmQueue] persistHandler not set');
      return { ok: false, error: 'Внутренняя ошибка: не настроено сохранение' };
    }

    const p = task.payload;
    while (task.retries < MAX_QUEUE_RETRIES) {
      if (!networkService.isOnline) {
        task.status = 'pending';
        task.updatedAt = Date.now();
        await saveQueueToStorage(this.tasks);
        return { ok: false, queuedOffline: true, error: 'Нет сети' };
      }

      task.status = 'processing';
      task.updatedAt = Date.now();
      await saveQueueToStorage(this.tasks);

      const backendBase = getCrmBackendBaseUrl();
      const directPayload = {
        idempotencyKey: task.idempotencyKey,
        userId: p.userId,
        tourId: p.tourId,
        hotelId: p.hotelId,
        type: p.type,
        departureCity: p.departureCity,
        startDate: p.startDate,
        endDate: p.endDate,
        nights: p.nights,
        totalPrice: p.totalPrice,
        currency: p.currency,
        participants: p.participants,
        party: p.party,
        tourOperator: p.tourOperator ?? undefined,
        contactInfo: p.contactInfo,
        specialRequests: p.specialRequests ?? undefined,
        tourSnapshot: p.tourSnapshot ?? undefined,
        paymentStatus: 'pending' as const,
      };

      let crm = backendBase
        ? await submitBookingToBackend(task.idempotencyKey, p)
        : await sotaCrmService.sendBookingToCrm(directPayload);

      if (!crm.success && backendBase && isCrmProxyRouteMissing(crm.error)) {
        logger.warn(
          `[CrmQueue] Прокси CRM (${backendBase}) вернул «${crm.error}» — пробуем прямую отправку в U-ON (если задан ключ в приложении)`,
        );
        crm = await sotaCrmService.sendBookingToCrm(directPayload);
      }

      if (!crm.success && backendBase && isCrmAuthError(crm.error)) {
        logger.error(
          `[CrmQueue] CRM отклонил токен (${crm.error}). На сервере должен быть JWT auth-mobile, не Firebase.`,
        );
      }

      if (crm.success && crm.data?.id) {
        try {
          const { firestoreBookingId } = await this.persistHandler(p, String(crm.data.id), task.idempotencyKey);
          this.tasks = this.tasks.filter((t) => t.id !== task.id);
          await saveQueueToStorage(this.tasks);
          logger.info(`[CrmQueue] task ${task.id} → CRM OK, Firestore ${firestoreBookingId}`);
          return { ok: true, firestoreBookingId };
        } catch (e: any) {
          task.lastError = e?.message || 'Firestore error';
          task.retries += 1;
          task.status = 'pending';
          task.updatedAt = Date.now();
          await saveQueueToStorage(this.tasks);
          logger.error('[CrmQueue] persist after CRM failed:', e);
          const delay = BASE_BACKOFF_MS * Math.pow(2, task.retries - 1);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      const errMsg = crm.error || 'Ошибка CRM';
      const classified = classifyCrmErrorMessage(errMsg);
      task.lastError = errMsg;
      task.retries += 1;
      task.status = task.retries >= MAX_QUEUE_RETRIES ? 'failed' : 'pending';
      task.updatedAt = Date.now();
      await saveQueueToStorage(this.tasks);

      if (!classified.retryable || task.status === 'failed') {
        logger.warn(`[CrmQueue] task ${task.id} failed: ${errMsg}`);
        return { ok: false, error: errMsg };
      }

      const delay = BASE_BACKOFF_MS * Math.pow(2, task.retries - 1);
      logger.debug(`[CrmQueue] retry ${task.retries}/${MAX_QUEUE_RETRIES} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }

    return { ok: false, error: task.lastError || 'Превышено число попыток' };
  }

  getPendingCount(): number {
    return this.tasks.filter((t) => t.status === 'pending' || t.status === 'processing').length;
  }
}

export const crmOutboundQueue = new CrmOutboundQueue();
