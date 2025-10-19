import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Text,
  Modal,
} from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { router } from 'expo-router';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { BOT_EMAIL } from '@/lib/bedrock';

export default function DirectMessagesScreen() {
  const { user, signOutUser } = useAuth();
  const client = useMemo(() => generateClient<Schema>(), []);
  const [friends, setFriends] = useState<Schema['Friend']['type'][]>([]);
  const [loading, setLoading] = useState(true);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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

  function handleSignOut() {
    console.log('handleSignOut: Button pressed, showing modal');
    setShowSignOutModal(true);
  }

  async function confirmSignOut() {
    console.log('confirmSignOut: User confirmed, calling signOutUser');
    setSigningOut(true);
    try {
      await signOutUser();
      console.log('confirmSignOut: signOutUser completed successfully');
      setShowSignOutModal(false);
      // The auth context will update and trigger navigation
    } catch (error) {
      console.error('confirmSignOut: Error signing out:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
      setSigningOut(false);
    }
  }

  function openChat(friendEmail: string) {
    router.push({
      pathname: '/chat/[friendEmail]',
      params: { friendEmail },
    });
  }

  function renderFriend({ item }: { item: Schema['Friend']['type'] | { id: string; friendEmail: string; isBot: boolean } }) {
    const isBot = 'isBot' in item && item.isBot;
    const initial = item.friendEmail.charAt(0).toUpperCase();
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-green-500', 'bg-orange-500'];
    const colorIndex = item.friendEmail.charCodeAt(0) % colors.length;

    return (
      <TouchableOpacity
        className="flex-row items-center bg-white rounded-2xl p-4 mb-3 shadow-sm active:opacity-70"
        onPress={() => openChat(item.friendEmail)}
      >
        <View className={`w-14 h-14 rounded-full ${isBot ? 'bg-purple-500' : colors[colorIndex]} items-center justify-center mr-4 shadow-md ${isBot ? 'border-2 border-purple-300' : ''}`}>
          <Text className="text-white text-xl font-bold">{isBot ? '🤖' : initial}</Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <Text className="text-gray-900 text-base font-semibold">
              {isBot ? 'AI Assistant' : item.friendEmail}
            </Text>
            {isBot && (
              <View className="bg-purple-100 px-2 py-0.5 rounded-full">
                <Text className="text-purple-600 text-xs font-semibold">BOT</Text>
              </View>
            )}
          </View>
          <Text className="text-gray-500 text-sm">
            {isBot ? 'Ask me anything!' : 'Tap to message'}
          </Text>
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
        data={[
          // Always show bot as first contact
          { id: 'bot', friendEmail: BOT_EMAIL, isBot: true },
          ...friends
        ]}
        renderItem={renderFriend}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={null}
      />

      {/* Sign Out Confirmation Modal */}
      <Modal
        visible={showSignOutModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => !signingOut && setShowSignOutModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center px-8">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
            <Text className="text-2xl font-bold text-gray-900 mb-3">
              Sign Out
            </Text>
            <Text className="text-gray-600 text-base mb-6">
              Are you sure you want to sign out?
            </Text>

            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 bg-gray-100 py-4 rounded-2xl active:opacity-70"
                onPress={() => {
                  console.log('User cancelled sign out');
                  setShowSignOutModal(false);
                }}
                disabled={signingOut}
              >
                <Text className="text-gray-700 text-center text-base font-semibold">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 bg-red-500 py-4 rounded-2xl active:opacity-70 ${
                  signingOut ? 'opacity-60' : ''
                }`}
                onPress={confirmSignOut}
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white text-center text-base font-semibold">
                    Sign Out
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
