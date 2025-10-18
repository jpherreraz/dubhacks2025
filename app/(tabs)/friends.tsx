import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Text,
  ScrollView,
} from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

type Tab = 'friends' | 'requests';

export default function FriendsScreen() {
  const { user } = useAuth();
  const client = useMemo(() => generateClient<Schema>(), []);
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Schema['Friend']['type'][]>([]);
  const [sentRequests, setSentRequests] = useState<Schema['FriendRequest']['type'][]>([]);
  const [receivedRequests, setReceivedRequests] = useState<Schema['FriendRequest']['type'][]>([]);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (user?.email) {
      fetchData();
    }
  }, [user?.email]);

  async function fetchData() {
    try {
      await Promise.all([fetchFriends(), fetchRequests()]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchFriends() {
    try {
      const { data: friendsList } = await client.models.Friend.list();
      const myFriends = friendsList.filter(
        (item) => item !== null && item.userEmail === user?.email
      );
      setFriends(myFriends);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  }

  async function fetchRequests() {
    try {
      const { data: allRequests } = await client.models.FriendRequest.list();
      const validRequests = allRequests.filter((req) => req !== null);
      const sent = validRequests.filter(
        (req) => req.senderEmail === user?.email && req.status === 'PENDING'
      );
      const received = validRequests.filter(
        (req) => req.receiverEmail === user?.email && req.status === 'PENDING'
      );
      setSentRequests(sent);
      setReceivedRequests(received);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  }

  async function handleSendRequest() {
    if (!friendEmail.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(friendEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (friendEmail.toLowerCase() === user?.email?.toLowerCase()) {
      Alert.alert('Error', "You can't send a friend request to yourself");
      return;
    }

    if (friends.some((f) => f.friendEmail.toLowerCase() === friendEmail.toLowerCase())) {
      Alert.alert('Error', 'You are already friends with this person');
      return;
    }

    if (sentRequests.some((r) => r.receiverEmail.toLowerCase() === friendEmail.toLowerCase())) {
      Alert.alert('Error', 'Friend request already sent');
      return;
    }

    setSending(true);
    try {
      const { data: newRequest } = await client.models.FriendRequest.create({
        senderEmail: user?.email || '',
        receiverEmail: friendEmail.trim(),
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });

      if (newRequest) {
        setSentRequests((prev) => [...prev, newRequest]);
        setFriendEmail('');
        setShowAddFriend(false);
        Alert.alert('Success', `Friend request sent to ${friendEmail}!`);
      }
    } catch (error) {
      console.error('Error sending request:', error);
      Alert.alert('Error', 'Failed to send friend request');
    } finally {
      setSending(false);
    }
  }

  async function handleAcceptRequest(request: Schema['FriendRequest']['type']) {
    try {
      await client.models.FriendRequest.update({
        id: request.id,
        status: 'ACCEPTED',
      });

      const now = new Date().toISOString();
      await Promise.all([
        client.models.Friend.create({
          userEmail: user?.email || '',
          friendEmail: request.senderEmail,
          addedAt: now,
        }),
        client.models.Friend.create({
          userEmail: request.senderEmail,
          friendEmail: user?.email || '',
          addedAt: now,
        }),
      ]);

      await fetchData();
      Alert.alert('Success', `You are now friends with ${request.senderEmail}!`);
    } catch (error) {
      console.error('Error accepting request:', error);
      Alert.alert('Error', 'Failed to accept friend request');
    }
  }

  async function handleRejectRequest(request: Schema['FriendRequest']['type']) {
    try {
      await client.models.FriendRequest.update({
        id: request.id,
        status: 'REJECTED',
      });
      setReceivedRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (error) {
      console.error('Error rejecting request:', error);
      Alert.alert('Error', 'Failed to reject request');
    }
  }

  async function handleCancelRequest(request: Schema['FriendRequest']['type']) {
    try {
      await client.models.FriendRequest.delete({ id: request.id });
      setSentRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (error) {
      console.error('Error canceling request:', error);
      Alert.alert('Error', 'Failed to cancel request');
    }
  }

  async function handleRemoveFriend(friend: Schema['Friend']['type']) {
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove ${friend.friendEmail}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await client.models.Friend.delete({ id: friend.id });
              setFriends((prev) => prev.filter((f) => f.id !== friend.id));
            } catch (error) {
              console.error('Error removing friend:', error);
              Alert.alert('Error', 'Failed to remove friend');
            }
          },
        },
      ]
    );
  }

  function renderFriend({ item }: { item: Schema['Friend']['type'] }) {
    const initial = item.friendEmail.charAt(0).toUpperCase();
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-green-500', 'bg-indigo-500'];
    const colorIndex = item.friendEmail.charCodeAt(0) % colors.length;

    return (
      <View className="flex-row items-center justify-between bg-white rounded-2xl p-4 mb-3 shadow-sm">
        <View className="flex-row items-center flex-1">
          <View className={`w-12 h-12 rounded-full ${colors[colorIndex]} items-center justify-center mr-3 shadow-md`}>
            <Text className="text-white text-lg font-bold">{initial}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-gray-900 text-base font-semibold">{item.friendEmail}</Text>
            <Text className="text-gray-500 text-xs mt-0.5">
              Friends since {new Date(item.addedAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          className="bg-red-100 px-4 py-2 rounded-xl active:opacity-70"
          onPress={() => handleRemoveFriend(item)}
        >
          <Text className="text-red-600 text-sm font-semibold">Remove</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderReceivedRequest({ item }: { item: Schema['FriendRequest']['type'] }) {
    const initial = item.senderEmail.charAt(0).toUpperCase();

    return (
      <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
        <View className="flex-row items-center mb-3">
          <View className="w-12 h-12 rounded-full bg-blue-500 items-center justify-center mr-3 shadow-md">
            <Text className="text-white text-lg font-bold">{initial}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-gray-900 text-base font-semibold">{item.senderEmail}</Text>
            <Text className="text-gray-500 text-xs mt-0.5">
              Sent {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
        <View className="flex-row gap-2">
          <TouchableOpacity
            className="flex-1 bg-green-500 py-3 rounded-xl active:opacity-70"
            onPress={() => handleAcceptRequest(item)}
          >
            <Text className="text-white text-sm font-semibold text-center">Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 bg-gray-200 py-3 rounded-xl active:opacity-70"
            onPress={() => handleRejectRequest(item)}
          >
            <Text className="text-gray-700 text-sm font-semibold text-center">Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderSentRequest({ item }: { item: Schema['FriendRequest']['type'] }) {
    const initial = item.receiverEmail.charAt(0).toUpperCase();

    return (
      <View className="flex-row items-center justify-between bg-white rounded-2xl p-4 mb-3 shadow-sm">
        <View className="flex-row items-center flex-1">
          <View className="w-12 h-12 rounded-full bg-gray-400 items-center justify-center mr-3 shadow-md">
            <Text className="text-white text-lg font-bold">{initial}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-gray-900 text-base font-semibold">{item.receiverEmail}</Text>
            <Text className="text-amber-600 text-xs mt-0.5 font-medium">Pending</Text>
          </View>
        </View>
        <TouchableOpacity
          className="bg-orange-100 px-4 py-2 rounded-xl active:opacity-70"
          onPress={() => handleCancelRequest(item)}
        >
          <Text className="text-orange-600 text-sm font-semibold">Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50">
        <View className="pt-16 px-6 pb-4 bg-white border-b border-gray-100">
          <Text className="text-3xl font-bold text-gray-900">Friends</Text>
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
      <View className="pt-16 px-6 pb-4 bg-white border-b border-gray-100">
        <Text className="text-3xl font-bold text-gray-900 mb-1">Friends</Text>
        <Text className="text-gray-500 text-sm">
          {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
          {receivedRequests.length > 0 && ` • ${receivedRequests.length} new ${receivedRequests.length === 1 ? 'request' : 'requests'}`}
        </Text>
      </View>

      {/* Tabs */}
      <View className="flex-row bg-white border-b border-gray-100">
        <TouchableOpacity
          className={`flex-1 py-4 ${activeTab === 'friends' ? 'border-b-2 border-blue-500' : ''}`}
          onPress={() => setActiveTab('friends')}
        >
          <Text className={`text-center font-semibold ${activeTab === 'friends' ? 'text-blue-500' : 'text-gray-500'}`}>
            Friends ({friends.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-4 ${activeTab === 'requests' ? 'border-b-2 border-blue-500' : ''}`}
          onPress={() => setActiveTab('requests')}
        >
          <Text className={`text-center font-semibold ${activeTab === 'requests' ? 'text-blue-500' : 'text-gray-500'}`}>
            Requests ({receivedRequests.length + sentRequests.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Add Friend Section */}
      {activeTab === 'friends' && (
        <>
          {showAddFriend ? (
            <View className="p-4 bg-white border-b border-gray-100">
              <Text className="text-gray-700 text-sm font-semibold mb-2">Enter friend's email</Text>
              <TextInput
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base mb-3"
                placeholder="friend@example.com"
                placeholderTextColor="#999"
                value={friendEmail}
                onChangeText={setFriendEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoFocus
                editable={!sending}
              />
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="flex-1 bg-gray-100 py-3 rounded-xl active:opacity-70"
                  onPress={() => {
                    setShowAddFriend(false);
                    setFriendEmail('');
                  }}
                  disabled={sending}
                >
                  <Text className="text-gray-700 text-center font-semibold">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 bg-blue-500 py-3 rounded-xl active:opacity-70 ${sending ? 'opacity-60' : ''}`}
                  onPress={handleSendRequest}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white text-center font-semibold">Send Request</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View className="p-4 bg-white border-b border-gray-100">
              <TouchableOpacity
                className="bg-blue-500 py-4 rounded-2xl shadow-sm active:opacity-70"
                onPress={() => setShowAddFriend(true)}
              >
                <Text className="text-white text-center text-base font-semibold">+ Add Friend</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Content */}
      {activeTab === 'friends' ? (
        <FlatList
          data={friends}
          renderItem={renderFriend}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <View className="bg-blue-50 w-20 h-20 rounded-full items-center justify-center mb-4">
                <Text className="text-4xl">👥</Text>
              </View>
              <Text className="text-gray-900 text-lg font-semibold mb-2">No friends yet</Text>
              <Text className="text-gray-500 text-center text-sm px-8">
                Send a friend request to start connecting!
              </Text>
            </View>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {receivedRequests.length > 0 && (
            <View className="mb-6">
              <Text className="text-gray-900 text-lg font-bold mb-3">Received</Text>
              {receivedRequests.map((item) => (
                <View key={item.id}>{renderReceivedRequest({ item })}</View>
              ))}
            </View>
          )}
          {sentRequests.length > 0 && (
            <View className="mb-6">
              <Text className="text-gray-900 text-lg font-bold mb-3">Sent</Text>
              {sentRequests.map((item) => (
                <View key={item.id}>{renderSentRequest({ item })}</View>
              ))}
            </View>
          )}
          {receivedRequests.length === 0 && sentRequests.length === 0 && (
            <View className="flex-1 items-center justify-center py-20">
              <View className="bg-gray-100 w-20 h-20 rounded-full items-center justify-center mb-4">
                <Text className="text-4xl">📭</Text>
              </View>
              <Text className="text-gray-900 text-lg font-semibold mb-2">No pending requests</Text>
              <Text className="text-gray-500 text-center text-sm">
                All caught up!
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
