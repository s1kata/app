import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Circle, Path } from 'react-native-svg';

const PLANE_PATH =
  'M16 35.4 L34.5 31.7 L45.8 20.4 C47.1 19.1 49.2 19.1 50.5 20.4 C51.8 21.7 51.8 23.8 50.5 25.1 L39.2 36.4 L35.5 54.9 L31.4 50.8 L32.7 40.3 L25.4 47.6 L20.4 46.3 L27.7 39 L17.2 40.3 Z';

const ROUNDED_RX = 14;
const VIEW_SIZE = 64;

type AppLogoShape = 'circle' | 'rounded';

type AppLogoProps = {
  size?: number;
  bordered?: boolean;
  borderColor?: string;
  backgroundColor?: string;
  /** circle — профиль, главная; rounded — сплэш (как иконка приложения) */
  shape?: AppLogoShape;
};

export default function AppLogo({
  size = 88,
  bordered = false,
  borderColor = '#0066CC',
  backgroundColor = 'transparent',
  shape = 'circle',
}: AppLogoProps) {
  const uid = useId().replace(/:/g, '');
  const borderWidth = bordered ? Math.max(2, Math.round(size * 0.04)) : 0;
  const logoSize = Math.max(8, size - borderWidth * 2 - 6);
  const isCircle = shape === 'circle';
  const outerRadius = isCircle ? size / 2 : (size * ROUNDED_RX) / VIEW_SIZE;

  const skyId = `sky-${uid}`;
  const topLightId = `topLight-${uid}`;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: outerRadius,
          borderWidth,
          borderColor,
          backgroundColor,
        },
      ]}
    >
      <Svg width={logoSize} height={logoSize} viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}>
        <Defs>
          <LinearGradient id={skyId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#0A5BFF" stopOpacity="1" />
            <Stop offset="55%" stopColor="#0F8DFF" stopOpacity="1" />
            <Stop offset="100%" stopColor="#13C2FF" stopOpacity="1" />
          </LinearGradient>
          <RadialGradient id={topLightId} cx="30%" cy="20%" r="72%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.24" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {isCircle ? (
          <>
            <Circle cx="32" cy="32" r="32" fill={`url(#${skyId})`} />
            <Circle cx="32" cy="32" r="32" fill={`url(#${topLightId})`} />
          </>
        ) : (
          <>
            <Rect width="64" height="64" rx={ROUNDED_RX} fill={`url(#${skyId})`} />
            <Rect width="64" height="64" rx={ROUNDED_RX} fill={`url(#${topLightId})`} />
          </>
        )}

        <Path
          d="M10 44 C14 29, 25 20, 39 20 C47 20, 53 23, 57 29"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.4"
        />
        <Path
          d="M13 49 C18 35, 28 27, 40 27"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.15"
          strokeLinecap="round"
          opacity="0.2"
        />
        <Path d={PLANE_PATH} fill="#0044a8" opacity={0.22} transform="translate(0 1.4)" />
        <Path d={PLANE_PATH} fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
