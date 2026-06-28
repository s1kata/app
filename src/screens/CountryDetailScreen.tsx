import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { platform } from '../utils/platform';
import { Ionicons } from '@expo/vector-icons';
import { getCountryBySlug, CountryData } from '../data/countriesData';
import { WebsiteTourService, WebsiteTour } from '../services/WebsiteTourService';
import { logger } from '../utils/logger';

interface CountryDetailScreenProps {
  navigation: any;
  route: {
    params: {
      countrySlug: string;
      countryName: string;
    };
  };
}

export default function CountryDetailScreen({ navigation, route }: CountryDetailScreenProps) {
    const { countrySlug, countryName } = route.params;
  const { width, height } = useWindowDimensions();
  
  const [country, setCountry] = useState<CountryData | null>(null);
  const [tours, setTours] = useState<WebsiteTour[]>([]);
  const [loadingTours, setLoadingTours] = useState(true);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const tourService = WebsiteTourService.getInstance();

  useEffect(() => {
    const countryData = getCountryBySlug(countrySlug);
    setCountry(countryData || null);
    loadTours();
  }, [countrySlug]);

  const loadTours = async () => {
    try {
      setLoadingTours(true);
      const response = await tourService.getTours({
        filter: countrySlug,
        perPage: 12,
      });
      setTours(response.tours);
    } catch (error) {
      logger.error('Error loading tours:', error);
    } finally {
      setLoadingTours(false);
    }
  };

  const formatPrice = (price: number | null) => {
    if (!price) return 'По запросу';
    return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
  };

  const openGallery = (index: number) => {
    setCurrentImageIndex(index);
    setGalleryVisible(true);
  };

  const handleTourPress = (_tour: WebsiteTour) => {
    // Старый маршрут Search/TourDetails отсутствует в навигаторе; туры с сайта — не Tourvisor id.
    navigation.navigate('ApiTourSearch');
  };

  if (!country) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: '#F0F2F5' }]}>
        <View style={[styles.container, styles.centerContent]}>
          <ActivityIndicator size="large" color={'#0066CC'} />
        </View>
      </SafeAreaView>
    );
  }

  const renderInfoCard = (icon: string, title: string, value: string) => (
    <View style={[styles.infoCard, { backgroundColor: '#FFFFFF' }]}>
      <Ionicons name={icon as any} size={20} color={'#0066CC'} />
      <View style={styles.infoCardContent}>
        <Text style={[styles.infoCardLabel, { color: '#6E6E73' }]}>{title}</Text>
        <Text style={[styles.infoCardValue, { color: '#1D1D1F' }]}>{value}</Text>
      </View>
    </View>
  );

  const renderHighlight = (text: string, index: number) => (
    <View key={index} style={styles.highlightItem}>
      <View style={[styles.highlightCheck, { backgroundColor: '#0066CC' }]}>
        <Ionicons name="checkmark" size={14} color="#fff" />
      </View>
      <Text style={[styles.highlightText, { color: '#1D1D1F' }]}>{text}</Text>
    </View>
  );

  const renderDetailSection = (
    icon: string,
    title: string,
    content: string,
    key: string
  ) => {
    const isExpanded = expandedSection === key;
    return (
      <TouchableOpacity
        style={[styles.detailSection, { backgroundColor: '#FFFFFF' }]}
        onPress={() => setExpandedSection(isExpanded ? null : key)}
        activeOpacity={0.8}
      >
        <View style={styles.detailHeader}>
          <Ionicons name={icon as any} size={20} color={'#0066CC'} />
          <Text style={[styles.detailTitle, { color: '#1D1D1F' }]}>{title}</Text>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={'#6E6E73'}
          />
        </View>
        {isExpanded && (
          <Text style={[styles.detailContent, { color: '#6E6E73' }]}>
            {content}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderTourCard = (tour: WebsiteTour) => (
    <TouchableOpacity
      key={tour.id}
      style={[styles.tourCard, { backgroundColor: '#FFFFFF' }]}
      onPress={() => handleTourPress(tour)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: tour.image }}
        style={styles.tourImage}
        resizeMode="cover"
      />
      {tour.badge && (
        <View style={[styles.tourBadge, { backgroundColor: '#0066CC' }]}>
          <Text style={styles.tourBadgeText}>{tour.badge}</Text>
        </View>
      )}
      <View style={styles.tourInfo}>
        <Text style={[styles.tourTitle, { color: '#1D1D1F' }]} numberOfLines={2}>
          {tour.title}
        </Text>
        {tour.rating && (
          <View style={styles.tourRating}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={[styles.tourRatingText, { color: '#1D1D1F' }]}>
              {tour.rating.toFixed(1)}
            </Text>
            <Text style={[styles.tourReviews, { color: '#6E6E73' }]}>
              ({tour.reviews || 0})
            </Text>
          </View>
        )}
        <Text style={[styles.tourPrice, { color: '#0066CC' }]}>
          от {formatPrice(tour.price)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: '#F0F2F5' }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Image
            source={{ uri: country.images[0] || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800' }}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={[styles.heroGradient, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.heroContent}>
            <Text style={styles.heroFlag}>{country.flag}</Text>
            <Text style={styles.heroTitle}>{country.name}</Text>
            <Text style={styles.heroSubtitle}>{country.description}</Text>
          </View>
        </View>

        {/* Photo Gallery Strip */}
        {country.images.length > 1 && (
          <View style={styles.gallerySection}>
            <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>
              <Ionicons name="images" size={20} color={'#0066CC'} /> Фотогалерея
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryStrip}
            >
              {country.images.map((image, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => openGallery(index)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: image }}
                    style={styles.galleryImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* About Section */}
        <View style={[styles.section, styles.aboutSection, { backgroundColor: '#FFFFFF' }]}>
          <View style={styles.aboutHeader}>
            <View style={[styles.aboutIcon, { backgroundColor: '#0066CC' }]}>
              <Ionicons name="book-outline" size={24} color="#fff" />
            </View>
            <Text style={[styles.aboutTitle, { color: '#1D1D1F' }]}>
              О стране {country.name}
            </Text>
          </View>
          <Text style={[styles.aboutText, { color: '#6E6E73' }]}>
            {country.bio}
          </Text>
        </View>

        {/* Highlights */}
        {country.highlights.length > 0 && (
          <View style={[styles.section, { backgroundColor: '#FFFFFF' }]}>
            <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>
              Почему стоит посетить
            </Text>
            <View style={styles.highlightsGrid}>
              {country.highlights.map((h, i) => renderHighlight(h, i))}
            </View>
          </View>
        )}

        {/* Detailed Info */}
        {country.detailedInfo && (
          <View style={styles.detailsContainer}>
            <Text style={[styles.sectionTitleMargin, { color: '#1D1D1F' }]}>
              Подробная информация
            </Text>
            {country.detailedInfo.climate && renderDetailSection(
              'sunny-outline', 'Климат', country.detailedInfo.climate, 'climate'
            )}
            {country.detailedInfo.attractions && renderDetailSection(
              'location-outline', 'Достопримечательности', country.detailedInfo.attractions, 'attractions'
            )}
            {country.detailedInfo.activities && renderDetailSection(
              'bicycle-outline', 'Активности', country.detailedInfo.activities, 'activities'
            )}
            {country.detailedInfo.cuisine && renderDetailSection(
              'restaurant-outline', 'Кухня', country.detailedInfo.cuisine, 'cuisine'
            )}
            {country.detailedInfo.culture && renderDetailSection(
              'people-outline', 'Культура', country.detailedInfo.culture, 'culture'
            )}
          </View>
        )}

        {/* Useful Info Cards */}
        <View style={styles.infoCardsContainer}>
          <Text style={[styles.sectionTitleMargin, { color: '#1D1D1F' }]}>
            Полезная информация
          </Text>
          <View style={styles.infoCardsGrid}>
            {renderInfoCard('calendar-outline', 'Лучшее время', country.bestTime)}
            {renderInfoCard('card-outline', 'Валюта', country.currency)}
            {renderInfoCard('chatbubble-outline', 'Язык', country.language)}
            {renderInfoCard('document-text-outline', 'Виза', country.visa)}
          </View>
        </View>

        {/* Tours Section */}
        <View style={styles.toursSection}>
          <View style={styles.toursSectionHeader}>
            <Text style={[styles.sectionTitle, { color: '#1D1D1F' }]}>
              <Ionicons name="airplane" size={20} color={'#0066CC'} /> Туры в {country.name}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Countries')}
              style={[styles.viewAllButton, { borderColor: '#0066CC' }]}
            >
              <Text style={[styles.viewAllText, { color: '#0066CC' }]}>Все туры</Text>
              <Ionicons name="arrow-forward" size={16} color={'#0066CC'} />
            </TouchableOpacity>
          </View>

          {/* Buy Tours Buttons */}
          <View style={styles.buyToursContainer}>
            {/* Quick Booking */}
            <TouchableOpacity
              style={[styles.quickBookButton, {
                backgroundColor: '#00A86B',
                marginBottom: 12
              }]}
              onPress={() => navigation.navigate('ApiTourSearch')}
              activeOpacity={0.8}
            >
              <Ionicons name="flash" size={20} color="#fff" />
              <Text style={styles.quickBookText}>Забронировать</Text>
            </TouchableOpacity>

            {/* Simple tour search */}
            <TouchableOpacity
              style={[styles.quickBookButton, {
                backgroundColor: '#0066CC',
                marginBottom: 12
              }]}
              onPress={() => navigation.navigate('ApiTourSearch')}
              activeOpacity={0.8}
            >
              <Ionicons name="search" size={20} color="#fff" />
              <Text style={styles.quickBookText}>Посмотреть туры</Text>
            </TouchableOpacity>

          </View>

          {loadingTours ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={'#0066CC'} />
              <Text style={[styles.loadingText, { color: '#6E6E73' }]}>
                Загрузка туров...
              </Text>
            </View>
          ) : tours.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.toursStrip}
            >
              {tours.map(tour => renderTourCard(tour))}
            </ScrollView>
          ) : (
            <View style={[styles.noToursContainer, { backgroundColor: '#FFFFFF' }]}>
              <Ionicons name="airplane-outline" size={40} color={'#6E6E73'} />
              <Text style={[styles.noToursText, { color: '#6E6E73' }]}>
                Туры в данную страну скоро появятся
              </Text>
              <TouchableOpacity
                style={[styles.searchToursButton, { backgroundColor: '#0066CC' }]}
                onPress={() => navigation.navigate('Countries')}
              >
                <Text style={styles.searchToursButtonText}>Искать туры</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Bottom padding */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Gallery Modal */}
      <Modal
        visible={galleryVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGalleryVisible(false)}
      >
        <View style={styles.galleryModal}>
          <TouchableOpacity
            style={styles.galleryCloseButton}
            onPress={() => setGalleryVisible(false)}
          >
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          
          <FlatList
            data={country.images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={currentImageIndex}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            renderItem={({ item }) => (
              <View style={[styles.galleryModalItem, { width }]}>
                <Image
                  source={{ uri: item }}
                  style={[
                    styles.galleryModalImage,
                    { width: width - 40, height: height * 0.7 },
                  ]}
                  resizeMode="contain"
                />
              </View>
            )}
            keyExtractor={(_, index) => index.toString()}
            onMomentumScrollEnd={(e) => {
              const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
              setCurrentImageIndex(newIndex);
            }}
          />
          
          <View style={styles.galleryCounter}>
            <Text style={styles.galleryCounterText}>
              {currentImageIndex + 1} / {country.images.length}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroSection: {
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
  backButton: {
    position: 'absolute',
    top: platform.isIOS ? 50 : 20,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  heroFlag: {
    fontSize: 48,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 22,
  },
  gallerySection: {
    paddingVertical: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitleMargin: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  galleryStrip: {
    paddingHorizontal: 16,
    gap: 12,
  },
  galleryImage: {
    width: 200,
    height: 140,
    borderRadius: 16,
  },
  section: {
    margin: 16,
    padding: 20,
    borderRadius: 20,
  },
  aboutSection: {
    marginTop: 0,
  },
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  aboutIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  aboutTitle: {
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
  },
  aboutText: {
    fontSize: 15,
    lineHeight: 24,
  },
  highlightsGrid: {
    gap: 12,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  highlightCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  highlightText: {
    fontSize: 15,
    flex: 1,
  },
  detailsContainer: {
    paddingTop: 8,
  },
  detailSection: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginLeft: 12,
  },
  detailContent: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 22,
  },
  infoCardsContainer: {
    paddingTop: 16,
  },
  infoCardsGrid: {
    paddingHorizontal: 16,
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
  },
  infoCardContent: {
    marginLeft: 16,
    flex: 1,
  },
  infoCardLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoCardValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  toursSection: {
    paddingTop: 24,
  },
  toursSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  toursStrip: {
    paddingHorizontal: 16,
    gap: 16,
  },
  tourCard: {
    width: 200,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  tourImage: {
    width: '100%',
    height: 120,
  },
  tourBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tourBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  tourInfo: {
    padding: 12,
  },
  tourTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 18,
  },
  tourRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  tourRatingText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  tourReviews: {
    fontSize: 11,
    marginLeft: 4,
  },
  tourPrice: {
    fontSize: 16,
    fontWeight: '700',
  },
  noToursContainer: {
    margin: 16,
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
  },
  noToursText: {
    fontSize: 14,
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  searchToursButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  searchToursButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buyToursContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  buyToursButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 10,
  },
  buyToursText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  quickBookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 10,
  },
  quickBookText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  galleryModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  galleryCloseButton: {
    position: 'absolute',
    top: platform.isIOS ? 50 : 20,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  galleryModalItem: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryModalImage: {
    // ширина/высота задаются inline (useWindowDimensions)
  },
  galleryCounter: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  galleryCounterText: {
    color: '#fff',
    fontSize: 14,
  },
});

