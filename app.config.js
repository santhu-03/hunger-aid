const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export default {
  expo: {
    name: 'HungerAid',
    slug: 'hunger-aid',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'hungeraid',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,

    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.santhu03.HungerAid',
      config: {
        googleMapsApiKey: mapsKey,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'HungerAid needs your location to enable transport request features.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'HungerAid needs your location to enable transport request features.',
        ITSAppUsesNonExemptEncryption: false,
      },
    },

    android: {
      package: 'com.santhu03.HungerAid',
      config: {
        googleMaps: {
          apiKey: mapsKey,
        },
      },
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.POST_NOTIFICATIONS',
      ],
    },

    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },

    updates: {
      url: 'https://u.expo.dev/b969a1e0-ff9f-4791-8eb4-d0c53b299100',
    },
    runtimeVersion: {
      policy: 'appVersion',
    },

    plugins: [
      'expo-router',
      [
        'expo-notifications',
        {
          icon: './assets/images/icon.png',
          color: '#2e7d32',
          androidMode: 'default',
          androidCollapsedTitle: 'HungerAid',
          iosDisplayInForeground: true,
        },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: { backgroundColor: '#000000' },
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Allow HungerAid to access your location for transport requests.',
        },
      ],
      'expo-web-browser',
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },

    extra: {
      googleMapsApiKey: mapsKey,
      router: {},
      eas: {
        projectId: 'b969a1e0-ff9f-4791-8eb4-d0c53b299100',
      },
    },

    owner: 'santhu-03',
  },
};
