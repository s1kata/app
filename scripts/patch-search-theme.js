const fs = require('fs');
const path = 'src/screens/ApiTourSearchScreen.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes("useTabBarMetrics")) {
  s = s.replace(
    "import { SafeAreaView } from 'react-native-safe-area-context';",
    "import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';"
  );
  s = s.replace(
    "import { radius, shadows } from '../config/designSystem';\n\nimport type { NavigationProp } from '@react-navigation/native';",
    "import { radius, shadows } from '../config/designSystem';\nimport { useTabBarMetrics } from '../utils/tabBarMetrics';\n\nimport type { NavigationProp } from '@react-navigation/native';\nimport ScreenHeader from '../components/ui/ScreenHeader';\nimport PrimaryButton from '../components/ui/PrimaryButton';"
  );
  // If ScreenHeader already imported later, avoid dup - check
}

if (!s.includes('contentBottomPadding')) {
  s = s.replace(
    "const { apiReady, theme, isDark, currency } = useAppContext();",
    "const { apiReady, theme, isDark, currency, fontScale } = useAppContext();\n  const insets = useSafeAreaInsets();\n  const { contentBottomPadding } = useTabBarMetrics(insets, fontScale);\n  const bottomPad = contentBottomPadding({ includeFab: false, extra: 24 });"
  );
}

s = s.replaceAll("color: '#1D1D1F'", 'color: theme.text');
s = s.replaceAll("color: \"#1D1D1F\"", 'color: theme.text');
s = s.replaceAll("color={'#1D1D1F'}", 'color={theme.text}');
s = s.replaceAll('color={"#1D1D1F"}', 'color={theme.text}');
s = s.replaceAll("? '#1D1D1F' : '#6E6E73'", '? theme.text : theme.secondaryText');
s = s.replaceAll('? "#1D1D1F" : "#6E6E73"', '? theme.text : theme.secondaryText');

// Ensure ScreenHeader / PrimaryButton imports exist once
if (!s.includes("from '../components/ui/ScreenHeader'")) {
  s = s.replace(
    "import type { NavigationProp } from '@react-navigation/native';",
    "import type { NavigationProp } from '@react-navigation/native';\nimport ScreenHeader from '../components/ui/ScreenHeader';\nimport PrimaryButton from '../components/ui/PrimaryButton';"
  );
}

fs.writeFileSync(path, s, 'utf8');
console.log('patched', {
  tabMetrics: s.includes('contentBottomPadding'),
  themeText: s.includes('theme.text'),
  hardBlack: s.includes('#1D1D1F'),
  screenHeader: s.includes('ScreenHeader'),
});
