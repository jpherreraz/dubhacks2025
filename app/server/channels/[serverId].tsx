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

export default function ChannelManagementScreen() {
  const { user } = useAuth();
  const { serverId, serverName, ownerEmail } = useLocalSearchParams<{
    serverId: string;
    serverName: string;
    ownerEmail: string;
  }>();
  const client = useMemo(() => generateClient<Schema>(), []);
  const [channels, setChannels] = useState<Schema['Channel']['type'][]>([]);
  const [members, setMembers] = useState<Schema['ServerMember']['type'][]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [editingChannel, setEditingChannel] = useState<Schema['Channel']['type'] | null>(null);
  const [processing, setProcessing] = useState(false);

  const isOwner = user?.email === ownerEmail;
  const userMember = members.find((m) => m.userEmail === user?.email);
  const isAdmin = userMember?.isAdmin || false;
  const canManage = isOwner || isAdmin;

  useEffect(() => {
    if (user?.email && serverId) {
      fetchChannels();
      fetchMembers();
    }
  }, [user?.email, serverId]);

  async function fetchMembers() {
    try {
      const { data: allMembers } = await client.models.ServerMember.list();
      const serverMembers = allMembers.filter(
        (m) => m !== null && m.serverId === serverId
      );
      setMembers(serverMembers);
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  }

  async function fetchChannels() {
    try {
      setLoading(true);
      const { data: allChannels } = await client.models.Channel.list();
      const serverChannels = allChannels.filter(
        (ch) => ch !== null && ch.serverId === serverId
      );

      // Sort channels with general first
      const sortedChannels = serverChannels.sort((a, b) => {
        if (a.isGeneral) return -1;
        if (b.isGeneral) return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      setChannels(sortedChannels);
    } catch (error) {
      console.error('Error fetching channels:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateChannel() {
    if (!channelName.trim()) {
      Alert.alert('Error', 'Please enter a channel name');
      return;
    }

    // Check for duplicate channel names
    const duplicate = channels.some(
      (ch) => ch.name.toLowerCase() === channelName.trim().toLowerCase()
    );
    if (duplicate) {
      Alert.alert('Error', 'A channel with this name already exists');
      return;
    }

    setProcessing(true);
    try {
      await client.models.Channel.create({
        serverId: serverId,
        name: channelName.trim().toLowerCase().replace(/\s+/g, '-'),
        isGeneral: false,
        createdAt: new Date().toISOString(),
        createdBy: user?.email || '',
      });

      setShowCreateModal(false);
      setChannelName('');
      await fetchChannels();
      Alert.alert('Success', 'Channel created!');
    } catch (error) {
      console.error('Error creating channel:', error);
      Alert.alert('Error', 'Failed to create channel');
    } finally {
      setProcessing(false);
    }
  }

  async function handleRenameChannel() {
    if (!channelName.trim() || !editingChannel) {
      Alert.alert('Error', 'Please enter a channel name');
      return;
    }

    // Check for duplicate channel names
    const duplicate = channels.some(
      (ch) =>
        ch.id !== editingChannel.id &&
        ch.name.toLowerCase() === channelName.trim().toLowerCase()
    );
    if (duplicate) {
      Alert.alert('Error', 'A channel with this name already exists');
      return;
    }

    setProcessing(true);
    try {
      await client.models.Channel.update({
        id: editingChannel.id,
        name: channelName.trim().toLowerCase().replace(/\s+/g, '-'),
      });

      setShowRenameModal(false);
      setChannelName('');
      setEditingChannel(null);
      await fetchChannels();
      Alert.alert('Success', 'Channel renamed!');
    } catch (error) {
      console.error('Error renaming channel:', error);
      Alert.alert('Error', 'Failed to rename channel');
    } finally {
      setProcessing(false);
    }
  }

  async function handleDeleteChannel(channel: Schema['Channel']['type']) {
    if (channel.isGeneral) {
      Alert.alert('Error', 'Cannot delete the general channel');
      return;
    }

    Alert.alert(
      'Delete Channel',
      `Are you sure you want to delete #${channel.name}? All messages in this channel will be lost.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all messages in the channel first
              const { data: allMessages } = await client.models.ServerMessage.list();
              const channelMessages = allMessages.filter(
                (msg) => msg !== null && msg.channelId === channel.id
              );

              for (const message of channelMessages) {
                await client.models.ServerMessage.delete({ id: message.id });
              }

              // Delete the channel
              await client.models.Channel.delete({ id: channel.id });
              await fetchChannels();
              Alert.alert('Success', 'Channel deleted');
            } catch (error) {
              console.error('Error deleting channel:', error);
              Alert.alert('Error', 'Failed to delete channel');
            }
          },
        },
      ]
    );
  }

  function openRenameModal(channel: Schema['Channel']['type']) {
    setEditingChannel(channel);
    setChannelName(channel.name);
    setShowRenameModal(true);
  }

  function renderChannel({ item }: { item: Schema['Channel']['type'] }) {
    return (
      <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm">
        <View className="flex-row items-center mb-2">
          <View className="flex-1 flex-row items-center gap-2">
            <Text className="text-gray-900 text-lg font-semibold">
              # {item.name}
            </Text>
            {item.isGeneral && (
              <View className="bg-blue-100 px-2 py-0.5 rounded-md">
                <Text className="text-blue-700 text-xs font-semibold">General</Text>
              </View>
            )}
          </View>
        </View>

        {canManage && !item.isGeneral && (
          <View className="flex-row gap-2 mt-2">
            <TouchableOpacity
              className="flex-1 bg-blue-50 px-4 py-2.5 rounded-xl active:opacity-70"
              onPress={() => openRenameModal(item)}
            >
              <Text className="text-blue-700 text-sm font-semibold text-center">
                Rename
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-red-50 px-4 py-2.5 rounded-xl active:opacity-70"
              onPress={() => handleDeleteChannel(item)}
            >
              <Text className="text-red-600 text-sm font-semibold text-center">
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {item.isGeneral && (
          <Text className="text-gray-500 text-xs mt-1">
            🔒 This channel cannot be deleted or renamed
          </Text>
        )}
      </View>
    );
  }

  if (!canManage) {
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
            <Text className="text-xl font-bold text-gray-900">Channel Management</Text>
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
            Only server owners and admins can manage channels
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
            <Text className="text-xl font-bold text-gray-900">Channel Management</Text>
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
            <Text className="text-xl font-bold text-gray-900">Channels</Text>
          </View>
          <TouchableOpacity
            className="bg-green-500 px-4 py-2 rounded-xl active:opacity-70"
            onPress={() => setShowCreateModal(true)}
          >
            <Text className="text-white text-sm font-semibold">+ Create</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-gray-500 text-sm ml-12">
          {serverName} • {channels.length} {channels.length === 1 ? 'channel' : 'channels'}
        </Text>
      </View>

      {/* Channels List */}
      <FlatList
        data={channels}
        renderItem={renderChannel}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
      />

      {/* Create Channel Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 pb-8">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-2xl font-bold text-gray-900">Create Channel</Text>
              <TouchableOpacity
                className="active:opacity-70"
                onPress={() => setShowCreateModal(false)}
              >
                <Text className="text-gray-500 text-2xl">✕</Text>
              </TouchableOpacity>
            </View>

            <View className="mb-6">
              <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">
                Channel Name
              </Text>
              <TextInput
                className="bg-gray-50 border-2 border-gray-200 rounded-2xl px-5 py-4 text-base"
                placeholder="announcements"
                placeholderTextColor="#9CA3AF"
                value={channelName}
                onChangeText={setChannelName}
                maxLength={50}
                autoCapitalize="none"
                editable={!processing}
              />
              <Text className="text-xs text-gray-500 mt-2 ml-1">
                Use lowercase letters, numbers, and dashes
              </Text>
            </View>

            <TouchableOpacity
              className={`bg-green-500 py-5 rounded-2xl shadow-lg active:opacity-80 ${
                processing ? 'opacity-60' : ''
              }`}
              onPress={handleCreateChannel}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-center text-lg font-bold">
                  Create Channel
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rename Channel Modal */}
      <Modal
        visible={showRenameModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRenameModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 pb-8">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-2xl font-bold text-gray-900">Rename Channel</Text>
              <TouchableOpacity
                className="active:opacity-70"
                onPress={() => {
                  setShowRenameModal(false);
                  setEditingChannel(null);
                  setChannelName('');
                }}
              >
                <Text className="text-gray-500 text-2xl">✕</Text>
              </TouchableOpacity>
            </View>

            <View className="mb-6">
              <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">
                New Channel Name
              </Text>
              <TextInput
                className="bg-gray-50 border-2 border-gray-200 rounded-2xl px-5 py-4 text-base"
                placeholder="new-name"
                placeholderTextColor="#9CA3AF"
                value={channelName}
                onChangeText={setChannelName}
                maxLength={50}
                autoCapitalize="none"
                editable={!processing}
              />
              <Text className="text-xs text-gray-500 mt-2 ml-1">
                Use lowercase letters, numbers, and dashes
              </Text>
            </View>

            <TouchableOpacity
              className={`bg-blue-500 py-5 rounded-2xl shadow-lg active:opacity-80 ${
                processing ? 'opacity-60' : ''
              }`}
              onPress={handleRenameChannel}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-center text-lg font-bold">
                  Rename Channel
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
