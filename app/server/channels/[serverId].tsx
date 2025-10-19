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
  Platform,
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
  const [isRestricted, setIsRestricted] = useState(false);
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
      console.log('fetchChannels: Starting fetch for serverId:', serverId);
      setLoading(true);
      const { data: allChannels } = await client.models.Channel.list();
      console.log('fetchChannels: Total channels in database:', allChannels.length);

      const serverChannels = allChannels.filter(
        (ch) => ch !== null && ch.serverId === serverId
      );
      console.log('fetchChannels: Channels for this server:', serverChannels.length);
      console.log('fetchChannels: Server channels:', serverChannels.map(ch => ({ id: ch.id, name: ch.name, restricted: ch.restricted })));

      // Sort channels with general first
      const sortedChannels = serverChannels.sort((a, b) => {
        if (a.isGeneral) return -1;
        if (b.isGeneral) return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      console.log('fetchChannels: Setting channels state with', sortedChannels.length, 'channels');
      setChannels(sortedChannels);
    } catch (error) {
      console.error('Error fetching channels:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateChannel() {
    console.log('handleCreateChannel called with name:', channelName, 'restricted:', isRestricted);

    if (!channelName.trim()) {
      console.log('Channel name is empty');
      if (Platform.OS === 'web') {
        alert('Please enter a channel name');
      } else {
        Alert.alert('Error', 'Please enter a channel name');
      }
      return;
    }

    // Check for duplicate channel names
    const duplicate = channels.some(
      (ch) => ch.name.toLowerCase() === channelName.trim().toLowerCase()
    );
    if (duplicate) {
      console.log('Duplicate channel name detected');
      if (Platform.OS === 'web') {
        alert('A channel with this name already exists');
      } else {
        Alert.alert('Error', 'A channel with this name already exists');
      }
      return;
    }

    console.log('Starting channel creation...');
    setProcessing(true);
    try {
      const channelData = {
        serverId: serverId,
        name: channelName.trim().toLowerCase().replace(/\s+/g, '-'),
        isGeneral: false,
        createdAt: new Date().toISOString(),
      };
      console.log('Creating channel with data:', channelData);
      console.log('Restriction will be set in a separate update if needed');

      const result = await client.models.Channel.create(channelData);
      console.log('Channel create result:', result);
      console.log('Channel create errors:', result.errors);
      console.log('Channel created successfully, result data:', result.data);

      // Check if there were any errors
      if (result.errors && result.errors.length > 0) {
        console.error('Channel creation returned errors:', result.errors);
        throw new Error(`Failed to create channel: ${JSON.stringify(result.errors)}`);
      }

      if (!result.data) {
        console.error('Channel creation returned no data');
        throw new Error('Channel creation returned no data');
      }

      console.log('Channel created with ID:', result.data.id);

      // If restriction was requested, update the channel
      if (isRestricted) {
        console.log('Setting channel restriction to true...');
        try {
          await client.models.Channel.update({
            id: result.data.id,
            restricted: true,
          });
          console.log('Channel restriction updated successfully');
        } catch (updateError) {
          console.error('Error setting restriction:', updateError);
          // Don't fail the whole operation if restriction update fails
        }
      }

      setShowCreateModal(false);
      setChannelName('');
      setIsRestricted(false);

      console.log('Fetching channels to update list...');
      await fetchChannels();
      console.log('Channels fetched, current count:', channels.length);

      if (Platform.OS === 'web') {
        alert('Channel created successfully!');
      } else {
        Alert.alert('Success', 'Channel created!');
      }
    } catch (error) {
      console.error('Error creating channel:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));

      if (Platform.OS === 'web') {
        alert(`Failed to create channel: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } else {
        Alert.alert('Error', 'Failed to create channel');
      }
    } finally {
      setProcessing(false);
    }
  }

  async function handleRenameChannel() {
    console.log('handleRenameChannel called with name:', channelName);

    if (!channelName.trim() || !editingChannel) {
      if (Platform.OS === 'web') {
        alert('Please enter a channel name');
      } else {
        Alert.alert('Error', 'Please enter a channel name');
      }
      return;
    }

    // Check for duplicate channel names
    const duplicate = channels.some(
      (ch) =>
        ch.id !== editingChannel.id &&
        ch.name.toLowerCase() === channelName.trim().toLowerCase()
    );
    if (duplicate) {
      if (Platform.OS === 'web') {
        alert('A channel with this name already exists');
      } else {
        Alert.alert('Error', 'A channel with this name already exists');
      }
      return;
    }

    setProcessing(true);
    try {
      const newName = channelName.trim().toLowerCase().replace(/\s+/g, '-');
      console.log('Renaming channel', editingChannel.id, 'to', newName);

      await client.models.Channel.update({
        id: editingChannel.id,
        name: newName,
      });

      console.log('Channel renamed successfully');

      setShowRenameModal(false);
      setChannelName('');
      setEditingChannel(null);
      await fetchChannels();

      if (Platform.OS === 'web') {
        alert('Channel renamed successfully!');
      } else {
        Alert.alert('Success', 'Channel renamed!');
      }
    } catch (error) {
      console.error('Error renaming channel:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));

      if (Platform.OS === 'web') {
        alert(`Failed to rename channel: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } else {
        Alert.alert('Error', 'Failed to rename channel');
      }
    } finally {
      setProcessing(false);
    }
  }

  async function handleDeleteChannel(channel: Schema['Channel']['type']) {
    console.log('handleDeleteChannel called for channel:', channel.name, channel.id);

    if (channel.isGeneral) {
      console.log('Cannot delete general channel');
      Alert.alert('Error', 'Cannot delete the general channel');
      return;
    }

    console.log('Showing confirmation dialog...');

    // Use window.confirm for web, Alert.alert for native
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Are you sure you want to delete #${channel.name}? All messages in this channel will be lost.`
      );

      if (!confirmed) {
        console.log('Delete cancelled by user');
        return;
      }

      console.log('Delete confirmed, proceeding...');

      try {
        console.log('Deleting channel:', channel.id, channel.name);

        // Delete all notifications for this channel first
        console.log('Fetching notifications...');
        const { data: allNotifications } = await client.models.ChannelNotification.list();
        const channelNotifications = allNotifications.filter(
          (notif) => notif !== null && notif.channelId === channel.id
        );
        console.log(`Found ${channelNotifications.length} notifications to delete`);

        for (const notification of channelNotifications) {
          await client.models.ChannelNotification.delete({ id: notification.id });
        }

        // Delete all messages in the channel
        console.log('Fetching messages...');
        const { data: allMessages } = await client.models.ServerMessage.list();
        const channelMessages = allMessages.filter(
          (msg) => msg !== null && msg.channelId === channel.id
        );
        console.log(`Found ${channelMessages.length} messages to delete`);

        for (const message of channelMessages) {
          await client.models.ServerMessage.delete({ id: message.id });
        }

        // Delete the channel
        console.log('Deleting channel...');
        await client.models.Channel.delete({ id: channel.id });
        console.log('Channel deleted successfully');

        await fetchChannels();
        alert('Channel deleted successfully!');
      } catch (error) {
        console.error('Error deleting channel:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        alert(`Failed to delete channel: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      // Native platform - use Alert.alert
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
                console.log('Deleting channel:', channel.id, channel.name);

                // Delete all notifications for this channel first
                console.log('Fetching notifications...');
                const { data: allNotifications } = await client.models.ChannelNotification.list();
                const channelNotifications = allNotifications.filter(
                  (notif) => notif !== null && notif.channelId === channel.id
                );
                console.log(`Found ${channelNotifications.length} notifications to delete`);

                for (const notification of channelNotifications) {
                  await client.models.ChannelNotification.delete({ id: notification.id });
                }

                // Delete all messages in the channel
                console.log('Fetching messages...');
                const { data: allMessages } = await client.models.ServerMessage.list();
                const channelMessages = allMessages.filter(
                  (msg) => msg !== null && msg.channelId === channel.id
                );
                console.log(`Found ${channelMessages.length} messages to delete`);

                for (const message of channelMessages) {
                  await client.models.ServerMessage.delete({ id: message.id });
                }

                // Delete the channel
                console.log('Deleting channel...');
                await client.models.Channel.delete({ id: channel.id });
                console.log('Channel deleted successfully');

                await fetchChannels();
                Alert.alert('Success', 'Channel deleted');
              } catch (error) {
                console.error('Error deleting channel:', error);
                console.error('Error details:', JSON.stringify(error, null, 2));
                Alert.alert('Error', `Failed to delete channel: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            },
          },
        ]
      );
    }
  }

  function openRenameModal(channel: Schema['Channel']['type']) {
    setEditingChannel(channel);
    setChannelName(channel.name);
    setShowRenameModal(true);
  }

  function renderChannel({ item }: { item: Schema['Channel']['type'] }) {
    const isRestricted = item.restricted ?? false;

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
            {isRestricted && (
              <View className="bg-orange-100 px-2 py-0.5 rounded-md">
                <Text className="text-orange-700 text-xs font-semibold">🔒 Restricted</Text>
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
                onPress={() => {
                  setShowCreateModal(false);
                  setChannelName('');
                  setIsRestricted(false);
                }}
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
              className="flex-row items-center justify-between p-4 bg-gray-50 rounded-2xl mb-6 active:opacity-70"
              onPress={() => setIsRestricted(!isRestricted)}
              disabled={processing}
            >
              <View className="flex-1 mr-4">
                <Text className="text-gray-900 text-base font-semibold mb-1">
                  Restrict Channel
                </Text>
                <Text className="text-gray-500 text-xs">
                  Only admins and the owner can send messages
                </Text>
              </View>
              <View
                className={`w-12 h-7 rounded-full ${
                  isRestricted ? 'bg-orange-500' : 'bg-gray-300'
                } p-1`}
              >
                <View
                  className={`w-5 h-5 rounded-full bg-white ${
                    isRestricted ? 'ml-auto' : 'ml-0'
                  }`}
                />
              </View>
            </TouchableOpacity>

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
