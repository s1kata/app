/**
 * Bottom-sheet редактирование параметров поиска на экране результатов
 * (как Booking / концепт 09) — без ухода в wizard.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { dictionaryService } from '../services/DictionaryService';
import type { TourSearchParams, Departure, Country, Meal } from '../types/tourvisor';
import { filterMealsForUi, sanitizeTourMealParam } from '../utils/tourvisorMeals';
import { radius, spacing, typography } from '../config/designSystem';
import { filterExcludedDestinationCountries } from '../config/homeDestinations';
import PrimaryButton from './ui/PrimaryButton';

type Props = {
  visible: boolean;
  initial: TourSearchParams;
  onClose: () => void;
  onApply: (next: TourSearchParams) => void;
};

const NIGHT_PRESETS = [
  { from: 5, to: 7, label: '5–7' },
  { from: 7, to: 10, label: '7–10' },
  { from: 7, to: 11, label: '7–11' },
  { from: 7, to: 14, label: '7–14' },
  { from: 10, to: 14, label: '10–14' },
  { from: 14, to: 21, label: '14–21' },
];

function addDaysYmd(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function EditSearchSheet({ visible, initial, onClose, onApply }: Props) {
  const { theme } = useAppContext();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<TourSearchParams>(initial);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loadingDict, setLoadingDict] = useState(false);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [section, setSection] = useState<'main' | 'departure' | 'country' | 'meal'>('main');

  useEffect(() => {
    if (!visible) return;
    setDraft(initial);
    setSection('main');
  }, [visible, initial]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoadingDict(true);
      try {
        const [deps, mealsRaw] = await Promise.all([
          dictionaryService.getDepartures(),
          dictionaryService.getMeals(),
        ]);
        if (cancelled) return;
        setDepartures(deps || []);
        setMeals(filterMealsForUi(mealsRaw || []));
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingDict(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setCountries([]);
      setCountriesLoading(false);
      return;
    }
    const depId = draft.departureId;
    if (depId == null) {
      setCountries([]);
      return;
    }
    let cancelled = false;
    setCountriesLoading(true);
    dictionaryService
      .getCountries(depId)
      .then((list) => {
        if (cancelled) return;
        const next = filterExcludedDestinationCountries(list || []);
        setCountries(next);
        setDraft((prev) => {
          if (prev.countryId != null && !next.some((c) => c.id === prev.countryId)) {
            const cleaned = { ...prev };
            delete cleaned.countryId;
            return cleaned;
          }
          return prev;
        });
      })
      .catch(() => {
        if (!cancelled) setCountries([]);
      })
      .finally(() => {
        if (!cancelled) setCountriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, draft.departureId]);

  const setField = useCallback(<K extends keyof TourSearchParams>(key: K, value: TourSearchParams[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const pickDeparture = (departureId: number) => {
    setDraft((prev) => {
      const next = { ...prev, departureId };
      if (prev.departureId !== departureId) {
        delete next.countryId;
      }
      return next;
    });
    setSection('main');
  };

  const openCountrySection = () => {
    if (!draft.departureId) {
      setSection('departure');
      return;
    }
    setSection('country');
  };

  const shiftNear = () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    setDraft((prev) => ({
      ...prev,
      dateFrom: addDaysYmd(today, 7),
      dateTo: addDaysYmd(today, 21),
      nightsFrom: prev.nightsFrom || 7,
      nightsTo: prev.nightsTo || 11,
    }));
  };

  const depName = departures.find((d) => d.id === draft.departureId)?.name || '—';
  const countryName = countries.find((c) => c.id === draft.countryId)?.name || '—';
  const mealLabel = (() => {
    if (!draft.meal) return i18n.t('search.anyMeal');
    const m = meals.find((x) => x.id === draft.meal);
    return m ? m.russianName || m.fullRussianName || m.name : i18n.t('search.anyMeal');
  })();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropPress} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.card,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.text }]}>{i18n.t('search.edit')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          {loadingDict && section === 'main' ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={theme.primary} />
          ) : section === 'main' ? (
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Row
                theme={theme}
                icon="airplane-outline"
                label={i18n.t('search.selectCity')}
                value={depName}
                onPress={() => setSection('departure')}
              />
              <Row
                theme={theme}
                icon="flag-outline"
                label={i18n.t('search.selectCountry')}
                value={countryName}
                onPress={openCountrySection}
              />
              <View style={[styles.row, { borderBottomColor: theme.border }]}>
                <Ionicons name="calendar-outline" size={20} color={theme.primary} />
                <View style={styles.rowBody}>
                  <Text style={[styles.rowLabel, { color: theme.secondaryText }]}>
                    {i18n.t('search.wizardStepWhen')}
                  </Text>
                  <View style={styles.dateRow}>
                    <TextInput
                      style={[styles.dateInput, { color: theme.text, borderColor: theme.border }]}
                      value={draft.dateFrom || ''}
                      onChangeText={(t) => setField('dateFrom', t)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.secondaryText}
                    />
                    <Text style={{ color: theme.secondaryText }}>→</Text>
                    <TextInput
                      style={[styles.dateInput, { color: theme.text, borderColor: theme.border }]}
                      value={draft.dateTo || ''}
                      onChangeText={(t) => setField('dateTo', t)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.secondaryText}
                    />
                  </View>
                  <TouchableOpacity onPress={shiftNear} style={{ marginTop: 8 }}>
                    <Text style={{ color: theme.primary, fontWeight: '600' }}>
                      {i18n.t('search.shiftNear')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[styles.sectionLabel, { color: theme.secondaryText }]}>
                {i18n.t('search.nightsCount')}
              </Text>
              <View style={styles.chips}>
                {NIGHT_PRESETS.map((p) => {
                  const selected = draft.nightsFrom === p.from && draft.nightsTo === p.to;
                  return (
                    <TouchableOpacity
                      key={p.label}
                      onPress={() => {
                        setField('nightsFrom', p.from);
                        setField('nightsTo', p.to);
                      }}
                      style={[
                        styles.chip,
                        {
                          borderColor: selected ? theme.primary : theme.border,
                          backgroundColor: selected ? `${theme.primary}18` : theme.secondaryBackground,
                        },
                      ]}
                    >
                      <Text style={{ color: selected ? theme.primary : theme.text, fontWeight: '600' }}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.row, { borderBottomColor: theme.border }]}>
                <Ionicons name="people-outline" size={20} color={theme.primary} />
                <View style={styles.rowBody}>
                  <Text style={[styles.rowLabel, { color: theme.secondaryText }]}>
                    {i18n.t('search.wizardStepTourists')}
                  </Text>
                  <View style={styles.adultsRow}>
                    <TouchableOpacity
                      onPress={() => setField('adults', Math.max(1, (draft.adults || 2) - 1))}
                      style={[styles.stepper, { backgroundColor: theme.secondaryBackground }]}
                    >
                      <Text style={{ color: theme.text, fontSize: 18 }}>−</Text>
                    </TouchableOpacity>
                    <Text style={[styles.adultsVal, { color: theme.text }]}>{draft.adults || 2}</Text>
                    <TouchableOpacity
                      onPress={() => setField('adults', Math.min(6, (draft.adults || 2) + 1))}
                      style={[styles.stepper, { backgroundColor: theme.secondaryBackground }]}
                    >
                      <Text style={{ color: theme.text, fontSize: 18 }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <Row
                theme={theme}
                icon="restaurant-outline"
                label={i18n.t('search.selectMeal')}
                value={mealLabel}
                onPress={() => setSection('meal')}
              />
            </ScrollView>
          ) : section === 'departure' ? (
            <ListPick
              theme={theme}
              items={departures.map((d) => ({ id: d.id, label: d.name }))}
              selectedId={draft.departureId}
              onPick={pickDeparture}
              onBack={() => setSection('main')}
            />
          ) : section === 'country' ? (
            <ListPick
              theme={theme}
              items={countries.map((c) => ({ id: c.id, label: c.name }))}
              selectedId={draft.countryId}
              loading={countriesLoading}
              emptyLabel={
                draft.departureId
                  ? 'Нет направлений для этого города вылета'
                  : 'Сначала выберите город вылета'
              }
              onPick={(id) => {
                setField('countryId', id);
                setSection('main');
              }}
              onBack={() => setSection('main')}
            />
          ) : (
            <ListPick
              theme={theme}
              items={[
                { id: 0, label: i18n.t('search.anyMeal') },
                ...meals.map((m) => ({
                  id: m.id,
                  label: m.russianName || m.fullRussianName || m.name,
                })),
              ]}
              selectedId={draft.meal || 0}
              onPick={(id) => {
                if (id === 0) {
                  const next = { ...draft };
                  delete next.meal;
                  setDraft(next);
                } else {
                  const valid = sanitizeTourMealParam(id);
                  if (valid !== undefined) setField('meal', valid);
                }
                setSection('main');
              }}
              onBack={() => setSection('main')}
            />
          )}

          {section === 'main' ? (
            <PrimaryButton
              title={i18n.t('calendar.apply')}
              onPress={() => onApply(draft)}
              variant="cta"
              style={{ marginTop: 12 }}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Row({
  theme,
  icon,
  label,
  value,
  onPress,
}: {
  theme: any;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={20} color={theme.primary} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, { color: theme.secondaryText }]}>{label}</Text>
        <Text style={[styles.rowValue, { color: theme.text }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.secondaryText} />
    </TouchableOpacity>
  );
}

function ListPick({
  theme,
  items,
  selectedId,
  loading,
  emptyLabel,
  onPick,
  onBack,
}: {
  theme: any;
  items: Array<{ id: number; label: string }>;
  selectedId?: number;
  loading?: boolean;
  emptyLabel?: string;
  onPick: (id: number) => void;
  onBack: () => void;
}) {
  return (
    <View>
      <TouchableOpacity onPress={onBack} style={styles.backLink}>
        <Ionicons name="arrow-back" size={20} color={theme.primary} />
        <Text style={{ color: theme.primary, marginLeft: 6, fontWeight: '600' }}>
          {i18n.t('common.back')}
        </Text>
      </TouchableOpacity>
      <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color={theme.primary} />
        ) : items.length === 0 ? (
          <Text style={{ color: theme.secondaryText, textAlign: 'center', paddingVertical: 24 }}>
            {emptyLabel || 'Список пуст'}
          </Text>
        ) : null}
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.listItem, { borderBottomColor: theme.border }]}
            onPress={() => onPick(item.id)}
          >
            <Text style={{ color: theme.text, flex: 1 }}>{item.label}</Text>
            {selectedId === item.id ? (
              <Ionicons name="checkmark" size={20} color={theme.primary} />
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(18,18,46,0.45)',
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '88%',
    width: '100%',
    zIndex: 2,
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    ...typography.h3,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 12, marginBottom: 2 },
  rowValue: { fontSize: 16, fontWeight: '600' },
  sectionLabel: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  adultsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  stepper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adultsVal: { fontSize: 18, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
