const fs = require('fs');
const path = 'src/screens/ApiTourSearchScreen.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes("from '../utils/tabBarMetrics'")) {
  s = s.replace(
    "import { radius, shadows } from '../config/designSystem';",
    "import { radius, shadows } from '../config/designSystem';\nimport { useTabBarMetrics } from '../utils/tabBarMetrics';"
  );
}

s = s.replace(
  "edges={['top', 'bottom']} style={[styles.container, { backgroundColor: theme.background }]}",
  "edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}"
);

if (!s.includes('paddingBottom: bottomPad')) {
  s = s.replace(
    '<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>',
    '<ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }} keyboardShouldPersistTaps="handled">'
  );
}

fs.writeFileSync(path, s, 'utf8');
console.log({
  import: s.includes("from '../utils/tabBarMetrics'"),
  pad: s.includes('paddingBottom: bottomPad'),
  edgesTopOnly: (s.match(/edges=\{\['top'\]\}/g) || []).length,
});
