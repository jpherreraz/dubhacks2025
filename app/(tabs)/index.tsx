import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Text,
} from 'react-native';
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
    if (user?.email) {
      fetchFriends();
    }
  }, [user?.email]);

  async function fetchFriends() {
    try {
      const { data: friendsList } = await client.models.Friend.list();
      const myFriends = friendsList.filter(
        (item) => item !== null && item.userEmail === user?.email
      );
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
    router.push({
      pathname: '/chat/[friendEmail]',
      params: { friendEmail },
    });
  }

  function renderFriend({ item }: { item: Schema['Friend']['type'] }) {
    const initial = item.friendEmail.charAt(0).toUpperCase();
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-green-500', 'bg-orange-500'];
    const colorIndex = item.friendEmail.charCodeAt(0) % colors.length;

    return (
      <TouchableOpacity
        className="flex-row items-center bg-white rounded-2xl p-4 mb-3 shadow-sm active:opacity-70"
        onPress={() => openChat(item.friendEmail)}
      >
        <View className={`w-14 h-14 rounded-full ${colors[colorIndex]} items-center justify-center mr-4 shadow-md`}>
          <Text className="text-white text-xl font-bold">{initial}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-gray-900 text-base font-semibold mb-1">
            {item.friendEmail}
          </Text>
          <Text className="text-gray-500 text-sm">Tap to message</Text>
        </View>
        <View className="ml-2">
          <Text className="text-gray-300 text-3xl">›</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50">
        <View className="pt-2 px-6 pb-4 bg-white border-b border-gray-100">
          <Text className="text-3xl font-bold text-gray-900">Messages</Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="pt-2 px-6 pb-4 bg-white border-b border-gray-100">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-3xl font-bold text-gray-900">Messages</Text>
          <TouchableOpacity
            className="bg-red-500 px-4 py-2 rounded-xl active:opacity-70"
            onPress={handleSignOut}
          >
            <Text className="text-white text-sm font-semibold">Sign Out</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-gray-500 text-sm">{user?.email || 'Unknown'}</Text>
      </View>

      {/* Friends List */}
      <FlatList
        data={friends}
        renderItem={renderFriend}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <View className="bg-blue-50 w-24 h-24 rounded-full items-center justify-center mb-6">
              <Text className="text-5xl">💬</Text>
            </View>
            <Text className="text-gray-900 text-xl font-semibold mb-2">
              No conversations yet
            </Text>
            <Text className="text-gray-500 text-center text-base mb-8 px-8">
              Add friends to start chatting and stay connected
            </Text>
            <TouchableOpacity
              className="bg-blue-500 px-8 py-4 rounded-2xl shadow-lg active:opacity-70"
              onPress={() => router.push('/(tabs)/friends')}
            >
              <Text className="text-white text-base font-semibold">Find Friends</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}
