import 'react-native-get-random-values';
import '../global.css';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { configureAmplify } from '@/lib/amplify-config';

// Configure Amplify
configureAmplify();

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    console.log('RootLayout: Auth state - user:', user?.email, 'segments:', segments);

    if (!user && !inAuthGroup) {
      // Redirect to login if not authenticated
      console.log('RootLayout: Redirecting to login');
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      // Redirect to tabs if authenticated and trying to access auth pages
      console.log('RootLayout: Redirecting to tabs');
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[friendEmail]" options={{ headerShown: false }} />
        <Stack.Screen name="server/[serverId]" options={{ headerShown: false }} />
        <Stack.Screen name="server/settings/[serverId]" options={{ headerShown: false }} />
        <Stack.Screen name="server/channels/[serverId]" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
