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
  Pressable,
} from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
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
  const [notifications, setNotifications] = useState<Schema['ChannelNotification']['type'][]>([]);
  const [replyingTo, setReplyingTo] = useState<Schema['ServerMessage']['type'] | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Check if user is admin
  const userMember = members.find((m) => m.userEmail === user?.email);
  const isAdmin = userMember?.isAdmin || false;
  const canManageChannels = isOwner || isAdmin;

  // Debug logging
  useEffect(() => {
    console.log('Permission check:', {
      userEmail: user?.email,
      ownerEmail,
      isOwner,
      isAdmin,
      canManageChannels,
      membersCount: members.length
    });
  }, [user?.email, ownerEmail, isOwner, isAdmin, canManageChannels, members.length]);

  useEffect(() => {
    if (user?.email && serverId) {
      fetchMembers();
      fetchNotifications();
    }
  }, [user?.email, serverId]);

  // Subscribe to channels for real-time updates
  useEffect(() => {
    if (user?.email && serverId) {
      setLoading(true);
      const subscription = client.models.Channel.observeQuery({
        filter: {
          serverId: { eq: serverId },
        },
      }).subscribe({
        next: ({ items }) => {
          const serverChannels = items.filter((ch) => ch !== null);

          // Sort channels with general first
          const sortedChannels = serverChannels.sort((a, b) => {
            if (a.isGeneral) return -1;
            if (b.isGeneral) return 1;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          });

          setChannels(sortedChannels);

          // Set active channel to general by default (only on first load)
          if (!activeChannel) {
            const generalChannel = sortedChannels.find((ch) => ch.isGeneral);
            if (generalChannel) {
              setActiveChannel(generalChannel);
            } else if (sortedChannels.length > 0) {
              setActiveChannel(sortedChannels[0]);
            }
          } else {
            // Update activeChannel if it was modified
            const updatedActiveChannel = sortedChannels.find(ch => ch.id === activeChannel.id);
            if (updatedActiveChannel) {
              setActiveChannel(updatedActiveChannel);
            }
          }

          setLoading(false);
        },
      });

      return () => subscription.unsubscribe();
    }
  }, [user?.email, serverId]);

  // Subscribe to notifications
  useEffect(() => {
    if (user?.email && serverId) {
      const subscription = client.models.ChannelNotification.observeQuery({
        filter: {
          userEmail: { eq: user.email },
          serverId: { eq: serverId },
        },
      }).subscribe({
        next: ({ items }) => {
          setNotifications(items.filter((n) => n !== null));
        },
      });

      return () => subscription.unsubscribe();
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

  async function fetchNotifications() {
    if (!user?.email) return;

    try {
      const { data: allNotifications } = await client.models.ChannelNotification.list();
      const userNotifications = allNotifications.filter(
        (n) => n !== null && n.userEmail === user.email && n.serverId === serverId
      );
      setNotifications(userNotifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }

  function getUnreadNotificationCount(channelId: string): number {
    return notifications.filter(
      (n) => n.channelId === channelId && !n.read
    ).length;
  }

  function handleReply(message: Schema['ServerMessage']['type']) {
    setReplyingTo(message);
  }

  function cancelReply() {
    setReplyingTo(null);
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

  async function switchChannel(channel: Schema['Channel']['type']) {
    setActiveChannel(channel);
    setShowSidebar(false);
    cancelReply(); // Clear any active reply when switching channels

    // Mark all notifications for this channel as read
    const unreadNotifications = notifications.filter(
      (n) => n.channelId === channel.id && !n.read
    );

    if (unreadNotifications.length > 0) {
      console.log('Marking', unreadNotifications.length, 'notifications as read for channel:', channel.name);
      await Promise.all(
        unreadNotifications.map((notification) =>
          client.models.ChannelNotification.update({
            id: notification.id,
            read: true,
          }).catch((error) => {
            console.error('Error marking notification as read:', error);
          })
        )
      );
    }
  }

  async function toggleChannelRestriction(channel: Schema['Channel']['type']) {
    const currentRestricted = channel.restricted ?? false; // Treat undefined as false
    console.log('toggleChannelRestriction called', {
      channelName: channel.name,
      currentRestricted,
      canManageChannels,
      isOwner,
      isAdmin
    });

    if (!canManageChannels) {
      console.log('Permission denied: canManageChannels is false');
      return;
    }

    try {
      const newRestricted = !currentRestricted;
      console.log('Updating channel restriction to:', newRestricted);
      await client.models.Channel.update({
        id: channel.id,
        restricted: newRestricted,
      });
      console.log('Channel restriction updated successfully');
    } catch (error) {
      console.error('Error toggling channel restriction:', error);
      alert('Failed to update channel restriction');
    }
  }

  async function sendMessage() {
    if (!inputText.trim() || !user?.email || !serverId || !activeChannel) return;

    // Check if channel is restricted and user has permission (treat undefined as false)
    const isRestricted = activeChannel.restricted ?? false;
    if (isRestricted && !canManageChannels) {
      alert('This channel is restricted. Only admins and the server owner can send messages.');
      return;
    }

    const messageContent = inputText.trim();
    const hasEveryoneMention = messageContent.includes('@everyone');

    // Extract individual user mentions (@email or @username)
    const mentionRegex = /@(\S+)/g;
    const mentions = [...messageContent.matchAll(mentionRegex)].map(match => match[1]);

    try {
      // Create the message
      const { data: newMessage } = await client.models.ServerMessage.create({
        serverId: serverId,
        channelId: activeChannel.id,
        senderEmail: user.email,
        content: messageContent,
        createdAt: new Date().toISOString(),
        ...(replyingTo && { replyToMessageId: replyingTo.id }),
      });

      if (!newMessage) return;

      const notifiedUsers = new Set<string>();

      // If @everyone was mentioned, create notifications for all server members (except sender)
      if (hasEveryoneMention) {
        const otherMembers = members.filter((m) => m.userEmail !== user.email);

        // Create notifications in parallel
        await Promise.all(
          otherMembers.map((member) => {
            notifiedUsers.add(member.userEmail);
            return client.models.ChannelNotification.create({
              userEmail: member.userEmail,
              channelId: activeChannel.id,
              serverId: serverId,
              messageId: newMessage.id,
              read: false,
              createdAt: new Date().toISOString(),
            }).catch((error) => {
              console.error('Error creating notification for', member.userEmail, ':', error);
            });
          })
        );
      }

      // Handle individual user mentions
      if (mentions.length > 0 && mentions.filter(m => m !== 'everyone').length > 0) {
        // Find mentioned members by email or username
        const mentionedMembers = members.filter((member) => {
          if (member.userEmail === user.email) return false; // Don't notify yourself
          if (notifiedUsers.has(member.userEmail)) return false; // Already notified via @everyone

          // Check if mention matches email or username (part before @)
          const username = member.userEmail.split('@')[0];
          return mentions.some(mention =>
            mention === member.userEmail ||
            mention.toLowerCase() === username.toLowerCase()
          );
        });

        if (mentionedMembers.length > 0) {
          await Promise.all(
            mentionedMembers.map((member) =>
              client.models.ChannelNotification.create({
                userEmail: member.userEmail,
                channelId: activeChannel.id,
                serverId: serverId,
                messageId: newMessage.id,
                read: false,
                createdAt: new Date().toISOString(),
              }).catch((error) => {
                console.error('Error creating mention notification for', member.userEmail, ':', error);
              })
            )
          );
        }
      }

      setInputText('');
      cancelReply(); // Clear reply state after sending

      // Auto-scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  // Helper function to render message content with highlighted mentions
  function renderMessageContent(content: string, isUser: boolean) {
    const mentionRegex = /@(\S+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      // Add text before the mention
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }

      // Add the mention with highlighting
      const mention = match[0];
      const isSelfMention = user?.email && (
        match[1] === user.email ||
        match[1].toLowerCase() === user.email.split('@')[0].toLowerCase()
      );

      parts.push(
        <Text
          key={match.index}
          style={{
            fontWeight: '600',
            backgroundColor: isSelfMention
              ? (isUser ? 'rgba(255, 255, 255, 0.3)' : 'rgba(59, 130, 246, 0.2)')
              : (isUser ? 'rgba(255, 255, 255, 0.15)' : 'rgba(99, 102, 241, 0.15)'),
            paddingHorizontal: 2,
            borderRadius: 3,
          }}
        >
          {mention}
        </Text>
      );

      lastIndex = match.index + mention.length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return parts.length > 0 ? parts : content;
  }

  function renderMessage({ item }: { item: Schema['ServerMessage']['type'] }) {
    const isUser = item.senderEmail === user?.email;
    const senderName = item.senderEmail.split('@')[0];
    const isSenderOwner = item.senderEmail === ownerEmail;
    const senderMember = members.find((m) => m.userEmail === item.senderEmail);
    const isSenderAdmin = senderMember?.isAdmin && !isSenderOwner;

    const repliedMessage = item.replyToMessageId
      ? messages.find((m) => m.id === item.replyToMessageId)
      : null;

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
          <Pressable onLongPress={() => handleReply(item)} style={{ maxWidth: '75%' }}>
            <View
              className={`px-4 py-3 rounded-2xl ${
                isUser
                  ? 'bg-blue-500 rounded-br-md'
                  : 'bg-white rounded-bl-md shadow-sm'
              }`}
              style={{ minWidth: 80, maxWidth: '100%' }}
            >
              {repliedMessage && (
                <View className={`mb-2 pb-2 border-l-2 pl-2 ${
                  isUser ? 'border-white/40' : 'border-gray-300'
                }`}>
                  <Text className={`text-xs font-semibold ${
                    isUser ? 'text-white/80' : 'text-gray-600'
                  }`}>
                    {repliedMessage.senderEmail.split('@')[0]}
                  </Text>
                  <Text
                    className={`text-xs ${isUser ? 'text-white/70' : 'text-gray-500'}`}
                    numberOfLines={1}
                  >
                    {repliedMessage.content}
                  </Text>
                </View>
              )}
              <Text
                className={`text-base ${isUser ? 'text-white' : 'text-gray-900'}`}
                style={{
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                  flexShrink: 1,
                }}
              >
                {renderMessageContent(item.content, isUser)}
              </Text>
            </View>
          </Pressable>
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
          {/* Reply Indicator */}
          {replyingTo && (
            <View className="flex-row items-center justify-between px-4 py-2 bg-blue-50 rounded-lg mb-2">
              <View className="flex-1">
                <Text className="text-xs font-semibold text-blue-700">
                  Replying to {replyingTo.senderEmail.split('@')[0]}
                </Text>
                <Text className="text-xs text-blue-600" numberOfLines={1}>
                  {replyingTo.content}
                </Text>
              </View>
              <TouchableOpacity onPress={cancelReply} className="ml-2 active:opacity-70">
                <Text className="text-blue-700 text-lg font-bold">×</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Show restriction notice if channel is restricted and user can't send */}
          {(activeChannel?.restricted ?? false) && !canManageChannels && (
            <View className="px-4 py-2 bg-yellow-50 border-l-4 border-yellow-400 mb-2">
              <Text className="text-xs text-yellow-800">
                🔒 This channel is restricted. Only admins and the owner can send messages.
              </Text>
            </View>
          )}

          <View className="flex-row items-end">
            <View className="flex-1 bg-gray-100 rounded-3xl px-5 py-2 mr-2">
              <TextInput
                className="text-base max-h-24 min-h-[36px]"
                placeholder={
                  (activeChannel?.restricted ?? false) && !canManageChannels
                    ? "This channel is restricted..."
                    : "Message..."
                }
                placeholderTextColor="#999"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
                blurOnSubmit={false}
                editable={!(activeChannel?.restricted ?? false) || canManageChannels}
              />
            </View>
            <TouchableOpacity
              className={`w-9 h-9 rounded-full items-center justify-center mb-1 ${
                inputText.trim() && (!(activeChannel?.restricted ?? false) || canManageChannels)
                  ? 'bg-purple-500'
                  : 'bg-gray-300'
              } active:opacity-70`}
              onPress={sendMessage}
              disabled={!inputText.trim() || ((activeChannel?.restricted ?? false) && !canManageChannels)}
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
              renderItem={({ item }) => {
                const unreadCount = getUnreadNotificationCount(item.id);
                const hasNotifications = unreadCount > 0;

                return (
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
                      {((item.restricted ?? false) || canManageChannels) && (
                        <TouchableOpacity
                          className={`px-2 py-0.5 rounded-md ${
                            activeChannel?.id === item.id
                              ? 'bg-white/20'
                              : (item.restricted ?? false)
                              ? 'bg-orange-100'
                              : 'bg-gray-100'
                          } ${canManageChannels ? 'active:opacity-70' : ''}`}
                          onPress={(e) => {
                            console.log('Badge pressed for channel:', item.name, 'canManageChannels:', canManageChannels);
                            if (canManageChannels) {
                              e.stopPropagation();
                              toggleChannelRestriction(item);
                            } else {
                              console.log('Cannot manage channels - permission denied');
                            }
                          }}
                          disabled={!canManageChannels}
                        >
                          <Text
                            className={`text-xs font-semibold ${
                              activeChannel?.id === item.id
                                ? 'text-white'
                                : (item.restricted ?? false)
                                ? 'text-orange-700'
                                : 'text-gray-500'
                            }`}
                          >
                            {(item.restricted ?? false) ? '🔒 Restricted' : '🔓 Unrestricted'}
                          </Text>
                        </TouchableOpacity>
                      )}
                      {hasNotifications && (
                        <View className="bg-red-500 w-6 h-6 rounded-full items-center justify-center">
                          <Text className="text-white text-xs font-bold">
                            {unreadCount}
                          </Text>
                        </View>
                      )}
                    </View>
                    {activeChannel?.id === item.id && (
                      <Text className="text-white text-xl">✓</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
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
