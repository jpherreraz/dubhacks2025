import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Text,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { router } from 'expo-router';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

export default function ServersScreen() {
  const { user } = useAuth();
  const client = useMemo(() => generateClient<Schema>(), []);
  const [servers, setServers] = useState<Schema['Server']['type'][]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExploreModal, setShowExploreModal] = useState(false);
  const [publicServers, setPublicServers] = useState<Schema['Server']['type'][]>([]);
  const [loadingPublicServers, setLoadingPublicServers] = useState(false);
  const [serverName, setServerName] = useState('');
  const [serverDescription, setServerDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [joiningServerId, setJoiningServerId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.email) {
      fetchServers();
      ensureGeneralServer();
    }
  }, [user?.email]);

  async function fetchServers() {
    try {
      // Get all server memberships for the user
      const { data: memberships } = await client.models.ServerMember.list();
      const userMemberships = memberships.filter(
        (m) => m !== null && m.userEmail === user?.email
      );

      // Get all servers
      const { data: allServers } = await client.models.Server.list();

      // Filter to only servers the user is a member of
      const userServers = allServers.filter((s) =>
        s !== null && userMemberships.some((m) => m.serverId === s.id)
      );

      setServers(userServers);
    } catch (error) {
      console.error('Error fetching servers:', error);
    } finally {
      setLoading(false);
    }
  }

  async function ensureGeneralServer() {
    try {
      const { data: existingServers } = await client.models.Server.list();
      let generalServer = existingServers.find((s) => s?.isGeneral === true);

      if (!generalServer) {
        // Create the general server if it doesn't exist
        const { data: newServer } = await client.models.Server.create({
          name: 'General',
          description: 'Welcome to the general server! Everyone is here.',
          ownerEmail: 'system@app.com',
          isGeneral: true,
          createdAt: new Date().toISOString(),
        });
        generalServer = newServer;

        // Create general channel for the general server
        if (generalServer) {
          await client.models.Channel.create({
            serverId: generalServer.id,
            name: 'general',
            isGeneral: true,
            createdAt: new Date().toISOString(),
            createdBy: 'system@app.com',
          });
        }
      }

      // Ensure current user is a member of the general server
      if (generalServer && user?.email) {
        const { data: memberships } = await client.models.ServerMember.list();
        const isMember = memberships.some(
          (m) => m?.serverId === generalServer.id && m?.userEmail === user.email
        );

        if (!isMember) {
          await client.models.ServerMember.create({
            serverId: generalServer.id,
            userEmail: user.email,
            joinedAt: new Date().toISOString(),
          });
        }
      }

      await fetchServers();
    } catch (error) {
      console.error('Error ensuring general server:', error);
    }
  }

  async function handleCreateServer() {
    if (!serverName.trim()) {
      Alert.alert('Error', 'Please enter a server name');
      return;
    }

    setCreating(true);
    try {
      // Create the server
      const { data: newServer } = await client.models.Server.create({
        name: serverName.trim(),
        description: serverDescription.trim() || undefined,
        ownerEmail: user?.email || '',
        isGeneral: false,
        createdAt: new Date().toISOString(),
      });

      // Add creator as a member
      if (newServer) {
        await client.models.ServerMember.create({
          serverId: newServer.id,
          userEmail: user?.email || '',
          joinedAt: new Date().toISOString(),
        });

        // Create general channel for the new server
        await client.models.Channel.create({
          serverId: newServer.id,
          name: 'general',
          isGeneral: true,
          createdAt: new Date().toISOString(),
          createdBy: user?.email || '',
        });
      }

      setShowCreateModal(false);
      setServerName('');
      setServerDescription('');
      await fetchServers();
      Alert.alert('Success', 'Server created!');
    } catch (error) {
      console.error('Error creating server:', error);
      Alert.alert('Error', 'Failed to create server');
    } finally {
      setCreating(false);
    }
  }

  async function fetchPublicServers() {
    try {
      setLoadingPublicServers(true);
      const { data: allServers } = await client.models.Server.list();

      // Get user's current memberships
      const { data: memberships } = await client.models.ServerMember.list();
      const userServerIds = memberships
        .filter((m) => m !== null && m.userEmail === user?.email)
        .map((m) => m.serverId);

      // Filter to public servers that user is not already a member of
      const availablePublicServers = allServers.filter(
        (s) => s !== null && s.isPublic === true && !userServerIds.includes(s.id)
      );

      setPublicServers(availablePublicServers);
    } catch (error) {
      console.error('Error fetching public servers:', error);
      Alert.alert('Error', 'Failed to load public servers');
    } finally {
      setLoadingPublicServers(false);
    }
  }

  async function handleJoinServer(serverId: string) {
    setJoiningServerId(serverId);
    try {
      // Add user as a member
      await client.models.ServerMember.create({
        serverId,
        userEmail: user?.email || '',
        joinedAt: new Date().toISOString(),
      });

      await fetchServers();
      await fetchPublicServers();
      Alert.alert('Success', 'You joined the server!');
    } catch (error) {
      console.error('Error joining server:', error);
      Alert.alert('Error', 'Failed to join server');
    } finally {
      setJoiningServerId(null);
    }
  }

  function handleOpenExploreModal() {
    setShowExploreModal(true);
    fetchPublicServers();
  }

  function openServer(serverId: string, serverName: string, ownerEmail: string) {
    router.push({
      pathname: '/server/[serverId]',
      params: { serverId, serverName, ownerEmail },
    });
  }

  function renderServer({ item }: { item: Schema['Server']['type'] }) {
    const colors = ['bg-purple-500', 'bg-indigo-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500'];
    const colorIndex = item.name.charCodeAt(0) % colors.length;
    const isOwner = item.ownerEmail === user?.email;

    return (
      <TouchableOpacity
        className="flex-row items-center bg-white rounded-2xl p-4 mb-3 shadow-sm active:opacity-70"
        onPress={() => openServer(item.id, item.name, item.ownerEmail)}
      >
        <View className={`w-14 h-14 rounded-2xl ${colors[colorIndex]} items-center justify-center mr-4 shadow-md`}>
          <Text className="text-white text-2xl font-bold">{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-gray-900 text-base font-semibold">
              {item.name}
            </Text>
            {isOwner && (
              <View className="bg-amber-100 px-2 py-0.5 rounded-md">
                <Text className="text-amber-700 text-xs font-semibold">Owner</Text>
              </View>
            )}
          </View>
          {item.description && (
            <Text className="text-gray-500 text-sm mt-1" numberOfLines={1}>
              {item.description}
            </Text>
          )}
          {item.isGeneral && (
            <Text className="text-blue-500 text-xs mt-1 font-medium">Everyone's here</Text>
          )}
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
          <Text className="text-3xl font-bold text-gray-900">Servers</Text>
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
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-3xl font-bold text-gray-900">Servers</Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              className="bg-blue-500 px-4 py-2 rounded-xl active:opacity-70"
              onPress={handleOpenExploreModal}
            >
              <Text className="text-white text-sm font-semibold">🔍 Explore</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-purple-500 px-4 py-2 rounded-xl active:opacity-70"
              onPress={() => setShowCreateModal(true)}
            >
              <Text className="text-white text-sm font-semibold">+ Create</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text className="text-gray-500 text-sm">
          {servers.length} {servers.length === 1 ? 'server' : 'servers'}
        </Text>
      </View>

      {/* Servers List */}
      <FlatList
        data={servers}
        renderItem={renderServer}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <View className="bg-purple-50 w-24 h-24 rounded-full items-center justify-center mb-6">
              <Text className="text-5xl">🌐</Text>
            </View>
            <Text className="text-gray-900 text-xl font-semibold mb-2">
              No servers yet
            </Text>
            <Text className="text-gray-500 text-center text-base px-8 mb-6">
              Create a server to start chatting with your community
            </Text>
            <TouchableOpacity
              className="bg-purple-500 px-8 py-4 rounded-2xl shadow-lg active:opacity-70"
              onPress={() => setShowCreateModal(true)}
            >
              <Text className="text-white text-base font-semibold">Create Server</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Create Server Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 pb-8">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-2xl font-bold text-gray-900">Create Server</Text>
              <TouchableOpacity
                className="active:opacity-70"
                onPress={() => setShowCreateModal(false)}
              >
                <Text className="text-gray-500 text-2xl">✕</Text>
              </TouchableOpacity>
            </View>

            <View className="gap-4 mb-6">
              <View>
                <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">Server Name</Text>
                <TextInput
                  className="bg-gray-50 border-2 border-gray-200 rounded-2xl px-5 py-4 text-base"
                  placeholder="My Awesome Server"
                  placeholderTextColor="#9CA3AF"
                  value={serverName}
                  onChangeText={setServerName}
                  maxLength={50}
                  editable={!creating}
                />
              </View>
              <View>
                <Text className="text-sm font-semibold text-gray-700 mb-2 ml-1">Description (Optional)</Text>
                <TextInput
                  className="bg-gray-50 border-2 border-gray-200 rounded-2xl px-5 py-4 text-base"
                  placeholder="What's your server about?"
                  placeholderTextColor="#9CA3AF"
                  value={serverDescription}
                  onChangeText={setServerDescription}
                  maxLength={200}
                  multiline
                  numberOfLines={3}
                  editable={!creating}
                />
              </View>
            </View>

            <TouchableOpacity
              className={`bg-purple-500 py-5 rounded-2xl shadow-lg active:opacity-80 ${creating ? 'opacity-60' : ''}`}
              onPress={handleCreateServer}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-center text-lg font-bold">Create Server</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Explore Servers Modal */}
      <Modal
        visible={showExploreModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowExploreModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 pb-8" style={{ maxHeight: '80%' }}>
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-2xl font-bold text-gray-900">Explore Servers</Text>
              <TouchableOpacity
                className="active:opacity-70"
                onPress={() => setShowExploreModal(false)}
              >
                <Text className="text-gray-500 text-2xl">✕</Text>
              </TouchableOpacity>
            </View>

            {loadingPublicServers ? (
              <View className="flex-1 items-center justify-center py-20">
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text className="text-gray-500 mt-4">Loading servers...</Text>
              </View>
            ) : publicServers.length === 0 ? (
              <View className="flex-1 items-center justify-center py-20">
                <View className="bg-blue-50 w-24 h-24 rounded-full items-center justify-center mb-6">
                  <Text className="text-5xl">🔍</Text>
                </View>
                <Text className="text-gray-900 text-xl font-semibold mb-2">
                  No public servers
                </Text>
                <Text className="text-gray-500 text-center text-base px-8">
                  There are no public servers to join right now. Check back later!
                </Text>
              </View>
            ) : (
              <FlatList
                data={publicServers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const colors = ['bg-purple-500', 'bg-indigo-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500'];
                  const colorIndex = item.name.charCodeAt(0) % colors.length;
                  const isJoining = joiningServerId === item.id;

                  return (
                    <View className="flex-row items-center bg-gray-50 rounded-2xl p-4 mb-3">
                      <View className={`w-14 h-14 rounded-2xl ${colors[colorIndex]} items-center justify-center mr-4`}>
                        <Text className="text-white text-2xl font-bold">
                          {item.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-gray-900 text-base font-semibold">
                          {item.name}
                        </Text>
                        {item.description && (
                          <Text className="text-gray-500 text-sm mt-1" numberOfLines={2}>
                            {item.description}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        className={`bg-blue-500 px-4 py-2 rounded-xl ml-2 active:opacity-70 ${isJoining ? 'opacity-60' : ''}`}
                        onPress={() => handleJoinServer(item.id)}
                        disabled={isJoining}
                      >
                        {isJoining ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text className="text-white text-sm font-semibold">Join</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
