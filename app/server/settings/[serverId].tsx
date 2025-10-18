import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { router, useLocalSearchParams } from 'expo-router';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

export default function ServerSettingsScreen() {
  const { user } = useAuth();
  const { serverId, serverName, ownerEmail } = useLocalSearchParams<{
    serverId: string;
    serverName: string;
    ownerEmail: string;
  }>();
  const client = useMemo(() => generateClient<Schema>(), []);
  const [members, setMembers] = useState<Schema['ServerMember']['type'][]>([]);
  const [friends, setFriends] = useState<Schema['Friend']['type'][]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [adding, setAdding] = useState(false);

  const isOwner = user?.email === ownerEmail;

  useEffect(() => {
    if (user?.email && serverId) {
      fetchMembers();
      fetchFriends();
    }
  }, [user?.email, serverId]);

  async function fetchMembers() {
    try {
      setLoading(true);
      const { data: allMembers } = await client.models.ServerMember.list();
      const serverMembers = allMembers.filter(
        (m) => m !== null && m.serverId === serverId
      );
      setMembers(serverMembers);
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchFriends() {
    try {
      const { data: allFriends } = await client.models.Friend.list();
      const userFriends = allFriends.filter(
        (f) => f !== null && f.userEmail === user?.email
      );
      setFriends(userFriends);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  }

  async function handleAddMember(email: string) {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    // Check if already a member
    const alreadyMember = members.some((m) => m.userEmail === email.trim());
    if (alreadyMember) {
      Alert.alert('Error', 'This user is already a member');
      return;
    }

    setAdding(true);
    try {
      await client.models.ServerMember.create({
        serverId: serverId,
        userEmail: email.trim(),
        joinedAt: new Date().toISOString(),
      });

      setShowAddModal(false);
      setEmailInput('');
      await fetchMembers();
      Alert.alert('Success', 'Member added successfully!');
    } catch (error) {
      console.error('Error adding member:', error);
      Alert.alert('Error', 'Failed to add member');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(memberId: string, memberEmail: string) {
    if (memberEmail === ownerEmail) {
      Alert.alert('Error', 'Cannot remove the server owner');
      return;
    }

    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberEmail.split('@')[0]}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await client.models.ServerMember.delete({ id: memberId });
              await fetchMembers();
              Alert.alert('Success', 'Member removed');
            } catch (error) {
              console.error('Error removing member:', error);
              Alert.alert('Error', 'Failed to remove member');
            }
          },
        },
      ]
    );
  }

  function renderMember({ item }: { item: Schema['ServerMember']['type'] }) {
    const displayName = item.userEmail.split('@')[0];
    const isMemberOwner = item.userEmail === ownerEmail;

    return (
      <View className="flex-row items-center bg-white rounded-2xl p-4 mb-3 shadow-sm">
        <View className="w-12 h-12 rounded-full bg-blue-500 items-center justify-center mr-4">
          <Text className="text-white text-xl font-bold">
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-gray-900 text-base font-semibold">
              {displayName}
            </Text>
            {isMemberOwner && (
              <View className="bg-amber-100 px-2 py-0.5 rounded-md">
                <Text className="text-amber-700 text-xs font-semibold">Owner</Text>
              </View>
            )}
          </View>
          <Text className="text-gray-500 text-sm mt-0.5">{item.userEmail}</Text>
        </View>
        {isOwner && !isMemberOwner && (
          <TouchableOpacity
            className="bg-red-50 px-4 py-2 rounded-xl active:opacity-70"
            onPress={() => handleRemoveMember(item.id, item.userEmail)}
          >
            <Text className="text-red-600 text-sm font-semibold">Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function renderFriendOption({ item }: { item: Schema['Friend']['type'] }) {
    const alreadyMember = members.some((m) => m.userEmail === item.friendEmail);
    const displayName = item.friendEmail.split('@')[0];

    return (
      <TouchableOpacity
        className={`flex-row items-center p-4 border-b border-gray-100 ${
          alreadyMember ? 'opacity-50' : 'active:bg-gray-50'
        }`}
        onPress={() => !alreadyMember && handleAddMember(item.friendEmail)}
        disabled={alreadyMember}
      >
        <View className="w-10 h-10 rounded-full bg-green-500 items-center justify-center mr-3">
          <Text className="text-white text-base font-bold">
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-gray-900 text-base font-medium">{displayName}</Text>
          <Text className="text-gray-500 text-sm">{item.friendEmail}</Text>
        </View>
        {alreadyMember && (
          <Text className="text-gray-400 text-sm">Already a member</Text>
        )}
      </TouchableOpacity>
    );
  }

  if (!isOwner) {
    return (
      <View className="flex-1 bg-gray-50">
        <View className="pt-2 px-4 pb-4 bg-white border-b border-gray-100">
          <View className="flex-row items-center">
            <TouchableOpacity
              className="mr-3 active:opacity-70"
              onPress={() => router.back()}
            >
              <Text className="text-blue-500 text-3xl font-light">‹</Text>
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900">Server Settings</Text>
          </View>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <View className="bg-red-50 w-20 h-20 rounded-full items-center justify-center mb-4">
            <Text className="text-4xl">🔒</Text>
          </View>
          <Text className="text-gray-900 text-xl font-semibold mb-2">
            Access Denied
          </Text>
          <Text className="text-gray-500 text-center text-base">
            Only the server owner can manage members
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50">
        <View className="pt-2 px-4 pb-4 bg-white border-b border-gray-100">
          <View className="flex-row items-center">
            <TouchableOpacity
              className="mr-3 active:opacity-70"
              onPress={() => router.back()}
            >
              <Text className="text-blue-500 text-3xl font-light">‹</Text>
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900">Server Settings</Text>
          </View>
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
      <View className="pt-2 px-4 pb-4 bg-white border-b border-gray-100">
        <View className="flex-row items-center justify-between mb-1">
          <View className="flex-row items-center flex-1">
            <TouchableOpacity
              className="mr-3 active:opacity-70"
              onPress={() => router.back()}
            >
              <Text className="text-blue-500 text-3xl font-light">‹</Text>
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900">Server Settings</Text>
          </View>
          <TouchableOpacity
            className="bg-green-500 px-4 py-2 rounded-xl active:opacity-70"
            onPress={() => setShowAddModal(true)}
          >
            <Text className="text-white text-sm font-semibold">+ Add</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-gray-500 text-sm ml-12">
          {serverName} • {members.length} {members.length === 1 ? 'member' : 'members'}
        </Text>
      </View>

      {/* Members List */}
      <FlatList
        data={members}
        renderItem={renderMember}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <View className="bg-blue-50 w-20 h-20 rounded-full items-center justify-center mb-4">
              <Text className="text-4xl">👥</Text>
            </View>
            <Text className="text-gray-900 text-lg font-semibold mb-2">
              No members yet
            </Text>
            <Text className="text-gray-500 text-center text-sm px-8">
              Add members to get started
            </Text>
          </View>
        }
      />

      {/* Add Member Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 pb-8 max-h-[80%]">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-2xl font-bold text-gray-900">Add Member</Text>
              <TouchableOpacity
                className="active:opacity-70"
                onPress={() => setShowAddModal(false)}
              >
                <Text className="text-gray-500 text-2xl">✕</Text>
              </TouchableOpacity>
            </View>

            {/* Email Input */}
            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">
                Add by Email
              </Text>
              <View className="flex-row gap-2">
                <TextInput
                  className="flex-1 bg-gray-50 border-2 border-gray-200 rounded-2xl px-5 py-4 text-base"
                  placeholder="friend@example.com"
                  placeholderTextColor="#9CA3AF"
                  value={emailInput}
                  onChangeText={setEmailInput}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!adding}
                />
                <TouchableOpacity
                  className={`bg-green-500 px-6 rounded-2xl items-center justify-center ${
                    adding || !emailInput.trim() ? 'opacity-60' : ''
                  } active:opacity-80`}
                  onPress={() => handleAddMember(emailInput)}
                  disabled={adding || !emailInput.trim()}
                >
                  {adding ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white text-base font-bold">Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Friends List */}
            {friends.length > 0 && (
              <>
                <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">
                  Or select from friends
                </Text>
                <FlatList
                  data={friends}
                  renderItem={renderFriendOption}
                  keyExtractor={(item) => item.id}
                  className="bg-white rounded-2xl border border-gray-200"
                  scrollEnabled={true}
                  nestedScrollEnabled={true}
                />
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
