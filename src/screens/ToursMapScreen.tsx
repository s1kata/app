/**
 * Карта туров / отелей (WebView + Leaflet) — без native maps, OTA-friendly.
 * Пины из текущей выдачи; тап → ApiTourDetails.
 */
import React, { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ui/ScreenHeader';
import { useAppContext } from '../contexts/AppContext';
import { i18n } from '../config/i18n';
import { safeGoBack } from '../utils/navHelpers';
import type { NavigationProp, RouteProp } from '@react-navigation/native';

export type ToursMapPin = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  price?: number;
  tourId?: string;
};

type Params = {
  title?: string;
  pins: ToursMapPin[];
};

type Props = {
  navigation: NavigationProp<Record<string, object | undefined>>;
  route: RouteProp<{ ToursMap: Params }, 'ToursMap'>;
};

function buildHtml(pins: ToursMapPin[], isDark: boolean): string {
  const safe = pins
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({
      id: String(p.id),
      lat: p.lat,
      lng: p.lng,
      title: String(p.title || '').slice(0, 80),
      price: typeof p.price === 'number' ? p.price : null,
      tourId: p.tourId ? String(p.tourId) : '',
    }));
  const bg = isDark ? '#12122E' : '#F5F7FA';
  const fg = isDark ? '#F5F7FA' : '#12122E';
  const json = JSON.stringify(safe).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{height:100%;margin:0;background:${bg}}
  .price{font-weight:700;color:#12122E}
</style>
</head><body>
<div id="map"></div>
<script>
  var pins = ${json};
  var map = L.map('map', { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  var bounds = [];
  pins.forEach(function(p) {
    var m = L.marker([p.lat, p.lng]).addTo(map);
    var priceTxt = p.price != null ? ('от ' + Math.round(p.price).toLocaleString('ru-RU') + ' ₽') : '';
    m.bindPopup('<div class="price">' + priceTxt + '</div><div style="color:${fg};margin-top:4px">' +
      (p.title || '') + '</div>');
    m.on('click', function() {
      if (p.tourId && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'openTour', tourId: p.tourId }));
      }
    });
    bounds.push([p.lat, p.lng]);
  });
  if (bounds.length === 1) map.setView(bounds[0], 11);
  else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
  else map.setView([55.75, 37.62], 4);
</script>
</body></html>`;
}

export default function ToursMapScreen({ navigation, route }: Props) {
  const { theme, isDark } = useAppContext();
  const pins = Array.isArray(route.params?.pins) ? route.params.pins : [];
  const title = route.params?.title?.trim() || i18n.t('hotTours.onMap');
  const html = useMemo(() => buildHtml(pins, !!isDark), [pins, isDark]);

  if (!pins.length) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <ScreenHeader title={title} onBack={() => safeGoBack(navigation, 'Home')} noSafeTop />
        <View style={styles.empty}>
          <Text style={{ color: theme.secondaryText, textAlign: 'center' }}>
            {i18n.t('map.noCoords')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScreenHeader
        title={title}
        subtitle={`${pins.length} ${i18n.t('map.pinsLabel')}`}
        onBack={() => safeGoBack(navigation, 'Home')}
        noSafeTop
      />
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.map}
        onMessage={(e) => {
          try {
            const data = JSON.parse(e.nativeEvent.data);
            if (data?.type === 'openTour' && data.tourId) {
              navigation.navigate('ApiTourDetails', {
                tourId: String(data.tourId),
                currency: 'RUB',
              });
            }
          } catch {
            /* ignore */
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  map: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
