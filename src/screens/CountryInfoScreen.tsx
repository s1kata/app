import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getCountryBySlug, CountryData } from '../data/countriesData';
import { tourvisorApi } from '../services/TourvisorApiService';
import { dictionaryService } from '../services/DictionaryService';
import { Country } from '../types/tourvisor';
import { useAppContext } from '../contexts/AppContext';
import { Alert } from 'react-native';
import { logger } from '../utils/logger';

interface CountryInfoScreenProps {
  navigation: any;
  route: {
    params: {
      countrySlug: string;
    };
  };
}

export default function CountryInfoScreen({ navigation, route }: CountryInfoScreenProps) {
  const { countrySlug } = route.params;
  const { user } = useAppContext();
  const { width } = useWindowDimensions();
  const [country, setCountry] = useState<CountryData | null>(null);
  const [tourvisorCountry, setTourvisorCountry] = useState<Country | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Проверка, является ли пользователь гостем
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  useEffect(() => {
    loadCountryData();
  }, [countrySlug]);

  const loadCountryData = async () => {
    try {
      setLoading(true);
      const countryData = getCountryBySlug(countrySlug);
      setCountry(countryData || null);

      // Попытаемся найти страну в Tourvisor API через dictionaryService (с кэшированием)
      try {
        const countries = await dictionaryService.getCountriesAll();
        const found = countries.find(
          c => c.name.toLowerCase().includes(countryData?.name.toLowerCase() || '') ||
               countryData?.name.toLowerCase().includes(c.name.toLowerCase() || '')
        );
        if (found) {
          setTourvisorCountry(found);
        }
      } catch (error: any) {
        // Тихая обработка ошибок для демо API (403, 429 ожидаем)
        // Не логируем ошибки
      }
    } catch (error) {
      logger.error('Error loading country data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookTour = () => {
    // Проверка на гостевой режим
    if (isGuest) {
      Alert.alert(
        'Требуется авторизация',
        'Для бронирования туров необходимо войти в систему. Хотите войти или зарегистрироваться?',
        [
          {
            text: 'Отмена',
            style: 'cancel',
          },
          {
            text: 'Войти',
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
      return;
    }

    if (tourvisorCountry) {
      navigation.navigate('ApiTourSearch', {
        initialParams: {
          countryId: tourvisorCountry.id,
          departureId: 1, // Москва по умолчанию
          currency: 'RUB',
        }
      });
    } else {
      // Если не нашли страну в API, все равно открываем поиск
      navigation.navigate('ApiTourSearch');
    }
  };

  if (loading || !country) {
    return (
      <SafeAreaView style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#0066CC" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <View style={styles.heroContainer}>
          <Image
            source={{ uri: country.images[0] }}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={[styles.heroGradient, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
          
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Country Title */}
          <View style={styles.heroContent}>
            <Text style={styles.countryFlag}>{country.flag}</Text>
            <Text style={styles.countryName}>{country.name}</Text>
            <Text style={styles.countryNameEn}>{country.nameEn}</Text>
          </View>
        </View>

        {/* Main Content */}
        <View style={styles.content}>
          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>О стране</Text>
            <Text style={styles.description}>{country.bio}</Text>
          </View>

          {/* Highlights */}
          {country.highlights && country.highlights.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Почему стоит посетить</Text>
              <View style={styles.highlightsContainer}>
                {country.highlights.map((highlight, index) => (
                  <View key={index} style={styles.highlightItem}>
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    <Text style={styles.highlightText}>{highlight}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Tourist Info Cards */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Полезная информация</Text>
            <View style={styles.infoGrid}>
              <View style={[styles.infoCard, { width: (width - 52) / 2 }]}>
                <View style={[styles.infoIcon, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="calendar" size={24} color="#0066CC" />
                </View>
                <Text style={styles.infoLabel}>Лучшее время</Text>
                <Text style={styles.infoValue}>{country.bestTime}</Text>
              </View>

              <View style={[styles.infoCard, { width: (width - 52) / 2 }]}>
                <View style={[styles.infoIcon, { backgroundColor: '#F0FDF4' }]}>
                  <Ionicons name="cash" size={24} color="#10B981" />
                </View>
                <Text style={styles.infoLabel}>Валюта</Text>
                <Text style={styles.infoValue}>{country.currency}</Text>
              </View>

              <View style={[styles.infoCard, { width: (width - 52) / 2 }]}>
                <View style={[styles.infoIcon, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="language" size={24} color="#F59E0B" />
                </View>
                <Text style={styles.infoLabel}>Язык</Text>
                <Text style={styles.infoValue}>{country.language}</Text>
              </View>

              <View style={[styles.infoCard, { width: (width - 52) / 2 }]}>
                <View style={[styles.infoIcon, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="document-text" size={24} color="#EF4444" />
                </View>
                <Text style={styles.infoLabel}>Виза</Text>
                <Text style={styles.infoValue}>{country.visa}</Text>
              </View>
            </View>
          </View>

          {/* Detailed Info */}
          {country.detailedInfo && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Детальная информация</Text>
              
              {country.detailedInfo.climate && (
                <View style={styles.detailCard}>
                  <View style={styles.detailHeader}>
                    <Ionicons name="sunny" size={20} color="#F59E0B" />
                    <Text style={styles.detailTitle}>Климат</Text>
                  </View>
                  <Text style={styles.detailText}>{country.detailedInfo.climate}</Text>
                </View>
              )}

              {country.detailedInfo.attractions && (
                <View style={styles.detailCard}>
                  <View style={styles.detailHeader}>
                    <Ionicons name="location" size={20} color="#0066CC" />
                    <Text style={styles.detailTitle}>Достопримечательности</Text>
                  </View>
                  <Text style={styles.detailText}>{country.detailedInfo.attractions}</Text>
                </View>
              )}

              {country.detailedInfo.activities && (
                <View style={styles.detailCard}>
                  <View style={styles.detailHeader}>
                    <Ionicons name="bicycle" size={20} color="#10B981" />
                    <Text style={styles.detailTitle}>Активности</Text>
                  </View>
                  <Text style={styles.detailText}>{country.detailedInfo.activities}</Text>
                </View>
              )}

              {country.detailedInfo.cuisine && (
                <View style={styles.detailCard}>
                  <View style={styles.detailHeader}>
                    <Ionicons name="restaurant" size={20} color="#EF4444" />
                    <Text style={styles.detailTitle}>Кухня</Text>
                  </View>
                  <Text style={styles.detailText}>{country.detailedInfo.cuisine}</Text>
                </View>
              )}

              {country.detailedInfo.culture && (
                <View style={styles.detailCard}>
                  <View style={styles.detailHeader}>
                    <Ionicons name="people" size={20} color="#8B5CF6" />
                    <Text style={styles.detailTitle}>Культура</Text>
                  </View>
                  <Text style={styles.detailText}>{country.detailedInfo.culture}</Text>
                </View>
              )}
            </View>
          )}

          {/* Gallery */}
          {country.images && country.images.length > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Фотогалерея</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryContainer}
              >
                {country.images.slice(1, 4).map((image, index) => (
                  <Image
                    key={index}
                    source={{ uri: image }}
                    style={styles.galleryImage}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Bottom Spacing */}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Book Button */}
      <View style={styles.bookButtonContainer}>
        <TouchableOpacity
          style={styles.bookButton}
          onPress={handleBookTour}
          activeOpacity={0.9}
        >
          <View style={[styles.bookButtonGradient, { backgroundcolor: '#0066CC' }]}>
            <Ionicons name="airplane" size={24} color="#FFFFFF" />
            <Text style={styles.bookButtonText}>Забронировать тур</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroContainer: {
    height: 350,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    zIndex: 10,
  },
  countryFlag: {
    fontSize: 64,
    marginBottom: 8,
  },
  countryName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  countryNameEn: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4B5563',
  },
  highlightsContainer: {
    gap: 12,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  highlightText: {
    fontSize: 15,
    color: '#1A1A1A',
    marginLeft: 12,
    flex: 1,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoCard: {
    width: '100%', // реальное значение переопределяется inline через useWindowDimensions
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    textAlign: 'center',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginLeft: 12,
  },
  detailText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4B5563',
  },
  galleryContainer: {
    gap: 12,
    paddingRight: 20,
  },
  galleryImage: {
    width: 200,
    height: 150,
    borderRadius: 16,
    marginRight: 12,
  },
  bookButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#FAFBFC',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  bookButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowcolor: '#0066CC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  bookButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    gap: 12,
  },
  bookButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
