import { useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

type LifecyclePhase = 'mount' | 'unmount' | 'effect' | 'update';

/**
 * Логирует монтирование, размонтирование и запуски useEffect — удобно для поиска крашей на iOS.
 *
 * @example
 * useLifecycleLog('SplashScreen');
 * useLifecycleLog('TourBooking', { deps: [tourId], label: 'loadTour' });
 */
export function useLifecycleLog(
  componentName: string,
  options?: {
    /** Имя конкретного effect (если несколько хуков на экране) */
    label?: string;
    /** Зависимости effect — при изменении логируется повторный запуск */
    deps?: readonly unknown[];
    /** Доп. контекст в лог */
    context?: Record<string, unknown>;
  },
): void {
  const mountedRef = useRef(false);
  const depsKey = options?.deps ? JSON.stringify(options.deps) : undefined;

  useEffect(() => {
    const phase: LifecyclePhase = mountedRef.current ? 'update' : 'mount';
    mountedRef.current = true;
    logger.lifecycle(`${componentName}${options?.label ? `:${options.label}` : ''} → ${phase}`, {
      ...options?.context,
      deps: depsKey,
    });

    return () => {
      logger.lifecycle(`${componentName}${options?.label ? `:${options.label}` : ''} → unmount`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depsKey отражает options.deps
  }, [componentName, options?.label, depsKey]);

  useEffect(() => {
    if (!options?.label) return;
    logger.lifecycle(`${componentName}:${options.label} → effect run`, {
      ...options?.context,
      deps: depsKey,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentName, options?.label, depsKey]);
}
