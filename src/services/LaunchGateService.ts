import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const AGE_GATE_KEY = 'ageGateAcceptedAt';
const CONSENT_OK_KEY = 'consentAcceptedAt';

export type LaunchGateState = {
  ageGateAccepted: boolean;
  consentAccepted: boolean;
};

class LaunchGateService {
  async getGateState(): Promise<LaunchGateState> {
    try {
      const [ageRaw, consentRaw] = await Promise.all([
        AsyncStorage.getItem(AGE_GATE_KEY),
        AsyncStorage.getItem(CONSENT_OK_KEY),
      ]);
      return {
        ageGateAccepted: !!ageRaw,
        consentAccepted: !!consentRaw,
      };
    } catch (error) {
      logger.warn('[LaunchGate] Failed to read gate state:', error);
      return { ageGateAccepted: false, consentAccepted: false };
    }
  }

  async acceptAgeGate(): Promise<void> {
    try {
      await AsyncStorage.setItem(AGE_GATE_KEY, new Date().toISOString());
    } catch (error) {
      logger.warn('[LaunchGate] Failed to persist age gate:', error);
    }
  }

  async acceptConsent(): Promise<void> {
    try {
      await AsyncStorage.setItem(CONSENT_OK_KEY, new Date().toISOString());
    } catch (error) {
      logger.warn('[LaunchGate] Failed to persist consent:', error);
    }
  }
}

export const launchGateService = new LaunchGateService();
