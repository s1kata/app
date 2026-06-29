import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { tourvisorApi } from '../services/TourvisorApiService';
import { dictionaryService } from '../services/DictionaryService';
import { Country, Departure } from '../types/tourvisor';
import { platform } from '../utils/platform';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { logger } from '../utils/logger';
import { getCountryBySlug, COUNTRIES_LIST } from '../data/countriesData';
import { radius } from '../config/designSystem';

/** Высота карточки страны (image 180 + content + marginBottom 12) для getItemLayout */
const COUNTRY_ITEM_HEIGHT = 352;

interface TourvisorCountriesScreenProps {
  navigation: any;
  route?: any;
}

export default function TourvisorCountriesScreen({ navigation, route }: TourvisorCountriesScreenProps) {
  const { apiReady, theme, isDark } = useAppContext();
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);

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
      // По умолчанию — первый город вылета; страны подгрузятся в useEffect по departureId (только с турами)
      if (departureId === undefined && departuresData.length > 0) {
        setDepartureId(departuresData[0].id);
      }
      setLoading(false);
    } catch (error: any) {
      logger.error('[TourvisorCountries] Error loading dictionary data:', error);
      setLoading(false);
    }
  };

  const loadDepartures = async () => {
    try {
      const departuresData = await dictionaryService.getDepartures();
      setDepartures(departuresData);
    } catch (error: any) {
      logger.error('[TourvisorCountries] Error loading departures:', error);
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
      setCountries(countriesData);
      setFilteredCountries(countriesData);
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
  const getCountryImage = (countryName: string) => {
    // Ищем страну в базе данных по точному совпадению имени
    let countryData = COUNTRIES_LIST.find(c => c.name === countryName);
    
    // Если не найдено, пробуем найти по частичному совпадению
    if (!countryData) {
      countryData = COUNTRIES_LIST.find(c => 
        c.name.toLowerCase().includes(countryName.toLowerCase()) ||
        countryName.toLowerCase().includes(c.name.toLowerCase())
      );
    }
    
    // Если нашли страну в базе данных, используем первое фото из массива
    if (countryData && countryData.images && countryData.images.length > 0) {
      return countryData.images[0];
    }
    
    // Если не нашли, используем резервные фото для популярных стран
    const fallbackImages: { [key: string]: string } = {
      'Турция': 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=1200&h=800&fit=crop&q=85',
      'Египет': 'https://images.unsplash.com/photo-1539768942893-daf53e448371?w=1200&h=800&fit=crop&q=85',
      'ОАЭ': 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1200&h=800&fit=crop&q=85',
      'Таиланд': 'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=1200&h=800&fit=crop&q=85',
      'Мальдивы': 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=1200&h=800&fit=crop&q=85',
      'Россия': 'https://images.unsplash.com/photo-1513326738677-b964603b136d?w=1200&h=800&fit=crop&q=85',
      'Греция': 'https://images.unsplash.com/photo-1531572753322-ad063cecc140?w=1200&h=800&fit=crop&q=85',
      'Испания': 'https://images.unsplash.com/photo-1539037116277-4db20889f2d2?w=1200&h=800&fit=crop&q=85',
      'Италия': 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=1200&h=800&fit=crop&q=85',
      'Франция': 'https://images.unsplash.com/photo-1502602898536-47ad22581b52?w=1200&h=800&fit=crop&q=85',
    };
    
    return fallbackImages[countryName] || `https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&h=800&fit=crop&q=85`;
  };

  // Получение описания для страны
  const getCountryDescription = (countryName: string) => {
    const descriptions: { [key: string]: string } = {
      'Турция': 'Солнечные пляжи, богатая история и уникальная культура. Идеальное место для пляжного отдыха и экскурсий.',
      'Египет': 'Древние пирамиды, Красное море и незабываемые экскурсии. Погрузитесь в историю древней цивилизации.',
      'ОАЭ': 'Роскошь, современная архитектура и безупречный сервис. Дубай и Абу-Даби ждут вас.',
      'Таиланд': 'Тропические пляжи, экзотическая кухня и буддийские храмы. Рай для любителей пляжного отдыха.',
      'Мальдивы': 'Райские острова с кристально чистой водой и белоснежными пляжами. Идеально для романтического отдыха.',
      'Россия': 'Богатое культурное наследие, красивые города и разнообразная природа. Откройте для себя Россию.',
      'Греция': 'Античные руины, живописные острова и средиземноморская кухня. Колыбель европейской цивилизации.',
      'Испания': 'Страстная культура, архитектура Гауди и прекрасные пляжи. Отдых на любой вкус.',
      'Италия': 'Искусство, архитектура, кухня и романтика. Венеция, Рим, Флоренция - города мечты.',
      'Франция': 'Элегантность, изысканная кухня и романтическая атмосфера. Париж, Лазурный берег и многое другое.',
      'Кипр': 'Средиземноморский климат, древние достопримечательности и прекрасные пляжи.',
      'Тунис': 'Арабская культура, пустыня Сахара и курорты Средиземноморья.',
      'Болгария': 'Черноморское побережье, горнолыжные курорты и доступные цены.',
      'Черногория': 'Живописное побережье Адриатики, горы и чистая природа.',
      'Хорватия': 'Красивое побережье, средневековые города и национальные парки.',
      'Вьетнам': 'Экзотическая культура, красивая природа и доступные цены.',
      'Индия': 'Древняя культура, храмы, пляжи Гоа и незабываемые впечатления.',
      'Шри-Ланка': 'Тропические пляжи, чайные плантации и богатая культура.',
      'Доминикана': 'Карибское море, белоснежные пляжи и тропическая природа.',
      'Куба': 'Карибская атмосфера, колониальная архитектура и ритмы сальсы.',
      'Мексика': 'Древние пирамиды майя, пляжи Карибского моря и яркая культура.',
      'Оман': 'Арабская экзотика, пустыни и современные курорты.',
      'Бахрейн': 'Современный Ближний Восток, роскошь и традиции.',
      'Катар': 'Современная архитектура, роскошь и арабское гостеприимство.',
      'Иордания': 'Петра, Мертвое море и пустыня Вади-Рам.',
      'Марокко': 'Арабская культура, Атласские горы и побережье Атлантики.',
    };
    return descriptions[countryName] || i18n.t('countries.defaultDescription');
  };

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

  // Рендер одной страны
  const renderCountry = ({ item }: { item: Country }) => (
    <TouchableOpacity
      style={[styles.countryCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}
      activeOpacity={0.7}
      onPress={() => handleViewTours(item)}
    >
      <Image
        source={{ uri: getCountryImage(item.name) }}
        style={styles.countryImage}
        resizeMode="cover"
      />
      
      <View style={styles.countryContent}>
        <View style={styles.countryHeader}>
          <View style={[styles.countryFlagCircle, { backgroundColor: theme.primary + '12' }]}>
            <Ionicons name={getCountryIcon(item.name)} size={18} color={theme.primary} />
          </View>
          <View style={styles.countryInfo}>
            <Text style={[styles.countryName, { color: theme.text }]} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
        </View>

        {/* Описание страны */}
        <Text style={[styles.countryDescription, { color: theme.secondaryText }]} numberOfLines={2}>
          {getCountryDescription(item.name)}
        </Text>

        {/* Индикатор кликабельности */}
        <View style={styles.viewToursIndicator}>
          <Text style={[styles.viewToursIndicatorText, { color: theme.secondaryText }]}>Нажмите для просмотра туров</Text>
          <Ionicons name="arrow-forward" size={16} color={theme.primary} />
        </View>
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
            : i18n.t('countries.allCities')}
        </Text>
        <Ionicons
          name={showDeparturePicker ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.secondaryText}
        />
      </TouchableOpacity>

      {/* Dropdown для городов */}
      {showDeparturePicker && (
        <View style={styles.departureDropdown}>
          <TouchableOpacity
            style={styles.departureOption}
            onPress={() => {
              setDepartureId(undefined);
              setShowDeparturePicker(false);
              setTimeout(() => loadCountries(), 100);
            }}
          >
            <Text style={styles.departureOptionText}>Все города</Text>
          </TouchableOpacity>
          {departures.map((departure) => (
            <TouchableOpacity
              key={departure.id}
              style={styles.departureOption}
              onPress={() => {
                setDepartureId(departure.id);
                setShowDeparturePicker(false);
                setTimeout(() => loadCountries(), 100);
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
          setTimeout(() => loadCountries(), 100);
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Фиксированный Header - скрыт, так как используется в SearchMainScreen */}

      {/* Content */}
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
          <ActivityIndicator size="large" color="#0066CC" />
          <Text style={styles.emptyStateText}>Загрузка направлений...</Text>
        </View>
      ) : (
        <>
          {/* Статичные фильтры */}
          <View style={[styles.filtersWrapper, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
            {renderFilters()}
          </View>

          {/* Скроллируемый список стран */}
          <FlatList
            data={filteredCountries}
            renderItem={renderCountry}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            getItemLayout={(_, index) => ({
              length: COUNTRY_ITEM_HEIGHT,
              offset: COUNTRY_ITEM_HEIGHT * index,
              index,
            })}
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

      {/* Settings Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showSettingsModal}
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
              <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Настройки</Text>
                <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>

            <View style={styles.settingsSection}>
              <Text style={[styles.settingsSectionTitle, { color: theme.text }]}>API настройки</Text>
              
              <View style={styles.settingItem}>
                <View style={styles.settingItemContent}>
                  <Ionicons name="server" size={20} color={theme.primary} />
                  <Text style={[styles.settingItemText, { color: theme.text }]}>Статус API</Text>
                </View>
                <View style={styles.statusIndicator}>
                  <View style={[
                    styles.statusDot,
                    { backgroundColor: apiReady ? theme.success : theme.error }
                  ]} />
                  <Text style={[
                    styles.statusText,
                    { color: apiReady ? theme.success : theme.error }
                  ]}>
                    {apiReady ? i18n.t('countries.apiConnected') : i18n.t('countries.apiError')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
    padding: 16,
    paddingTop: 8,
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
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    ...platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  countryImage: {
    width: '100%',
    height: 180,
    backgroundColor: '#E5E5E5',
  },
  countryContent: {
    padding: 16,
  },
  countryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  countryFlagCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryInfo: {
    flex: 1,
  },
  countryName: {
    fontSize: 18,
    fontWeight: '700',
  },
  countryDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  viewToursIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
    marginTop: 8,
  },
  viewToursIndicatorText: {
    fontSize: 14,
    fontWeight: '500',
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
