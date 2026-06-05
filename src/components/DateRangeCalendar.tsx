import React, { useState, useEffect, useMemo, memo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBottomSafeInset } from '../utils/safeAreaInsets';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';

interface DateRangeCalendarProps {
  onDateRangeSelect: (dateFrom: string, dateTo: string) => void;
  onClose?: () => void;
  initialDateFrom?: string;
  initialDateTo?: string;
  minDate?: Date;
  maxDate?: Date;
}

const DateRangeCalendar = memo(function DateRangeCalendar({
  onDateRangeSelect,
  onClose,
  initialDateFrom,
  initialDateTo,
  minDate,
  maxDate,
}: DateRangeCalendarProps) {
  const { theme, themeMode, isDark } = useAppContext();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const safeBottom = getBottomSafeInset(insets, 8);
  // Высота sticky-нижней панели, чтобы контент ScrollView не перекрывался.
  const [bottomBarHeight, setBottomBarHeight] = useState(140);
  // 7 колонок календаря с внутренним padding контейнера `monthContainer` (16px с каждой стороны).
  const calendarCellWidth = Math.max((windowWidth - 32) / 7, 28);
  
  // Функция для форматирования даты в YYYY-MM-DD без учета временных зон
  const formatDateToString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Всегда используем текущую дату - полностью динамический календарь
  const getToday = () => {
    return minDate || new Date(); // Всегда актуальная дата
  };
  
  const [selectedStartDate, setSelectedStartDate] = useState<string | null>(initialDateFrom || null);
  const [selectedEndDate, setSelectedEndDate] = useState<string | null>(initialDateTo || null);
  const today = getToday();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth()));
  const [selectingStart, setSelectingStart] = useState(true);
  
  // Анимации для плавного выбора
  const startDateAnim = useRef(new Animated.Value(selectedStartDate ? 1 : 0)).current;
  const endDateAnim = useRef(new Animated.Value(selectedEndDate ? 1 : 0)).current;
  const rangeAnim = useRef(new Animated.Value((selectedStartDate && selectedEndDate) ? 1 : 0)).current;

  // Оптимизация: генерируем даты для быстрого открытия
  const [visibleMonths, setVisibleMonths] = useState(12); // Начинаем с 12 месяцев
  
  const dates = useMemo(() => {
    const datesArray: Date[] = [];
    const todayDate = getToday();
    todayDate.setHours(0, 0, 0, 0);
    
    // Генерируем даты для видимых месяцев
    const startMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const maxMonths = Math.min(visibleMonths, 12); // Начинаем с 12 месяцев
    
    for (let monthOffset = 0; monthOffset < maxMonths; monthOffset++) {
      const monthDate = new Date(startMonth.getFullYear(), startMonth.getMonth() + monthOffset, 1);
      const lastDay = new Date(startMonth.getFullYear(), startMonth.getMonth() + monthOffset + 1, 0).getDate();
      
      for (let day = 1; day <= lastDay; day++) {
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
        date.setHours(0, 0, 0, 0);
        // Показываем только будущие даты (включая сегодня)
        if (date >= todayDate) {
          datesArray.push(date);
        }
      }
    }
    
    return datesArray;
  }, [currentMonth, minDate, visibleMonths]);
  
  // Увеличиваем количество видимых месяцев при прокрутке (ленивая загрузка)
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollPercentage = (contentOffset.y + layoutMeasurement.height) / contentSize.height;
    
    // Если прокрутили больше 70%, загружаем еще месяцы
    if (scrollPercentage > 0.7 && visibleMonths < 24) {
      setVisibleMonths(prev => Math.min(prev + 6, 24));
    }
  };

  const handleDatePress = (date: Date) => {
    const dateStr = formatDateToString(date);
    
    // Плавная логика выбора с немедленным обновлением состояния
    if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
      // Начинаем новый выбор - сбрасываем и выбираем начальную дату
      setSelectedStartDate(dateStr);
      setSelectedEndDate(null);
      setSelectingStart(false);
      
      // Плавная анимация выбора начальной даты
      Animated.parallel([
        Animated.spring(startDateAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        Animated.spring(endDateAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        Animated.spring(rangeAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
      ]).start();
      
      // Не вызываем callback при выборе только начальной даты
      // Callback будет вызван только когда обе даты выбраны
    } else if (selectedStartDate && !selectedEndDate) {
      // Выбираем конечную дату
      let finalStartDate = selectedStartDate;
      let finalEndDate = dateStr;
      
      if (dateStr < selectedStartDate) {
        // Если выбрали дату раньше начальной, меняем местами
        finalEndDate = selectedStartDate;
        finalStartDate = dateStr;
      }
      
      // Обновляем состояние
      setSelectedStartDate(finalStartDate);
      setSelectedEndDate(finalEndDate);
      
      // Плавная анимация выбора конечной даты и диапазона
      Animated.parallel([
        Animated.spring(endDateAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        Animated.spring(rangeAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
      ]).start(() => {
        // Вызываем callback для обновления состояния родительского компонента
        onDateRangeSelect(finalStartDate, finalEndDate);
        
        // Автоматически закрываем окно после небольшой задержки для плавности
        setTimeout(() => {
          if (onClose) {
            onClose();
          }
        }, 300);
      });
    }
  };
  
  // Обработчик подтверждения выбора - закрывает окно
  const handleConfirm = () => {
    if (selectedStartDate && selectedEndDate) {
      // Финальное обновление состояния перед закрытием
      onDateRangeSelect(selectedStartDate, selectedEndDate);
      if (onClose) {
        onClose();
      }
    }
  };
  
  // Плавные анимации при изменении выбранных дат
  useEffect(() => {
    Animated.spring(startDateAnim, {
      toValue: selectedStartDate ? 1 : 0,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  }, [selectedStartDate]);
  
  useEffect(() => {
    Animated.parallel([
      Animated.spring(endDateAnim, {
        toValue: selectedEndDate ? 1 : 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.spring(rangeAnim, {
        toValue: (selectedStartDate && selectedEndDate) ? 1 : 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
    ]).start();
  }, [selectedEndDate, selectedStartDate]);

  const isDateInRange = (date: Date) => {
    if (!selectedStartDate) return false;
    const dateStr = formatDateToString(date);
    if (selectedEndDate) {
      return dateStr >= selectedStartDate && dateStr <= selectedEndDate;
    }
    return dateStr === selectedStartDate;
  };

  const isDateSelected = (date: Date) => {
    const dateStr = formatDateToString(date);
    return dateStr === selectedStartDate || dateStr === selectedEndDate;
  };

  const isDateDisabled = (date: Date) => {
    // Всегда используем текущую дату динамически
    const today = getToday();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('ru-RU', { month: 'long' });
  };

  // Функция для правильного парсинга даты из строки YYYY-MM-DD в локальную дату
  const parseLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Функция для форматирования даты из строки YYYY-MM-DD (число месяц, без года)
  const formatDateString = (dateString: string): string => {
    const date = parseLocalDate(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
    });
  };

  const getDayName = (dayIndex: number) => {
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    return days[dayIndex];
  };

  const getDayOfWeek = (date: Date) => {
    const day = date.getDay();
    return day === 0 ? 6 : day - 1; // Понедельник = 0
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentMonth);
    // Всегда используем текущую дату динамически
    const today = getToday();
    
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
      // Не позволяем уходить в прошлое от минимальной даты
      const todayMonth = new Date(today.getFullYear(), today.getMonth());
      if (newDate < todayMonth) {
        return;
      }
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
      // Ограничиваем максимум 4 годами вперед от текущей даты
      const maxDate = new Date(today.getFullYear(), today.getMonth() + 48, 0);
      if (newDate > maxDate) {
        return;
      }
    }
    
    // Плавная анимация перехода между месяцами
    setCurrentMonth(newDate);
  };

  // Инициализируем текущий месяц при монтировании - всегда используем актуальную дату
  useEffect(() => {
    const today = getToday();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth()));
  }, [minDate]);

  // Автоматически обновляем календарь для продакшена
  // Календарь полностью динамический: всегда использует getToday() для получения текущей даты
  // Это означает, что он будет работать и через год, и через 4 года, и через любое количество лет
  // Проверяем актуальность дат каждые 5 минут и обновляем при необходимости
  useEffect(() => {
    const updateInterval = setInterval(() => {
      // ВСЕГДА используем текущую дату динамически - это ключ к автообновлению
      const today = getToday();
      const todayMonth = new Date(today.getFullYear(), today.getMonth());
      
      // Если текущий месяц устарел, плавно обновляем его
      if (currentMonth < todayMonth) {
        setCurrentMonth(todayMonth);
      }
    }, 300000); // Проверяем каждые 5 минут для более частого обновления

    return () => clearInterval(updateInterval);
  }, [currentMonth, minDate]);

  // Обновляем выбранные даты при изменении initialDateFrom/initialDateTo
  useEffect(() => {
    if (initialDateFrom) {
      setSelectedStartDate(initialDateFrom);
    } else {
      setSelectedStartDate(null);
    }
    if (initialDateTo) {
      setSelectedEndDate(initialDateTo);
    } else {
      setSelectedEndDate(null);
    }
  }, [initialDateFrom, initialDateTo]);

  // Группируем даты по месяцам
  const groupedDates = dates.reduce((acc, date) => {
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    if (!acc[monthKey]) {
      acc[monthKey] = [];
    }
    acc[monthKey].push(date);
    return acc;
  }, {} as Record<string, Date[]>);

  // Получаем первый день месяца для правильного отображения сетки
  const getFirstDayOfMonth = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    return getDayOfWeek(firstDay);
  };

  // Получаем текущую дату для отображения в заголовке
  const getCurrentDisplayMonth = () => {
    return formatMonthYear(currentMonth);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.card }]}>
      {/* Header with month navigation */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigateMonth('prev')}
          disabled={(() => {
            const today = getToday();
            const todayMonth = new Date(today.getFullYear(), today.getMonth());
            return currentMonth <= todayMonth;
          })()}
        >
          <Ionicons 
            name="chevron-back" 
            size={20} 
            color={(() => {
              const today = getToday();
              const todayMonth = new Date(today.getFullYear(), today.getMonth());
              return currentMonth > todayMonth 
                ? theme.primary 
                : (isDark ? 'rgba(255, 255, 255, 0.5)' : theme.secondaryText);
            })()} 
          />
        </TouchableOpacity>
        <Text style={[styles.monthText, { color: isDark ? '#FFFFFF' : theme.text }]}>{getCurrentDisplayMonth()}</Text>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigateMonth('next')}
          disabled={(() => {
            const today = getToday();
            const maxDate = new Date(today.getFullYear(), today.getMonth() + 48, 0);
            return currentMonth >= maxDate;
          })()}
        >
          <Ionicons 
            name="chevron-forward" 
            size={20} 
            color={(() => {
              const today = getToday();
              const maxDate = new Date(today.getFullYear(), today.getMonth() + 48, 0);
              return currentMonth < maxDate 
                ? theme.primary 
                : (isDark ? 'rgba(255, 255, 255, 0.5)' : theme.secondaryText);
            })()} 
          />
        </TouchableOpacity>
      </View>

      {/* Instructions */}
      {!selectedStartDate || !selectedEndDate ? (
        <View style={[styles.instructionsContainer, { backgroundColor: isDark ? theme.secondaryBackground : '#EFF6FF', borderBottomColor: theme.border }]}>
          <Text style={[styles.instructionsText, { color: isDark ? '#FFFFFF' : theme.primary }]}>
            {!selectedStartDate 
              ? i18n.t('calendar.selectCheckIn') 
              : i18n.t('calendar.selectCheckOut')}
          </Text>
        </View>
      ) : null}

      {/* Day names */}
      <View style={[styles.dayNames, { borderBottomColor: theme.border }]}>
        {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => (
          <View key={dayIndex} style={styles.dayName}>
            <Text style={[styles.dayNameText, { color: isDark ? 'rgba(255, 255, 255, 0.7)' : theme.secondaryText }]}>{getDayName(dayIndex)}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      <ScrollView 
        style={styles.calendarScroll} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.calendarScrollContent, { paddingBottom: bottomBarHeight }]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
      >
        {Object.keys(groupedDates).length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: isDark ? 'rgba(255, 255, 255, 0.7)' : theme.secondaryText }}>
              {i18n.t('calendar.loadingCalendar')}
            </Text>
          </View>
        ) : (
          Object.entries(groupedDates).map(([monthKey, monthDates]) => {
            if (!monthDates || monthDates.length === 0) return null;
          
            const firstDate = monthDates[0];
            const year = firstDate.getFullYear();
            const month = firstDate.getMonth();
            const firstDayOfWeek = getFirstDayOfMonth(year, month);
            
            // Получаем все дни месяца
            const lastDay = new Date(year, month + 1, 0).getDate();
            // Всегда используем текущую дату динамически
            const today = getToday();
            today.setHours(0, 0, 0, 0);
            
            // Создаем массив всех дней месяца
            const allDaysInMonth: Date[] = [];
            for (let day = 1; day <= lastDay; day++) {
              allDaysInMonth.push(new Date(year, month, day));
            }
            
            return (
              <View key={monthKey} style={styles.monthContainer}>
                <Text style={[styles.monthTitle, { color: isDark ? '#FFFFFF' : theme.text }]}>
                  {formatMonthYear(firstDate)}
                </Text>
                <View style={styles.calendarGrid}>
                  {/* Empty cells for days before month starts */}
                  {Array.from({ length: firstDayOfWeek }, (_, i) => (
                    <View key={`empty-${i}`} style={[styles.calendarDay, { width: calendarCellWidth }]} />
                  ))}
                  
                  {/* Calendar days */}
                  {allDaysInMonth.map((date) => {
                    const dateStr = formatDateToString(date);
                    const isSelected = isDateSelected(date);
                    const inRange = isDateInRange(date);
                    const isDisabled = isDateDisabled(date);
                    // Всегда используем текущую дату динамически
                    const todayDate = getToday();
                    const isToday = dateStr === formatDateToString(todayDate);
                    const isStart = dateStr === selectedStartDate;
                    const isEnd = dateStr === selectedEndDate;

                    return (
                      <TouchableOpacity
                        key={dateStr}
                        style={[
                          styles.calendarDay,
                          { width: calendarCellWidth },
                          inRange && !isSelected && {
                            backgroundColor: isDark 
                              ? `rgba(${parseInt(theme.primary.slice(1, 3), 16)}, ${parseInt(theme.primary.slice(3, 5), 16)}, ${parseInt(theme.primary.slice(5, 7), 16)}, 0.15)`
                              : 'rgba(0, 102, 204, 0.1)',
                          },
                          isSelected && styles.selectedDay,
                          isStart && styles.startDay,
                          isEnd && styles.endDay,
                          isDisabled && styles.disabledDay,
                        ]}
                        onPress={() => !isDisabled && handleDatePress(date)}
                        disabled={isDisabled}
                        activeOpacity={0.7}
                      >
                        {isSelected && (
                          <Animated.View
                            style={[
                              styles.selectedGradientContainer,
                              {
                                opacity: isStart ? startDateAnim : (isEnd ? endDateAnim : 1),
                              },
                            ]}
                          >
                            <View style={[styles.selectedGradient, { backgroundColor: theme.primary }]} />
                          </Animated.View>
                        )}
                        {inRange && !isSelected && (
                          <Animated.View
                            style={[
                              styles.rangeDayBackground,
                              {
                                backgroundColor: isDark 
                                  ? `rgba(${parseInt(theme.primary.slice(1, 3), 16)}, ${parseInt(theme.primary.slice(3, 5), 16)}, ${parseInt(theme.primary.slice(5, 7), 16)}, 0.2)`
                                  : 'rgba(0, 102, 204, 0.1)',
                                opacity: rangeAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, 0.15],
                                }),
                              },
                            ]}
                          />
                        )}
                        <Text
                          style={[
                            styles.dayText,
                            { 
                              color: isSelected 
                                ? '#FFFFFF' 
                                : (isDisabled 
                                    ? (isDark ? 'rgba(255, 255, 255, 0.3)' : theme.secondaryText)
                                    : (isDark ? '#FFFFFF' : theme.text)
                                  )
                            },
                            isToday && !isSelected && { color: theme.primary, fontWeight: '700' },
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Sticky bottom panel: выбранные даты + действия */}
      <View
        style={[styles.bottomBar, { backgroundColor: theme.card, paddingBottom: safeBottom }]}
        onLayout={(e) => setBottomBarHeight(e.nativeEvent.layout.height)}
      >
        {/* Selected dates display */}
        <View style={[styles.selectedDates, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <View style={styles.selectedDateItem}>
            <Ionicons name="calendar-outline" size={18} color={theme.primary} />
            <View style={styles.selectedDateInfo}>
              <Text style={[styles.selectedDateLabel, { color: theme.secondaryText }]}>{i18n.t('calendar.checkInDate')}</Text>
              <Text style={[
                styles.selectedDateValue,
                { color: selectedStartDate ? theme.text : theme.tertiaryText },
                !selectedStartDate && styles.selectedDateValueEmpty
              ]}>
                {selectedStartDate
                  ? formatDateString(selectedStartDate)
                  : i18n.t('calendar.notSelected')}
              </Text>
            </View>
          </View>
          <View style={styles.selectedDateDivider} />
          <View style={styles.selectedDateItem}>
            <Ionicons name="calendar-outline" size={18} color={theme.primary} />
            <View style={styles.selectedDateInfo}>
              <Text style={[styles.selectedDateLabel, { color: theme.secondaryText }]}>{i18n.t('calendar.checkOutDate')}</Text>
              <Text style={[
                styles.selectedDateValue,
                { color: selectedEndDate ? theme.text : theme.tertiaryText },
                !selectedEndDate && styles.selectedDateValueEmpty
              ]}>
                {selectedEndDate
                  ? formatDateString(selectedEndDate)
                  : i18n.t('calendar.notSelected')}
              </Text>
            </View>
          </View>
        </View>
        
        {/* Action buttons */}
        {selectedStartDate && selectedEndDate && (
          <View style={[styles.actionButtons, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.clearButton, { backgroundColor: theme.secondaryBackground }]}
              onPress={() => {
                // Плавная анимация очистки
                Animated.parallel([
                  Animated.spring(startDateAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 100,
                    friction: 8,
                  }),
                  Animated.spring(endDateAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 100,
                    friction: 8,
                  }),
                  Animated.spring(rangeAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 100,
                    friction: 8,
                  }),
                ]).start(() => {
                  setSelectedStartDate(null);
                  setSelectedEndDate(null);
                  setSelectingStart(true);
                });
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={i18n.t('calendar.clear')}
            >
              <Text style={[styles.clearButtonText, { color: theme.text }]}>{i18n.t('calendar.clear')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, { shadowColor: theme.primary }]}
              onPress={handleConfirm}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={i18n.t('calendar.apply')}
            >
              <View
                style={[styles.confirmButtonGradient, { backgroundColor: theme.primary }]}
              >
                <Text style={[styles.confirmButtonText, { color: theme.surface }]}>{i18n.t('calendar.apply')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    flex: 1,
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthText: {
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  dayNames: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  dayName: {
    flex: 1,
    alignItems: 'center',
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: '600',
  },
  calendarScroll: {
    flex: 1,
  },
  calendarScrollContent: {
    paddingBottom: 0,
  },
  monthContainer: {
    padding: 16,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  rangeDay: {
    // Цвет будет применяться динамически через inline стили
  },
  selectedDay: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  startDay: {
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  endDay: {
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  disabledDay: {
    opacity: 0.3,
  },
  selectedGradientContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  selectedGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  rangeDayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 102, 204, 0.1)',
  },
  dayText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1A1A1A',
    zIndex: 1,
  },
  selectedDayText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  disabledDayText: {
    color: '#9CA3AF',
  },
  todayText: {
    color: '#0066CC',
    fontWeight: '700',
  },
  instructionsContainer: {
    padding: 12,
    borderBottomWidth: 1,
  },
  instructionsText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  selectedDates: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    gap: 8,
  },
  selectedDateItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  selectedDateInfo: {
    flex: 1,
  },
  selectedDateLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  selectedDateValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  selectedDateValueEmpty: {
    fontWeight: '500',
  },
  selectedDateDivider: {
    width: 1,
    marginVertical: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  clearButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 4,
  },
  confirmButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});

export default DateRangeCalendar;
