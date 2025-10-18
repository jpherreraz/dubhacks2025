import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
      <View
        style={[
          styles.messageContainer,
          isUser ? styles.userMessage : styles.otherMessage,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.otherBubble,
          ]}
        >
          <ThemedText style={isUser ? styles.userText : styles.otherText}>
            {item.content}
          </ThemedText>
          <ThemedText style={styles.timestamp}>
            {new Date(item.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ThemedText style={styles.backButtonText}>‹ Back</ThemedText>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>
              {friendEmail?.charAt(0).toUpperCase() || '?'}
            </ThemedText>
          </View>
          <View>
            <ThemedText style={styles.headerTitle}>
              {friendEmail || 'Unknown'}
            </ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              Direct Message
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>
                No messages yet. Start a conversation with {friendEmail}!
              </ThemedText>
            </View>
          )
        }
      />

      {/* Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              !inputText.trim() && styles.sendButtonDisabled,
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim()}
          >
            <ThemedText style={styles.sendButtonText}>Send</ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 28,
    color: '#007AFF',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  messagesList: {
    padding: 16,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    opacity: 0.5,
    fontSize: 16,
    textAlign: 'center',
  },
  messageContainer: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
  },
  otherMessage: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#007AFF',
  },
  otherBubble: {
    backgroundColor: '#E5E5EA',
  },
  userText: {
    color: '#fff',
    fontSize: 16,
  },
  otherText: {
    color: '#000',
    fontSize: 16,
  },
  timestamp: {
    fontSize: 10,
    opacity: 0.7,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#cccccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
