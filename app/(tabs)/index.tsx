import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { router } from 'expo-router';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

export default function DirectMessagesScreen() {
  const { user, signOutUser } = useAuth();
  const client = useMemo(() => generateClient<Schema>(), []);
  const [friends, setFriends] = useState<Schema['Friend']['type'][]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('DirectMessagesScreen mounted, user:', user);
    if (user?.email) {
      fetchFriends();
    }
  }, [user?.email]);

  async function fetchFriends() {
    try {
      const { data: friendsList } = await client.models.Friend.list();
      console.log('DM - All friends from DB:', friendsList);
      console.log('DM - Current user email:', user?.email);

      // Only show friends where the current user is the owner
      const myFriends = friendsList.filter(
        (item) => item !== null && item.userEmail === user?.email
      );
      console.log('DM - My friends after filter:', myFriends);
      setFriends(myFriends);
    } catch (error) {
      console.error('Error fetching friends:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOutUser();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  function openChat(friendEmail: string) {
    // TODO: Navigate to individual chat screen
    router.push({
      pathname: '/chat/[friendEmail]',
      params: { friendEmail },
    });
  }

  function renderFriend({ item }: { item: Schema['Friend']['type'] }) {
    return (
      <TouchableOpacity
        style={styles.friendItem}
        onPress={() => openChat(item.friendEmail)}
      >
        <View style={styles.avatar}>
          <ThemedText style={styles.avatarText}>
            {item.friendEmail.charAt(0).toUpperCase()}
          </ThemedText>
        </View>
        <View style={styles.friendInfo}>
          <ThemedText style={styles.friendEmail}>{item.friendEmail}</ThemedText>
          <ThemedText style={styles.friendSubtext}>
            Tap to start messaging
          </ThemedText>
        </View>
        <View style={styles.chevron}>
          <ThemedText style={styles.chevronText}>›</ThemedText>
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="title" style={styles.headerTitle}>
            Direct Messages
          </ThemedText>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText type="title" style={styles.headerTitle}>
            Direct Messages
          </ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {user?.email || 'Unknown'}
          </ThemedText>
        </View>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Friends List */}
      <FlatList
        data={friends}
        renderItem={renderFriend}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>
              No friends yet. Add friends to start messaging!
            </ThemedText>
            <TouchableOpacity
              style={styles.addFriendsButton}
              onPress={() => router.push('/(tabs)/friends')}
            >
              <ThemedText style={styles.addFriendsButtonText}>
                Go to Friends
              </ThemedText>
            </TouchableOpacity>
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  signOutButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  friendInfo: {
    flex: 1,
  },
  friendEmail: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  friendSubtext: {
    fontSize: 14,
    opacity: 0.6,
  },
  chevron: {
    marginLeft: 8,
  },
  chevronText: {
    fontSize: 28,
    opacity: 0.3,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    opacity: 0.5,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  addFriendsButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addFriendsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
