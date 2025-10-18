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

export default function ChatScreen() {
  const { user } = useAuth();
  const { friendEmail } = useLocalSearchParams<{ friendEmail: string }>();
  const client = useMemo(() => generateClient<Schema>(), []);
  const [messages, setMessages] = useState<Schema['Message']['type'][]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (user?.email && friendEmail) {
      fetchMessages();

      // Subscribe to new messages
      const subscription = client.models.Message.observeQuery({
        filter: {
          or: [
            {
              and: [
                { senderEmail: { eq: user.email } },
                { receiverEmail: { eq: friendEmail } },
              ],
            },
            {
              and: [
                { senderEmail: { eq: friendEmail } },
                { receiverEmail: { eq: user.email } },
              ],
            },
          ],
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
  }, [user?.email, friendEmail]);

  async function fetchMessages() {
    try {
      setLoading(true);
      const { data: allMessages } = await client.models.Message.list();

      // Filter messages between current user and friend
      const conversationMessages = allMessages.filter(
        (msg) =>
          msg !== null &&
          ((msg.senderEmail === user?.email && msg.receiverEmail === friendEmail) ||
            (msg.senderEmail === friendEmail && msg.receiverEmail === user?.email))
      );

      // Sort by timestamp
      const sortedMessages = conversationMessages.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      setMessages(sortedMessages);

      // Mark messages from friend as read
      const unreadMessages = sortedMessages.filter(
        (msg) => msg.senderEmail === friendEmail && !msg.read
      );

      for (const msg of unreadMessages) {
        await client.models.Message.update({
          id: msg.id,
          read: true,
        });
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!inputText.trim() || !user?.email || !friendEmail) return;

    try {
      await client.models.Message.create({
        senderEmail: user.email,
        receiverEmail: friendEmail,
        content: inputText.trim(),
        createdAt: new Date().toISOString(),
        read: false,
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

  function renderMessage({ item }: { item: Schema['Message']['type'] }) {
    const isUser = item.senderEmail === user?.email;

    return (
      <View className={`mb-2 px-4 ${isUser ? 'items-end' : 'items-start'}`}>
        <View
          className={`max-w-[75%] px-4 py-3 rounded-3xl ${
            isUser
              ? 'bg-blue-500 rounded-br-md'
              : 'bg-gray-200 rounded-bl-md'
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
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50">
        <View className="pt-16 px-6 pb-4 bg-white border-b border-gray-100 flex-row items-center">
          <TouchableOpacity
            className="mr-4 active:opacity-70"
            onPress={() => router.back()}
          >
            <Text className="text-blue-500 text-3xl">‹</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-gray-900">
            {friendEmail || 'Unknown'}
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
      <View className="pt-16 px-4 pb-4 bg-white border-b border-gray-100">
        <View className="flex-row items-center">
          <TouchableOpacity
            className="mr-3 active:opacity-70"
            onPress={() => router.back()}
          >
            <Text className="text-blue-500 text-3xl font-light">‹</Text>
          </TouchableOpacity>
          <View className="w-10 h-10 rounded-full bg-blue-500 items-center justify-center mr-3 shadow-sm">
            <Text className="text-white text-base font-bold">
              {friendEmail?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-semibold text-gray-900">
              {friendEmail || 'Unknown'}
            </Text>
            <Text className="text-xs text-gray-500">Direct Message</Text>
          </View>
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
            <View className="bg-blue-50 w-20 h-20 rounded-full items-center justify-center mb-4">
              <Text className="text-4xl">💬</Text>
            </View>
            <Text className="text-gray-900 text-lg font-semibold mb-2">
              Start a conversation
            </Text>
            <Text className="text-gray-500 text-center text-sm">
              Send a message to {friendEmail?.split('@')[0]}!
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
              inputText.trim() ? 'bg-blue-500' : 'bg-gray-300'
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
