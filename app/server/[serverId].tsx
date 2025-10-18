import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { router, useLocalSearchParams } from 'expo-router';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

export default function ServerChatScreen() {
  const { user } = useAuth();
  const { serverId, serverName, ownerEmail } = useLocalSearchParams<{
    serverId: string;
    serverName: string;
    ownerEmail: string;
  }>();
  const client = useMemo(() => generateClient<Schema>(), []);
  const isOwner = user?.email === ownerEmail;
  const [messages, setMessages] = useState<Schema['ServerMessage']['type'][]>([]);
  const [members, setMembers] = useState<Schema['ServerMember']['type'][]>([]);
  const [channels, setChannels] = useState<Schema['Channel']['type'][]>([]);
  const [activeChannel, setActiveChannel] = useState<Schema['Channel']['type'] | null>(null);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Check if user is admin
  const userMember = members.find((m) => m.userEmail === user?.email);
  const isAdmin = userMember?.isAdmin || false;
  const canManageChannels = isOwner || isAdmin;

  useEffect(() => {
    if (user?.email && serverId) {
      fetchChannels();
      fetchMembers();
    }
  }, [user?.email, serverId]);

  useEffect(() => {
    if (activeChannel) {
      fetchMessages();

      // Subscribe to new messages for active channel
      const subscription = client.models.ServerMessage.observeQuery({
        filter: {
          channelId: { eq: activeChannel.id },
        },
      }).subscribe({
        next: ({ items }) => {
          const sortedMessages = [...items].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          setMessages(sortedMessages.filter((msg) => msg !== null));
        },
      });

      return () => subscription.unsubscribe();
    }
  }, [activeChannel]);

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

      // Set active channel to general by default
      const generalChannel = sortedChannels.find((ch) => ch.isGeneral);
      if (generalChannel) {
        setActiveChannel(generalChannel);
      } else if (sortedChannels.length > 0) {
        setActiveChannel(sortedChannels[0]);
      }
    } catch (error) {
      console.error('Error fetching channels:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMessages() {
    if (!activeChannel) return;

    try {
      const { data: allMessages } = await client.models.ServerMessage.list();

      // Filter messages for this channel
      const channelMessages = allMessages.filter(
        (msg) => msg !== null && msg.channelId === activeChannel.id
      );

      // Sort by timestamp
      const sortedMessages = channelMessages.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      setMessages(sortedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }

  function switchChannel(channel: Schema['Channel']['type']) {
    setActiveChannel(channel);
    setShowSidebar(false);
  }

  async function sendMessage() {
    if (!inputText.trim() || !user?.email || !serverId || !activeChannel) return;

    try {
      await client.models.ServerMessage.create({
        serverId: serverId,
        channelId: activeChannel.id,
        senderEmail: user.email,
        content: inputText.trim(),
        createdAt: new Date().toISOString(),
      });

      setInputText('');

      // Auto-scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  function renderMessage({ item }: { item: Schema['ServerMessage']['type'] }) {
    const isUser = item.senderEmail === user?.email;
    const senderName = item.senderEmail.split('@')[0];
    const isSenderOwner = item.senderEmail === ownerEmail;
    const senderMember = members.find((m) => m.userEmail === item.senderEmail);
    const isSenderAdmin = senderMember?.isAdmin && !isSenderOwner;

    return (
      <View className="mb-3 px-4">
        {!isUser && (
          <View className="flex-row items-center mb-1 ml-1 gap-2">
            <Text className="text-xs font-semibold text-gray-600">
              {senderName}
            </Text>
            {isSenderOwner && (
              <View className="bg-amber-100 px-2 py-0.5 rounded-md">
                <Text className="text-amber-700 text-[10px] font-semibold">Owner</Text>
              </View>
            )}
            {isSenderAdmin && (
              <View className="bg-purple-100 px-2 py-0.5 rounded-md">
                <Text className="text-purple-700 text-[10px] font-semibold">Admin</Text>
              </View>
            )}
          </View>
        )}
        <View className={`${isUser ? 'items-end' : 'items-start'}`}>
          <View
            className={`max-w-[75%] px-4 py-3 rounded-2xl ${
              isUser
                ? 'bg-blue-500 rounded-br-md'
                : 'bg-white rounded-bl-md shadow-sm'
            }`}
          >
            <Text className={`text-base ${isUser ? 'text-white' : 'text-gray-900'}`}>
              {item.content}
            </Text>
          </View>
          <Text className="text-xs text-gray-500 mt-1 px-2">
            {new Date(item.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50">
        <View className="pt-2 px-6 pb-4 bg-white border-b border-gray-100 flex-row items-center">
          <TouchableOpacity
            className="mr-4 active:opacity-70"
            onPress={() => router.back()}
          >
            <Text className="text-blue-500 text-3xl">‹</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-900">
            {serverName || 'Server'}
          </Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View className="pt-2 px-4 pb-4 bg-white border-b border-gray-100">
        <View className="flex-row items-center">
          <TouchableOpacity
            className="mr-3 active:opacity-70"
            onPress={() => router.back()}
          >
            <Text className="text-blue-500 text-3xl font-light">‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="mr-3 active:opacity-70"
            onPress={() => setShowSidebar(true)}
          >
            <View className="w-10 h-10 rounded-2xl bg-purple-500 items-center justify-center shadow-sm">
              <Text className="text-white text-base font-bold">#</Text>
            </View>
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-lg font-semibold text-gray-900">
              {serverName || 'Server'}
            </Text>
            <Text className="text-xs text-gray-500">
              #{activeChannel?.name || 'general'}
            </Text>
          </View>
          {isOwner && (
            <TouchableOpacity
              className="bg-gray-100 w-9 h-9 rounded-full items-center justify-center active:opacity-70"
              onPress={() =>
                router.push({
                  pathname: '/server/settings/[serverId]',
                  params: { serverId, serverName, ownerEmail },
                })
              }
            >
              <Text className="text-gray-700 text-lg">⚙</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 16, flexGrow: 1 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center px-8">
            <View className="bg-purple-50 w-20 h-20 rounded-full items-center justify-center mb-4">
              <Text className="text-4xl">💬</Text>
            </View>
            <Text className="text-gray-900 text-lg font-semibold mb-2">
              Start the conversation
            </Text>
            <Text className="text-gray-500 text-center text-sm">
              Be the first to send a message in {serverName}!
            </Text>
          </View>
        }
      />

      {/* Input Area */}
      <View className="px-4 py-3 bg-white border-t border-gray-200">
        <View className="flex-row items-end">
          <View className="flex-1 bg-gray-100 rounded-3xl px-5 py-2 mr-2">
            <TextInput
              className="text-base max-h-24 min-h-[36px]"
              placeholder="Message..."
              placeholderTextColor="#999"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
            />
          </View>
          <TouchableOpacity
            className={`w-9 h-9 rounded-full items-center justify-center mb-1 ${
              inputText.trim() ? 'bg-purple-500' : 'bg-gray-300'
            } active:opacity-70`}
            onPress={sendMessage}
            disabled={!inputText.trim()}
          >
            <Text className="text-white text-lg font-bold">↑</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Channel Sidebar Modal */}
      <Modal
        visible={showSidebar}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSidebar(false)}
      >
        <View className="flex-1 bg-black/50">
          <TouchableOpacity
            className="flex-1"
            activeOpacity={1}
            onPress={() => setShowSidebar(false)}
          />
          <View className="bg-white rounded-t-3xl max-h-[70%]">
            <View className="px-6 pt-6 pb-4 border-b border-gray-100">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-2xl font-bold text-gray-900">Channels</Text>
                <TouchableOpacity
                  className="active:opacity-70"
                  onPress={() => setShowSidebar(false)}
                >
                  <Text className="text-gray-500 text-2xl">✕</Text>
                </TouchableOpacity>
              </View>
              <Text className="text-gray-500 text-sm">
                {channels.length} {channels.length === 1 ? 'channel' : 'channels'}
              </Text>
            </View>

            <FlatList
              data={channels}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className={`flex-row items-center p-4 rounded-2xl mb-2 ${
                    activeChannel?.id === item.id
                      ? 'bg-purple-500'
                      : 'bg-gray-50'
                  } active:opacity-70`}
                  onPress={() => switchChannel(item)}
                >
                  <View className="flex-1 flex-row items-center gap-2">
                    <Text
                      className={`text-lg font-semibold ${
                        activeChannel?.id === item.id
                          ? 'text-white'
                          : 'text-gray-900'
                      }`}
                    >
                      # {item.name}
                    </Text>
                    {item.isGeneral && (
                      <View
                        className={`px-2 py-0.5 rounded-md ${
                          activeChannel?.id === item.id
                            ? 'bg-white/20'
                            : 'bg-blue-100'
                        }`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            activeChannel?.id === item.id
                              ? 'text-white'
                              : 'text-blue-700'
                          }`}
                        >
                          General
                        </Text>
                      </View>
                    )}
                  </View>
                  {activeChannel?.id === item.id && (
                    <Text className="text-white text-xl">✓</Text>
                  )}
                </TouchableOpacity>
              )}
              ListFooterComponent={
                canManageChannels ? (
                  <TouchableOpacity
                    className="flex-row items-center justify-center p-4 rounded-2xl bg-green-50 active:opacity-70 mt-2"
                    onPress={() => {
                      setShowSidebar(false);
                      router.push({
                        pathname: '/server/channels/[serverId]',
                        params: { serverId, serverName, ownerEmail },
                      });
                    }}
                  >
                    <Text className="text-green-700 text-base font-semibold">
                      + Create New Channel
                    </Text>
                  </TouchableOpacity>
                ) : null
              }
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
