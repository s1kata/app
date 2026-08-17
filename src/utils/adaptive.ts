import { Dimensions, PixelRatio } from 'react-native';

function win() {
  return Dimensions.get('window');
}

export const BREAKPOINTS = {
  xs: 360,
  sm: 375,
  md: 414,
  lg: 768,
  xl: 1024,
};

const REF_WIDTH = 390;
const REF_HEIGHT = 844;

const getFontScale = () => Math.min(PixelRatio.getFontScale(), 1.35);

export function scaleByWidth(size: number, factor: number = 0.5): number {
  const SCREEN_WIDTH = win().width;
  const scaled = (SCREEN_WIDTH / REF_WIDTH) * size;
  return Math.round(size + (scaled - size) * factor);
}

export function scaleByHeight(size: number, factor: number = 0.5): number {
  const SCREEN_HEIGHT = win().height;
  const scaled = (SCREEN_HEIGHT / REF_HEIGHT) * size;
  return Math.round(size + (scaled - size) * factor);
}

export function getResponsiveValue<T>(values: { xs?: T; sm?: T; md?: T; lg?: T; xl?: T; default: T }): T {
  const SCREEN_WIDTH = win().width;
  if (SCREEN_WIDTH >= BREAKPOINTS.xl) return values.xl ?? values.lg ?? values.default;
  if (SCREEN_WIDTH >= BREAKPOINTS.lg) return values.lg ?? values.md ?? values.default;
  if (SCREEN_WIDTH >= BREAKPOINTS.md) return values.md ?? values.sm ?? values.default;
  if (SCREEN_WIDTH >= BREAKPOINTS.sm) return values.sm ?? values.xs ?? values.default;
  return values.xs ?? values.default;
}

let Platform: any = null;
function getPlatform() {
  if (!Platform) {
    try {
      const RN = require('react-native');
      Platform = RN?.Platform;
    } catch {
      /* ignore */
    }
  }
  return Platform;
}

function getPlatformOS(): string {
  try {
    return getPlatform()?.OS || 'unknown';
  } catch {
    return 'unknown';
  }
}

export const adaptive = {
  get screenWidth() {
    return win().width;
  },
  get screenHeight() {
    return win().height;
  },

  isExtraSmall: () => win().width < BREAKPOINTS.xs,
  isSmall: () => win().width >= BREAKPOINTS.xs && win().width < BREAKPOINTS.sm,
  isMedium: () => win().width >= BREAKPOINTS.sm && win().width < BREAKPOINTS.md,
  isLarge: () => win().width >= BREAKPOINTS.md && win().width < BREAKPOINTS.lg,
  isExtraLarge: () => win().width >= BREAKPOINTS.lg,

  isCompact: () => win().width < BREAKPOINTS.sm,
  isRegular: () => win().width >= BREAKPOINTS.sm && win().width < BREAKPOINTS.lg,
  isWide: () => win().width >= BREAKPOINTS.lg,
  get isSmallScreen() {
    return win().width < BREAKPOINTS.sm;
  },

  get isIOS() {
    return getPlatformOS() === 'ios';
  },
  get isAndroid() {
    return getPlatformOS() === 'android';
  },

  spacing: {
    get tiny() {
      return scaleByWidth(5, 0.6);
    },
    get small() {
      return scaleByWidth(10, 0.6);
    },
    get medium() {
      return scaleByWidth(14, 0.5);
    },
    get large() {
      return scaleByWidth(18, 0.5);
    },
    get xlarge() {
      return scaleByWidth(22, 0.5);
    },
    get xxlarge() {
      return scaleByWidth(28, 0.5);
    },
  },

  fontSize: {
    caption: () => Math.round(scaleByWidth(13, 0.4) * getFontScale()),
    body: () => Math.round(scaleByWidth(15, 0.4) * getFontScale()),
    subtitle: () => Math.round(scaleByWidth(17, 0.4) * getFontScale()),
    title: () => Math.round(scaleByWidth(19, 0.4) * getFontScale()),
    headline: () => Math.round(scaleByWidth(22, 0.4) * getFontScale()),
    display: () => Math.round(scaleByWidth(26, 0.4) * getFontScale()),
  },

  scaleFont: (size: number) => Math.round(size * getFontScale()),

  iconSize: {
    get small() {
      return scaleByWidth(18, 0.5);
    },
    get medium() {
      return scaleByWidth(22, 0.5);
    },
    get large() {
      return scaleByWidth(26, 0.5);
    },
    get xlarge() {
      return scaleByWidth(30, 0.5);
    },
  },

  borderRadius: {
    get small() {
      return scaleByWidth(7, 0.4);
    },
    get medium() {
      return scaleByWidth(10, 0.4);
    },
    get large() {
      return scaleByWidth(14, 0.4);
    },
    get xlarge() {
      return scaleByWidth(18, 0.4);
    },
  },

  card: {
    get padding() {
      return scaleByWidth(14, 0.5);
    },
    get margin() {
      return scaleByWidth(10, 0.5);
    },
    get borderRadius() {
      return scaleByWidth(14, 0.4);
    },
  },

  button: {
    get height() {
      return Math.max(44, scaleByWidth(48, 0.35));
    },
    get paddingHorizontal() {
      return scaleByWidth(18, 0.5);
    },
    get paddingVertical() {
      return scaleByWidth(10, 0.4);
    },
    get borderRadius() {
      return scaleByWidth(12, 0.4);
    },
  },

  input: {
    get height() {
      return Math.max(48, scaleByWidth(52, 0.35));
    },
    get paddingHorizontal() {
      return scaleByWidth(14, 0.5);
    },
    get borderRadius() {
      return scaleByWidth(12, 0.4);
    },
  },

  image: {
    get thumbnail() {
      return scaleByWidth(70, 0.5);
    },
    get small() {
      return scaleByWidth(90, 0.5);
    },
    get medium() {
      return scaleByWidth(140, 0.5);
    },
    get large() {
      return scaleByWidth(220, 0.5);
    },
  },

  list: {
    get itemHeight() {
      return scaleByWidth(66, 0.4);
    },
    separatorHeight: 1,
  },

  modal: {
    get maxWidth() {
      return Math.min(win().width - scaleByWidth(32), 400);
    },
    get padding() {
      return scaleByWidth(20, 0.5);
    },
  },

  scale: (size: number, factor: number = 0.5) => {
    const SCREEN_WIDTH = win().width;
    const scaled = (SCREEN_WIDTH / REF_WIDTH) * size;
    return Math.round(size + (scaled - size) * factor);
  },
  scaleByWidth,
  scaleByHeight,
  getResponsiveValue,

  wp: (percentage: number) => (win().width * percentage) / 100,
  hp: (percentage: number) => (win().height * percentage) / 100,

  isTablet: () => {
    const { width, height } = win();
    const aspectRatio = height / width;
    return aspectRatio < 1.6 && Math.min(width, height) >= 600;
  },

  isVerySmall: () => win().width < 340,
  isVeryLarge: () => win().width > 500,

  getHorizontalPadding: () => {
    const w = win().width;
    if (w < 360) return 12;
    if (w < 400) return 16;
    return scaleByWidth(20, 0.5);
  },
  getVerticalPadding: () => scaleByWidth(14, 0.4),
};

export type AdaptiveSize = keyof typeof adaptive.spacing;
export type AdaptiveFontSize = keyof typeof adaptive.fontSize;
export type AdaptiveIconSize = keyof typeof adaptive.iconSize;
