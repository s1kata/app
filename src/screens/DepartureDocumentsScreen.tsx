import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { sotaCrmService } from '../services/SotaCrmService';
import { DepartureDocument, SotaBooking } from '../types/index';
import { logger } from '../utils/logger';

export default function DepartureDocumentsScreen({ navigation }: any) {
  const { user, theme } = useAppContext();
  const [departureDocuments, setDepartureDocuments] = useState<DepartureDocument[]>([]);
  const [crmBookingsWithDocuments, setCrmBookingsWithDocuments] = useState<Array<{ booking: SotaBooking; documents: DepartureDocument[] }>>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState<Set<string>>(new Set());
  
  // Проверка, является ли пользователь гостем
  const isGuest = user?.uid?.startsWith('guest_') || user?.isAnonymous === true;

  useEffect(() => {
    if (!isGuest && user?.email) {
      loadDepartureDocuments();
    }
  }, [user]);

  const loadDepartureDocuments = async () => {
    try {
      setLoading(true);
      
      if (!user?.email) {
        return;
      }

      // Проверяем, настроены ли учетные данные для SOTA
      if (!sotaCrmService.hasCredentials()) {
        logger.debug('[DepartureDocumentsScreen] SOTA credentials not configured');
        return;
      }

      // Получаем телефон из user объекта
      const userPhone = (user as any).phoneNumber || (user as any).phone || undefined;
      
      // Получаем все документы на вылет для пользователя
      const response = await sotaCrmService.getUserDepartureDocuments(
        user.email || undefined,
        userPhone
      );

      if (response.success && response.data) {
        // Сохраняем бронирования с документами для отображения
        setCrmBookingsWithDocuments(response.data);
        
        // Собираем все документы в один массив
        const allDocuments: DepartureDocument[] = [];
        response.data.forEach(
          ({ documents }: { documents: DepartureDocument[] }) => {
            allDocuments.push(...documents);
          }
        );
        setDepartureDocuments(allDocuments);
      }
    } catch (error: any) {
      logger.error('[DepartureDocumentsScreen] Error loading departure documents:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDepartureDocuments();
  };

  const handleDocumentPress = async (doc: DepartureDocument, bookingId: string) => {
    if (loadingDocuments.has(doc.id)) {
      return;
    }

    try {
      setLoadingDocuments(prev => new Set(prev).add(doc.id));
      
      // Используем fileUrl из документа или запрашиваем через API
      let docUrl = doc.fileUrl || await sotaCrmService.getDocumentUrl(doc.id, bookingId);
      
      if (docUrl) {
        const canOpen = await Linking.canOpenURL(docUrl);
        if (canOpen) {
          await Linking.openURL(docUrl);
        } else {
          Alert.alert('Ошибка', 'Не удалось открыть документ');
        }
      } else {
        Alert.alert('Ошибка', 'Не удалось загрузить документ. URL документа недоступен.');
      }
    } catch (error: any) {
      logger.error('[DepartureDocumentsScreen] Error opening document:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить документ. Попробуйте позже.');
    } finally {
      setLoadingDocuments(prev => {
        const newSet = new Set(prev);
        newSet.delete(doc.id);
        return newSet;
      });
    }
  };

  const getDocumentTypeIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type.toLowerCase()) {
      case 'ticket':
      case 'билет':
        return 'airplane';
      case 'voucher':
      case 'ваучер':
        return 'document-text';
      case 'insurance':
      case 'страховка':
        return 'shield-checkmark';
      case 'passport':
      case 'паспорт':
        return 'id-card';
      default:
        return 'document';
    }
  };

  const getDocumentTypeName = (type: string): string => {
    switch (type.toLowerCase()) {
      case 'ticket':
      case 'билет':
        return 'Билет';
      case 'voucher':
      case 'ваучер':
        return 'Ваучер';
      case 'insurance':
      case 'страховка':
        return 'Страховка';
      case 'passport':
      case 'паспорт':
        return 'Паспорт';
      default:
        return 'Документ';
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr || typeof dateStr !== 'string') return '—';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  if (loading && crmBookingsWithDocuments.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{i18n.t('documents.departureTitle')}</Text>
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{i18n.t('documents.departureTitle')}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.documentsContainer}>
          {crmBookingsWithDocuments.length > 0 ? (
            crmBookingsWithDocuments.map(({ booking, documents }) => {
              if (documents.length === 0) return null;
              
              const departureDate = booking.departureDate ? new Date(booking.departureDate) : null;
              const isUpcoming = departureDate && !Number.isNaN(departureDate.getTime()) && departureDate >= new Date();
              
              return (
                <View key={booking.id} style={[styles.bookingDocumentsCard, { backgroundColor: theme.card, shadowColor: theme.shadow }]}>
                  <View style={styles.bookingDocumentsHeader}>
                    <View style={styles.bookingDocumentsInfo}>
                      <Text style={[styles.bookingDocumentsTourName, { color: theme.text }]} numberOfLines={2}>
                        {booking.tourName}
                      </Text>
                      <View style={styles.bookingDocumentsMeta}>
                        <View style={styles.bookingDocumentsMetaItem}>
                          <Ionicons name="calendar" size={14} color={theme.secondaryText} />
                          <Text style={[styles.bookingDocumentsMetaText, { color: theme.secondaryText }]}>
                            Вылет: {formatDate(booking.departureDate)}
                          </Text>
                        </View>
                        {booking.bookingNumber && (
                          <View style={styles.bookingDocumentsMetaItem}>
                            <Ionicons name="receipt" size={14} color={theme.secondaryText} />
                            <Text style={[styles.bookingDocumentsMetaText, { color: theme.secondaryText }]}>
                              № {booking.bookingNumber}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {isUpcoming && (
                      <View style={[styles.upcomingBadge, { backgroundColor: theme.success }]}>
                        <Text style={[styles.upcomingBadgeText, { color: theme.surface }]}>Предстоящий</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.documentsList}>
                    {documents.map((doc) => (
                      <TouchableOpacity
                        key={doc.id}
                        style={[styles.documentItem, { borderBottomColor: theme.border }]}
                        onPress={() => handleDocumentPress(doc, doc.bookingId)}
                        disabled={loadingDocuments.has(doc.id)}
                      >
                        <Ionicons
                          name={getDocumentTypeIcon(doc.documentType)}
                          size={20}
                          color={theme.primary}
                        />
                        <View style={styles.documentInfo}>
                          <Text style={[styles.documentName, { color: theme.text }]}>
                            {doc.fileName || getDocumentTypeName(doc.documentType)}
                          </Text>
                          {doc.description && (
                            <Text style={[styles.documentDescription, { color: theme.secondaryText }]}>{doc.description}</Text>
                          )}
                        </View>
                        {loadingDocuments.has(doc.id) ? (
                          <ActivityIndicator size="small" color={theme.primary} />
                        ) : (
                          <Ionicons name="download-outline" size={20} color={theme.primary} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconContainer, { backgroundColor: theme.secondaryBackground }]}>
                <Ionicons name="document-outline" size={64} color={theme.inactive} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{i18n.t('documents.noDocuments')}</Text>
              <Text style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
                {i18n.t('documents.emptyDesc')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentsContainer: {
    padding: 20,
    gap: 16,
  },
  bookingDocumentsCard: {
    borderRadius: 20,
    padding: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  bookingDocumentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  bookingDocumentsInfo: {
    flex: 1,
    marginRight: 12,
  },
  bookingDocumentsTourName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  bookingDocumentsMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  bookingDocumentsMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bookingDocumentsMetaText: {
    fontSize: 13,
  },
  upcomingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  upcomingBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  documentsList: {
    gap: 0,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  documentDescription: {
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});
