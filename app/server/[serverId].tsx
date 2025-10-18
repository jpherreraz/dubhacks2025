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
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (user?.email && serverId) {
      fetchMessages();

      // Subscribe to new messages
      const subscription = client.models.ServerMessage.observeQuery({
        filter: {
          serverId: { eq: serverId },
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
  }, [user?.email, serverId]);

  async function fetchMessages() {
    try {
      setLoading(true);
      const { data: allMessages } = await client.models.ServerMessage.list();

      // Filter messages for this server
      const serverMessages = allMessages.filter(
        (msg) => msg !== null && msg.serverId === serverId
      );

      // Sort by timestamp
      const sortedMessages = serverMessages.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      setMessages(sortedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!inputText.trim() || !user?.email || !serverId) return;

    try {
      await client.models.ServerMessage.create({
        serverId: serverId,
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

    return (
      <View className="mb-3 px-4">
        {!isUser && (
          <Text className="text-xs font-semibold text-gray-600 mb-1 ml-1">
            {senderName}
          </Text>
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
          <View className="w-10 h-10 rounded-2xl bg-purple-500 items-center justify-center mr-3 shadow-sm">
            <Text className="text-white text-base font-bold">
              {serverName?.charAt(0).toUpperCase() || 'S'}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-semibold text-gray-900">
              {serverName || 'Server'}
            </Text>
            <Text className="text-xs text-gray-500">Server Chat</Text>
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
    </KeyboardAvoidingView>
  );
}
