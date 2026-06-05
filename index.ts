// Sentry до остальных импортов приложения (ES modules hoisting)
import './src/monitoring/sentryInit';
import { setupDevLogging } from './src/utils/setupDevLogging';

setupDevLogging();

import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';

// Keep native splash visible until we explicitly hide it (avoids white screen after splash)
SplashScreen.preventAutoHideAsync().catch(() => {});

import App from './App';

registerRootComponent(App);
