/**
 * Календарь диапазона дат — простой и предсказуемый.
 * Без тяжёлых анимаций и без сброса месяца при ре-рендере родителя.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { radius, spacing, typography } from '../config/designSystem';
import {
  addMonths,
  formatMonthYear,
  formatRuShort,
  monthIndex,
  parseYmd,
  startOfDay,
  toYmd,
} from '../utils/dateYmd';

export interface DateRangeCalendarProps {
  onDateRangeSelect: (dateFrom: string, dateTo: string) => void;
  onClose?: () => void;
  initialDateFrom?: string;
  initialDateTo?: string;
  minDate?: Date;
  maxDate?: Date;
  singleDateMode?: boolean;
  /** inline — в wizard; sheet — полноэкранная модалка */
  variant?: 'inline' | 'sheet';
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

function buildMonthCells(viewMonth: Date): Array<Date | null> {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
  return cells;
}

export default function DateRangeCalendar({
  onDateRangeSelect,
  onClose,
  initialDateFrom,
  initialDateTo,
  minDate,
  maxDate,
  singleDateMode = false,
  variant = 'inline',
}: DateRangeCalendarProps) {
  const { theme } = useAppContext();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cellSize = Math.floor((Math.min(width, 420) - spacing.md * 2) / 7);

  const today = useMemo(() => startOfDay(minDate ?? new Date()), []);
  const minYmd = toYmd(today);
  const maxBound = useMemo(() => {
    if (maxDate) return startOfDay(maxDate);
    return addMonths(today, 18);
  }, [maxDate, today]);

  const initialMonth = useMemo(() => {
    if (initialDateFrom) {
      const d = parseYmd(initialDateFrom);
      if (d >= today) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }, []);

  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [startYmd, setStartYmd] = useState<string | null>(initialDateFrom ?? null);
  const [endYmd, setEndYmd] = useState<string | null>(initialDateTo ?? null);

  const minMonthIdx = monthIndex(new Date(today.getFullYear(), today.getMonth(), 1));
  const maxMonthIdx = monthIndex(new Date(maxBound.getFullYear(), maxBound.getMonth(), 1));
  const viewMonthIdx = monthIndex(viewMonth);

  const canGoPrev = viewMonthIdx > minMonthIdx;
  const canGoNext = viewMonthIdx < maxMonthIdx;

  const cells = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);

  const isDisabled = useCallback(
    (ymd: string) => {
      if (ymd < minYmd) return true;
      if (maxDate) {
        const d = parseYmd(ymd);
        if (d > startOfDay(maxDate)) return true;
      }
      return false;
    },
    [minYmd, maxDate],
  );

  const inRange = useCallback(
    (ymd: string) => {
      if (!startYmd || !endYmd) return ymd === startYmd;
      return ymd >= startYmd && ymd <= endYmd;
    },
    [startYmd, endYmd],
  );

  const onDayPress = (ymd: string) => {
    if (isDisabled(ymd)) return;

    if (singleDateMode) {
      setStartYmd(ymd);
      setEndYmd(ymd);
      onDateRangeSelect(ymd, ymd);
      onClose?.();
      return;
    }

    if (!startYmd || (startYmd && endYmd)) {
      setStartYmd(ymd);
      setEndYmd(null);
      return;
    }

    let from = startYmd;
    let to = ymd;
    if (to < from) {
      from = ymd;
      to = startYmd;
    }
    setStartYmd(from);
    setEndYmd(to);
    onDateRangeSelect(from, to);
  };

  const onApply = () => {
    if (startYmd && endYmd) {
      onDateRangeSelect(startYmd, endYmd);
      onClose?.();
    }
  };

  const onClear = () => {
    setStartYmd(null);
    setEndYmd(null);
  };

  const rangeHint =
    !startYmd
      ? i18n.t('calendar.selectCheckIn')
      : !endYmd
        ? i18n.t('calendar.selectCheckOut')
        : `${formatRuShort(startYmd)} — ${formatRuShort(endYmd)}`;

  return (
    <View
      style={[
        styles.root,
        variant === 'sheet' && { paddingBottom: Math.max(insets.bottom, spacing.md) },
        { backgroundColor: theme.card },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => canGoPrev && setViewMonth((m) => addMonths(m, -1))}
          disabled={!canGoPrev}
          style={styles.navBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={canGoPrev ? theme.primary : theme.border} />
        </TouchableOpacity>
        <Text style={[styles.monthTitle, { color: theme.text }]}>{formatMonthYear(viewMonth)}</Text>
        <TouchableOpacity
          onPress={() => canGoNext && setViewMonth((m) => addMonths(m, 1))}
          disabled={!canGoNext}
          style={styles.navBtn}
          hitSlop={8}
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={canGoNext ? theme.primary : theme.border}
          />
        </TouchableOpacity>
      </View>

      <Text style={[styles.hint, { color: theme.primary }]}>{rangeHint}</Text>

      {/* Weekday labels */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={[styles.cell, { width: cellSize }]}>
            <Text style={[styles.weekLabel, { color: theme.secondaryText }]}>{w}</Text>
          </View>
        ))}
      </View>

      {/* Grid */}
      <ScrollView
        style={[styles.gridScroll, variant === 'inline' && styles.gridScrollInline]}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <View style={styles.grid}>
          {cells.map((date, idx) => {
            if (!date) {
              return <View key={`e-${idx}`} style={[styles.cell, { width: cellSize, height: cellSize }]} />;
            }
            const ymd = toYmd(date);
            const disabled = isDisabled(ymd);
            const selected = ymd === startYmd || ymd === endYmd;
            const ranged = inRange(ymd);
            const isToday = ymd === minYmd;

            return (
              <TouchableOpacity
                key={ymd}
                style={[
                  styles.cell,
                  { width: cellSize, height: cellSize },
                  ranged && !selected && { backgroundColor: `${theme.primary}18` },
                  selected && { backgroundColor: theme.primary, borderRadius: radius.md },
                ]}
                onPress={() => onDayPress(ymd)}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayNum,
                    {
                      color: selected
                        ? '#fff'
                        : disabled
                          ? theme.tertiaryText
                          : isToday
                            ? theme.primary
                            : theme.text,
                      fontWeight: isToday || selected ? '700' : '500',
                    },
                  ]}
                >
                  {date.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer: sheet keeps Apply; inline relies on parent wizard «Далее» (dates already sync on select). */}
      {!singleDateMode && variant === 'sheet' ? (
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <View style={styles.dateSummary}>
            <View style={styles.dateCol}>
              <Text style={[styles.dateLabel, { color: theme.secondaryText }]}>
                {i18n.t('calendar.checkInDate')}
              </Text>
              <Text style={[styles.dateValue, { color: startYmd ? theme.text : theme.tertiaryText }]}>
                {startYmd ? formatRuShort(startYmd) : i18n.t('calendar.notSelected')}
              </Text>
            </View>
            <View style={[styles.dateDivider, { backgroundColor: theme.border }]} />
            <View style={styles.dateCol}>
              <Text style={[styles.dateLabel, { color: theme.secondaryText }]}>
                {i18n.t('calendar.checkOutDate')}
              </Text>
              <Text style={[styles.dateValue, { color: endYmd ? theme.text : theme.tertiaryText }]}>
                {endYmd ? formatRuShort(endYmd) : i18n.t('calendar.notSelected')}
              </Text>
            </View>
          </View>

          {startYmd && endYmd ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btnSecondary, { backgroundColor: theme.secondaryBackground }]}
                onPress={onClear}
              >
                <Text style={[styles.btnSecondaryText, { color: theme.text }]}>
                  {i18n.t('calendar.clear')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
                onPress={onApply}
              >
                <Text style={[styles.btnPrimaryText, { color: theme.surface }]}>
                  {i18n.t('calendar.apply')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    ...typography.bodyBold,
    fontSize: 17,
  },
  hint: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  weekLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  gridScroll: {
    maxHeight: 320,
  },
  /** Keep wizard «Далее» on-screen under bottom tabs (OPPO ~1440h). */
  gridScrollInline: {
    maxHeight: 220,
  },
  gridContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 15,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  dateSummary: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dateCol: { flex: 1 },
  dateLabel: { fontSize: 11, marginBottom: 2 },
  dateValue: { fontSize: 14, fontWeight: '700' },
  dateDivider: { width: 1, marginVertical: 2 },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  btnSecondaryText: { fontSize: 15, fontWeight: '600' },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  btnPrimaryText: { fontSize: 15, fontWeight: '700' },
});
