import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { dictionaryService } from '../services/DictionaryService';
import { Country, Departure } from '../types/tourvisor';
import { platform } from '../utils/platform';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { logger } from '../utils/logger';
import { BRAND, radius, shadows, spacing } from '../config/designSystem';
import { getCountryCoverImage, COUNTRY_IMAGE_FALLBACK } from '../config/countryImages';
import CachedImage from '../components/ui/CachedImage';
import ScreenHeader from '../components/ui/ScreenHeader';
import { safeGoBack } from '../utils/navHelpers';
import {
  resolvePreferredDepartureId,
  savePreferredDepartureId,
} from '../services/IdeaCollectionService';
import { filterExcludedDestinationCountries } from '../config/homeDestinations';

const GRID_GAP = 12;
const GRID_PAD = 16;

interface TourvisorCountriesScreenProps {
  navigation: any;
  route?: any;
}

export default function TourvisorCountriesScreen({ navigation, route }: TourvisorCountriesScreenProps) {
  const { apiReady, theme, isDark } = useAppContext();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = (screenWidth - GRID_PAD * 2 - GRID_GAP) / 2;
  const [loading, setLoading] = useState(true);
  const [countries, setCountries] = useState<Country[]>([]);
  const [filteredCountries, setFilteredCountries] = useState<Country[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [departureId, setDepartureId] = useState<number | undefined>(
    () => route?.params?.departureId
  );
  const [onlyCharter, setOnlyCharter] = useState<boolean>(false);
  const [showDeparturePicker, setShowDeparturePicker] = useState(false);

  // Загрузка данных при монтировании компонента
  useEffect(() => {
    if (apiReady) {
      loadDictionaryData();
    }
  }, [apiReady]);

  // Перезагрузка стран при изменении departureId или onlyCharter
  useEffect(() => {
    if (apiReady && departureId !== undefined) {
      loadCountries();
    }
  }, [departureId, onlyCharter]);

  // Фильтрация стран по поисковому запросу
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCountries(countries);
    } else {
      const filtered = countries.filter(country =>
        country.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredCountries(filtered);
    }
  }, [countries, searchQuery]);

  const loadDictionaryData = async () => {
    try {
      const departuresData = await dictionaryService.getDepartures();
      setDepartures(departuresData);
      if (departureId === undefined) {
        const preferred = await resolvePreferredDepartureId();
        setDepartureId(preferred);
      }
      setLoading(false);
    } catch (error: any) {
      logger.error('[TourvisorCountries] Error loading dictionary data:', error);
      setLoading(false);
    }
  };

  const loadCountries = async () => {
    try {
      setLoading(true);
      // Только страны с турами из выбранного города вылета; без города — список пустой
      if (departureId == null) {
        setCountries([]);
        setFilteredCountries([]);
        setLoading(false);
        return;
      }
      const countriesData = await dictionaryService.getCountries(departureId, onlyCharter);
      const reachable = filterExcludedDestinationCountries(countriesData || []);
      setCountries(reachable);
      setFilteredCountries(reachable);
    } catch (error: any) {
      logger.error('[TourvisorCountries] Error loading countries:', error);
      setCountries([]);
      setFilteredCountries([]);
    } finally {
      setLoading(false);
    }
  };

  // Обработчик нажатия на страну - открываем туры для этой страны
  const handleViewTours = (country: Country) => {
    logger.debug('[TourvisorCountries] Opening tours for country:', country.name, 'ID:', country.id);
    
    // Параметры для передачи
    const tourParams = {
      countryId: country.id,
      countryName: country.name,
      departureId: departureId || 1,
      onlyCharter: onlyCharter,
    };
    
    logger.debug('[TourvisorCountries] Navigation params:', tourParams);
    
    // Используем прямой вызов navigate - обертка в SearchMainScreen обработает это правильно
    navigation.navigate('ApiHotTours', tourParams);
  };

  // Получение реального изображения для страны из базы данных стран
  const getCountryImage = (countryName: string) => getCountryCoverImage(countryName);

  const getCountryIcon = (countryName: string): keyof typeof Ionicons.glyphMap => {
    if (countryName === 'Турция' || countryName === 'Египет' || countryName === 'ОАЭ') {
      return 'sunny-outline';
    }
    if (countryName === 'Мальдивы' || countryName === 'Таиланд') {
      return 'water-outline';
    }
    if (countryName === 'Россия') {
      return 'location-outline';
    }
    return 'earth-outline';
  };

  // Крупные фото-карточки в сетке 2×N (концепт OTA)
  const renderCountry = ({ item }: { item: Country }) => (
    <TouchableOpacity
      style={[styles.countryCard, shadows.card, { width: cardWidth }]}
      activeOpacity={0.9}
      onPress={() => handleViewTours(item)}
    >
      <View style={styles.countryImage}>
        <CachedImage
          source={{ uri: getCountryImage(item.name) }}
          fallbackUri={COUNTRY_IMAGE_FALLBACK}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
        <LinearGradient
          colors={['rgba(18,18,46,0.05)', 'rgba(18,18,46,0.78)']}
          style={styles.countryGrad}
        >
          <View style={styles.countryBadge}>
            <Ionicons name={getCountryIcon(item.name)} size={14} color="#fff" />
          </View>
          <View style={styles.countryFooter}>
            <Text style={styles.countryName} numberOfLines={2}>
              {item.name}
            </Text>
            <View style={styles.countryCta}>
              <Text style={styles.countryCtaText}>{i18n.t('favorites.tours')}</Text>
              <Ionicons name="arrow-forward" size={12} color="#fff" />
            </View>
          </View>
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );

  // Рендер фильтров (статичный блок)
  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      {/* Поиск */}
      <View style={[styles.searchWrapper, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]}>
        <Ionicons name="search" size={20} color={theme.primary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { backgroundColor: theme.card, color: theme.text }]}
          placeholder={i18n.t('countries.searchPlaceholder')}
          placeholderTextColor={theme.secondaryText}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            style={styles.clearButton}
          >
            <Ionicons name="close-circle" size={20} color={theme.secondaryText} />
          </TouchableOpacity>
        )}
      </View>

      {/* Выбор города отправления */}
      <TouchableOpacity
        style={[styles.departureSelector, { backgroundColor: theme.secondaryBackground, borderColor: theme.border }]}
        onPress={() => setShowDeparturePicker(!showDeparturePicker)}
        activeOpacity={0.7}
      >
        <Ionicons name="airplane" size={18} color={theme.primary} />
        <Text style={[styles.departureText, { color: theme.text }]}>
          {departureId
            ? departures.find(d => d.id === departureId)?.name || i18n.t('countries.selectCity')
            : i18n.t('countries.selectCity')}
        </Text>
        <Ionicons
          name={showDeparturePicker ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.secondaryText}
        />
      </TouchableOpacity>
      <Text style={[styles.fromHint, { color: theme.secondaryText }]}>
        {i18n.t('countries.fromCityHint')}
      </Text>

      {/* Dropdown для городов */}
      {showDeparturePicker && (
        <View style={styles.departureDropdown}>
          {departures.map((departure) => (
            <TouchableOpacity
              key={departure.id}
              style={styles.departureOption}
              onPress={() => {
                setDepartureId(departure.id);
                void savePreferredDepartureId(departure.id);
                setShowDeparturePicker(false);
              }}
            >
              <Text style={styles.departureOptionText}>{departure.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Фильтр чартеров */}
      <TouchableOpacity
        style={[
          styles.charterFilter,
          { backgroundColor: onlyCharter ? theme.primary : theme.secondaryBackground },
          onlyCharter && styles.charterFilterActive
        ]}
        onPress={() => {
          setOnlyCharter(!onlyCharter);
        }}
        activeOpacity={0.7}
      >
        <Ionicons
          name={onlyCharter ? "airplane" : "airplane-outline"}
          size={16}
          color={onlyCharter ? theme.surface : theme.primary}
        />
        <Text style={[
          styles.charterFilterText,
          { color: onlyCharter ? theme.surface : theme.text },
          onlyCharter && styles.charterFilterTextActive
        ]}>
          Только чартеры
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScreenHeader
        title={i18n.t('countries.title')}
        subtitle={departures.find((d) => d.id === departureId)?.name}
        onBack={() => safeGoBack(navigation, 'Home')}
        noSafeTop
      />

      {!apiReady ? (
        <View style={styles.emptyState}>
          <Ionicons name="cloud-offline" size={48} color="#8E8E93" />
          <Text style={styles.emptyStateTitle}>API не настроен</Text>
          <Text style={styles.emptyStateText}>
            Проверьте настройки JWT токена
          </Text>
        </View>
      ) : loading && countries.length === 0 ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={styles.emptyStateText}>Загрузка направлений...</Text>
        </View>
      ) : (
        <>
          {/* Статичные фильтры */}
          <View style={[styles.filtersWrapper, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
            {renderFilters()}
          </View>

          {/* Скроллируемый список стран — сетка фото-карточек */}
          <FlatList
            data={filteredCountries}
            renderItem={renderCountry}
            keyExtractor={(item) => item.id.toString()}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={48} color={theme.inactive} />
                <Text style={[styles.emptyStateTitle, { color: theme.text }]}>{i18n.t('search.nothingFound')}</Text>
                <Text style={[styles.emptyStateText, { color: theme.secondaryText }]}>
                  {i18n.t('countries.tryChangeParams')}
                </Text>
              </View>
            }
            ListHeaderComponent={
              filteredCountries.length > 0 ? (
                <View style={styles.resultsHeader}>
                  <Text style={[styles.resultsText, { color: theme.text }]}>
                    {i18n.t('search.foundCount')}: {filteredCountries.length}
                  </Text>
                </View>
              ) : null
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor применяется динамически через inline стиль
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D1D1F',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  filtersWrapper: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  filtersContainer: {
    gap: 12,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1D1D1F',
    padding: 0,
  },
  clearButton: {
    padding: 4,
  },
  departureSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    gap: 8,
  },
  departureText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  fromHint: {
    fontSize: 12,
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 16,
  },
  departureDropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginTop: 4,
    maxHeight: 200,
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  departureOption: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  departureOptionText: {
    fontSize: 16,
  },
  charterFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    gap: 6,
  },
  charterFilterActive: {
    // backgroundColor и borderColor применяются динамически
  },
  charterFilterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  charterFilterTextActive: {
    // color применяется динамически
  },
  listContent: {
    padding: GRID_PAD,
    paddingTop: 8,
    paddingBottom: 32,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  resultsHeader: {
    marginBottom: 12,
  },
  resultsText: {
    fontSize: 14,
    color: '#6E6E73',
    fontWeight: '500',
  },
  countryCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: BRAND.navy,
  },
  countryImage: {
    width: '100%',
    aspectRatio: 0.78,
    minHeight: 168,
  },
  countryImageInner: {
    borderRadius: radius.xl,
  },
  countryGrad: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: spacing.sm,
  },
  countryBadge: {
    alignSelf: 'flex-start',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryFooter: {
    gap: 8,
  },
  countryName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.2,
  },
  countryCta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BRAND.orange,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  countryCtaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6E6E73',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '60%',
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  settingsSection: {
    padding: 20,
  },
  settingsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingItemText: {
    fontSize: 16,
    color: '#1D1D1F',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
