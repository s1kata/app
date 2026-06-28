import { i18n } from '../config/i18n';
import type { NetworkIssue } from '../services/NetworkService';

export function getNetworkIssueTitle(issue: NetworkIssue): string {
  if (issue === 'offline') return i18n.t('network.offlineTitle');
  return i18n.t('network.backendUnreachableTitle');
}

export function getNetworkIssueMessage(issue: NetworkIssue): string {
  if (issue === 'offline') return i18n.t('network.offlineBanner');
  return i18n.t('network.backendUnreachableBanner');
}

export function getNetworkRestoredMessage(): string {
  return i18n.t('network.restoredBanner');
}

/** @deprecated */
export function getNetworkBlockTitle(reason: NetworkIssue): string {
  return getNetworkIssueTitle(reason);
}

/** @deprecated */
export function getNetworkBlockBody(reason: NetworkIssue): string {
  return getNetworkIssueMessage(reason);
}

/** @deprecated */
export function getNetworkBlockErrorMessage(reason: NetworkIssue | null): string {
  return getNetworkIssueMessage(reason);
}
