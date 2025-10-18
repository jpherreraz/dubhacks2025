import { useEffect } from 'react';
import { router, useSegments } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/contexts/auth-context';

export default function Index() {
  const { user, loading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (!loading) {
      console.log('Index: Auth state changed - user:', user?.email, 'loading:', loading);

      if (user) {
        console.log('Index: User is authenticated, navigating to tabs');
        router.replace('/(tabs)');
      } else {
        console.log('Index: User is not authenticated, navigating to login');
        router.replace('/(auth)/login');
      }
    }
  }, [user, loading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
