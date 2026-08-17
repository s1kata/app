/**
 * Навигация между табами / корневым стеком без «мёртвых» кнопок.
 */
export function getRootNavigation(navigation: any): any {
  let nav = navigation;
  let guard = 0;
  while (nav?.getParent?.() && guard < 8) {
    nav = nav.getParent();
    guard += 1;
  }
  return nav || navigation;
}

/** Перейти на экран корневого стека (Login, Register, MainTabs…) */
export function navigateRoot(navigation: any, name: string, params?: object) {
  try {
    getRootNavigation(navigation).navigate(name, params);
  } catch {
    try {
      navigation.navigate(name, params);
    } catch {
      /* ignore */
    }
  }
}

/** Перейти на вкладку (и опционально экран внутри) */
export function navigateTab(
  navigation: any,
  tab: 'Home' | 'Search' | 'Favorites' | 'Bookings' | 'Profile',
  screen?: string,
  params?: object,
) {
  const parent = navigation?.getParent?.() || navigation;
  try {
    if (screen) {
      parent.navigate(tab, { screen, params });
    } else {
      parent.navigate(tab);
    }
  } catch {
    try {
      getRootNavigation(navigation).navigate('MainTabs', {
        screen: tab,
        params: screen ? { screen, params } : undefined,
      });
    } catch {
      /* ignore */
    }
  }
}

export function safeGoBack(navigation: any, fallbackTab: 'Home' | 'Search' = 'Home') {
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
    return;
  }
  navigateTab(navigation, fallbackTab);
}
