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
  useWindowDimensions,
  Image,
  PanResponder,
} from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { callBedrockBot, BOT_EMAIL } from '@/lib/bedrock';
import * as DocumentPicker from 'expo-document-picker';
import { uploadFile, isImageFile, isAudioFile, isVideoFile, getFileUrl } from '@/lib/image-upload';
import { Audio, Video } from 'expo-av';
import EmojiPicker from 'emoji-picker-react';

// Audio progress bar component
function AudioProgressBar({
  messageId,
  progress,
  isUser,
  onSeek
}: {
  messageId: string;
  progress: { position: number; duration: number } | undefined;
  isUser: boolean;
  onSeek: (messageId: string, percentage: number) => void;
}) {
  const progressBarRef = useRef<View>(null);
  const [barLayout, setBarLayout] = useState({ width: 0, x: 0 });

  const percentage = progress && progress.duration > 0
    ? (progress.position / progress.duration) * 100
    : 0;

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      if (!progress || progress.duration === 0) return;

      const touchX = evt.nativeEvent.pageX - barLayout.x;
      const newPercentage = Math.max(0, Math.min(100, (touchX / barLayout.width) * 100));
      onSeek(messageId, newPercentage);
    },
    onPanResponderMove: (evt) => {
      if (!progress || progress.duration === 0) return;

      const touchX = evt.nativeEvent.pageX - barLayout.x;
      const newPercentage = Math.max(0, Math.min(100, (touchX / barLayout.width) * 100));
      onSeek(messageId, newPercentage);
    },
    onPanResponderRelease: () => {
      // Optional: resume playback if it was playing
    },
  }), [progress, barLayout, messageId, onSeek]);

  return (
    <View className="mt-3 px-1">
      <View
        ref={progressBarRef}
        onLayout={(event) => {
          const { width, x } = event.nativeEvent.layout;
          progressBarRef.current?.measure((fx, fy, w, h, px, py) => {
            setBarLayout({ width: w, x: px });
          });
        }}
        {...panResponder.panHandlers}
      >
        <View className="py-2">
          <View className="h-1 bg-gray-300 rounded-full">
            <View
              className={`h-full ${isUser ? 'bg-purple-300' : 'bg-purple-500'} rounded-full`}
              style={{ width: `${percentage}%` }}
            />
          </View>
          {/* Playhead */}
          <View
            className="absolute"
            style={{
              left: `${percentage}%`,
              top: '50%',
              transform: [{ translateX: -6 }, { translateY: -6 }],
            }}
          >
            <View
              className={`w-3 h-3 rounded-full ${
                isUser ? 'bg-purple-400' : 'bg-purple-600'
              } border-2 border-white`}
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.3,
                shadowRadius: 2,
                elevation: 3,
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

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
  const [notifications, setNotifications] = useState<Schema['ChannelNotification']['type'][]>([]);
  const [replyingTo, setReplyingTo] = useState<Schema['ServerMessage']['type'] | null>(null);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentSound, setCurrentSound] = useState<Audio.Sound | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState<Record<string, { position: number; duration: number }>>({});
  const [pendingFiles, setPendingFiles] = useState<Array<{
    uri: string;
    name: string;
    type: string;
  }>>([]);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<Record<string, Schema['ServerReaction']['type'][]>>({});
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768; // Show sidebar on tablets and larger

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
      const messageSubscription = client.models.ServerMessage.observeQuery({
        filter: {
          channelId: { eq: activeChannel.id },
        },
      }).subscribe({
        next: async ({ items }) => {
          const sortedMessages = [...items].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          const validMessages = sortedMessages.filter((msg) => msg !== null);
          setMessages(validMessages);

          // Load fresh URLs for all messages with files
          await loadFileUrls(validMessages);

          // Load reactions for all messages
          const messageIds = validMessages.map((msg) => msg.id);
          await loadReactions(messageIds);
        },
      });

      // Subscribe to reactions
      const reactionSubscription = client.models.ServerReaction.observeQuery().subscribe({
        next: ({ items }) => {
          // Group all reactions by message ID
          const reactionsByMessage: Record<string, Schema['ServerReaction']['type'][]> = {};
          items.forEach((reaction) => {
            if (reaction) {
              if (!reactionsByMessage[reaction.messageId]) {
                reactionsByMessage[reaction.messageId] = [];
              }
              reactionsByMessage[reaction.messageId].push(reaction);
            }
          });
          setReactions(reactionsByMessage);
        },
      });

      return () => {
        messageSubscription.unsubscribe();
        reactionSubscription.unsubscribe();
      };
    }
  }, [activeChannel]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (currentSound) {
        currentSound.unloadAsync();
      }
    };
  }, [currentSound]);

  async function loadFileUrls(messages: Schema['ServerMessage']['type'][]) {
    const urlMap: Record<string, string> = {};

    for (const msg of messages) {
      if (msg.filePath) {
        try {
          const freshUrl = await getFileUrl(msg.filePath);
          urlMap[msg.id] = freshUrl;
        } catch (error) {
          console.error('Error loading file URL:', error);
        }
      }
    }

    setFileUrls(urlMap);
  }

  async function loadReactions(messageIds: string[]) {
    try {
      const { data: allReactions } = await client.models.ServerReaction.list();

      // Group reactions by message ID
      const reactionsByMessage: Record<string, Schema['ServerReaction']['type'][]> = {};
      allReactions.forEach((reaction) => {
        if (reaction && messageIds.includes(reaction.messageId)) {
          if (!reactionsByMessage[reaction.messageId]) {
            reactionsByMessage[reaction.messageId] = [];
          }
          reactionsByMessage[reaction.messageId].push(reaction);
        }
      });

      setReactions(reactionsByMessage);
    } catch (error) {
      console.error('Error loading reactions:', error);
    }
  }

  async function pickFile() {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '*/*';
        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
              const dataUrl = event.target?.result as string;
              setPendingFiles((prev) => [
                ...prev,
                {
                  uri: dataUrl,
                  name: file.name,
                  type: file.type,
                },
              ]);
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
        });

        if (!result.canceled && result.assets[0]) {
          const asset = result.assets[0];
          setPendingFiles((prev) => [
            ...prev,
            {
              uri: asset.uri,
              name: asset.name,
              type: asset.mimeType || 'application/octet-stream',
            },
          ]);
        }
      }
    } catch (error) {
      console.error('Error picking file:', error);
    }
  }

  async function sendFileMessage(fileUri: string, fileName?: string, fileType?: string) {
    if (!user?.email || !serverId || !activeChannel) return;

    const result = await uploadFile(fileUri, fileName, fileType);

    const isImage = isImageFile(result.fileType);
    const isAudio = isAudioFile(result.fileType);
    const isVideo = isVideoFile(result.fileType);
    let content = '[File]';
    if (isImage) content = '[Image]';
    else if (isAudio) content = '[Audio]';
    else if (isVideo) content = '[Video]';
    else content = `[File: ${result.fileName}]`;

    await client.models.ServerMessage.create({
      serverId: serverId,
      channelId: activeChannel.id,
      senderEmail: user.email,
      content,
      fileUrl: result.url,
      filePath: result.path,
      fileName: result.fileName,
      fileType: result.fileType,
      createdAt: new Date().toISOString(),
    });
  }

  async function playAudio(fileUrl: string, messageId: string) {
    try {
      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        setCurrentSound(null);

        if (playingMessageId === messageId) {
          setPlayingMessageId(null);
          return;
        }
      }

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUrl },
        { shouldPlay: true }
      );

      setCurrentSound(sound);
      setPlayingMessageId(messageId);
      setIsAudioPlaying(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setIsAudioPlaying(status.isPlaying || false);

          setAudioProgress(prev => ({
            ...prev,
            [messageId]: {
              position: status.positionMillis || 0,
              duration: status.durationMillis || 0,
            }
          }));

          if (status.didJustFinish) {
            setPlayingMessageId(null);
            setIsAudioPlaying(false);
            sound.unloadAsync();
            setCurrentSound(null);
          }
        }
      });
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }

  async function pauseAudio() {
    try {
      if (currentSound) {
        await currentSound.pauseAsync();
        setIsAudioPlaying(false);
      }
    } catch (error) {
      console.error('Error pausing audio:', error);
    }
  }

  async function resumeAudio() {
    try {
      if (currentSound) {
        await currentSound.playAsync();
        setIsAudioPlaying(true);
      }
    } catch (error) {
      console.error('Error resuming audio:', error);
    }
  }

  async function seekAudio(messageId: string, percentage: number) {
    try {
      const progress = audioProgress[messageId];

      if (currentSound && playingMessageId === messageId && progress && progress.duration > 0) {
        const position = (percentage / 100) * progress.duration;
        await currentSound.setPositionAsync(position);
      }
    } catch (error) {
      console.error('Error seeking audio:', error);
    }
  }

  async function addReaction(messageId: string, emoji: string) {
    if (!user?.email) return;

    try {
      const existingReaction = reactions[messageId]?.find(
        (r) => r.userEmail === user.email && r.emoji === emoji
      );

      if (existingReaction) {
        await client.models.ServerReaction.delete({ id: existingReaction.id });
      } else {
        await client.models.ServerReaction.create({
          messageId,
          userEmail: user.email,
          emoji,
          createdAt: new Date().toISOString(),
        });
      }

      setShowReactionPicker(null);
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  }

  async function handleDeleteMessage(message: Schema['ServerMessage']['type']) {
    setOpenMenuId(null);

    if (message.senderEmail !== user?.email) {
      return;
    }

    try {
      await client.models.ServerMessage.delete({ id: message.id });
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }

  function handleEmojiSelect(emojiData: any) {
    setInputText(prev => prev + emojiData.emoji);
  }

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
    setShowChannelModal(false); // Close modal on mobile
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
    if (!inputText.trim() && pendingFiles.length === 0) return;
    if (!user?.email || !serverId || !activeChannel) return;

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
      setUploading(true);

      // Send text message first if there is one
      let newMessage: Schema['ServerMessage']['type'] | null | undefined = null;
      if (inputText.trim()) {
        const { data } = await client.models.ServerMessage.create({
          serverId: serverId,
          channelId: activeChannel.id,
          senderEmail: user.email,
          content: messageContent,
          createdAt: new Date().toISOString(),
          ...(replyingTo && { replyToMessageId: replyingTo.id }),
        });
        newMessage = data;
      }

      // Send each file as a separate message
      for (const file of pendingFiles) {
        await sendFileMessage(file.uri, file.name, file.type);
      }

      // Clear input, files, and reply
      setInputText('');
      setPendingFiles([]);
      cancelReply();
      setUploading(false);

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


      // Check if message mentions @bot
      if (messageContent.toLowerCase().includes('@bot')) {
        // Extract question (remove @bot from the message)
        const question = messageContent.replace(/@bot/gi, '').trim();

        if (question) {
          try {
            // Call Bedrock bot
            const botResponse = await callBedrockBot(question);

            // Post bot response as a server message
            await client.models.ServerMessage.create({
              serverId: serverId,
              channelId: activeChannel.id,
              senderEmail: BOT_EMAIL,
              content: botResponse,
              createdAt: new Date().toISOString(),
              ...(newMessage && { replyToMessageId: newMessage.id }), // Reply to the user's message
            });
          } catch (botError) {
            console.error('Error calling bot:', botError);
            // Post error message
            await client.models.ServerMessage.create({
              serverId: serverId,
              channelId: activeChannel.id,
              senderEmail: BOT_EMAIL,
              content: 'Sorry, I encountered an error processing your request. Please try again.',
              createdAt: new Date().toISOString(),
              ...(newMessage && { replyToMessageId: newMessage.id }),
            });
          }
        }
      }

      // Auto-scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      setUploading(false);
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
    const hasFile = !!item.fileUrl || !!item.filePath;
    const isImage = hasFile && item.fileType && isImageFile(item.fileType);
    const isAudio = hasFile && item.fileType && isAudioFile(item.fileType);
    const isVideo = hasFile && item.fileType && isVideoFile(item.fileType);
    const isThisAudioLoaded = playingMessageId === item.id;
    const isPlaying = isThisAudioLoaded && isAudioPlaying;
    const fileUrl = fileUrls[item.id] || item.fileUrl;

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
          <View className={`flex-row ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-2`}>
            {/* 3-dot menu button */}
            <TouchableOpacity
              className="w-6 h-6 rounded-full bg-gray-300 items-center justify-center mt-1"
              onPress={(event) => {
                event.currentTarget.measure((fx, fy, width, height, px, py) => {
                  const menuWidth = 120;
                  const xPosition = isUser ? px - menuWidth + width : px;
                  setMenuPosition({ x: xPosition, y: py + height });
                  setOpenMenuId(openMenuId === item.id ? null : item.id);
                });
              }}
            >
              <Text className="text-gray-700 text-xs font-bold">⋮</Text>
            </TouchableOpacity>

            <Pressable onLongPress={() => handleReply(item)} style={{ maxWidth: '70%' }}>
              <View
                style={hasFile && (isImage || isVideo) ? {
                  width: 240,
                  height: 240
                } : undefined}
                className={`${hasFile && (isImage || isVideo) ? '' : 'px-4 py-3 rounded-2xl'} ${
                  hasFile && (isImage || isVideo)
                    ? ''
                    : isUser
                    ? 'bg-purple-500 rounded-br-md'
                    : 'bg-white rounded-bl-md shadow-sm'
                }`}
                style={{ minWidth: hasFile && (isImage || isVideo) ? undefined : 80 }}
              >
                {repliedMessage && (
                  <View className={`mb-2 pb-2 border-l-2 pl-2 ${hasFile && (isImage || isVideo) ? 'px-4 pt-3' : ''} ${
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
                {hasFile && isImage ? (
                  <View className="overflow-hidden rounded-3xl">
                    <Image
                      source={{ uri: fileUrl }}
                      className="w-60 h-60"
                      resizeMode="cover"
                    />
                    {item.content !== '[Image]' && (
                      <View className="px-4 py-2">
                        <Text className={`text-base ${isUser ? 'text-white' : 'text-gray-900'}`}>
                          {item.content}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : hasFile && isVideo ? (
                  <View style={{ lineHeight: 0, fontSize: 0, maxWidth: 300 }}>
                    <View className="overflow-hidden rounded-3xl" style={{ maxWidth: 300, maxHeight: 400 }}>
                      <Video
                        source={{ uri: fileUrl }}
                        useNativeControls
                        resizeMode="contain"
                        isLooping={false}
                        style={{
                          width: '100%',
                          height: 'auto',
                          maxWidth: 300,
                          maxHeight: 400,
                          minHeight: 150,
                          display: 'block',
                          margin: 0,
                          padding: 0,
                          verticalAlign: 'top',
                          border: 'none',
                          outline: 'none',
                          aspectRatio: 'auto'
                        }}
                      />
                    </View>
                    {item.content !== '[Video]' && (
                      <View className="px-4 py-2 bg-gray-100 rounded-b-3xl">
                        <Text className={`text-base ${isUser ? 'text-white' : 'text-gray-900'}`}>
                          {item.content}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : hasFile && isAudio ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (fileUrl) {
                        if (isPlaying) {
                          pauseAudio();
                        } else if (isThisAudioLoaded) {
                          resumeAudio();
                        } else {
                          playAudio(fileUrl, item.id);
                        }
                      }
                    }}
                  >
                    <View className="min-w-[250px]">
                      <View className="flex-row items-center gap-3">
                        <View className={`w-10 h-10 rounded-full items-center justify-center ${
                          isUser ? 'bg-purple-400' : 'bg-gray-300'
                        }`}>
                          <Text className="text-xl">{isPlaying ? '⏸' : '▶️'}</Text>
                        </View>
                        <View className="flex-1">
                          <Text className={`text-base font-semibold ${isUser ? 'text-white' : 'text-gray-900'}`}>
                            {item.fileName || 'Audio'}
                          </Text>
                          <Text className={`text-xs ${isUser ? 'text-purple-100' : 'text-gray-600'}`}>
                            {(() => {
                              const progress = audioProgress[item.id];
                              if (progress && progress.duration > 0) {
                                const current = Math.floor(progress.position / 1000);
                                const total = Math.floor(progress.duration / 1000);
                                return `${Math.floor(current / 60)}:${(current % 60).toString().padStart(2, '0')} / ${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
                              }
                              return '0:00 / 0:00';
                            })()}
                          </Text>
                        </View>
                      </View>
                      <AudioProgressBar
                        messageId={item.id}
                        progress={audioProgress[item.id]}
                        isUser={isUser}
                        onSeek={seekAudio}
                      />
                    </View>
                  </TouchableOpacity>
                ) : hasFile ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (fileUrl) {
                        if (Platform.OS === 'web') {
                          window.open(fileUrl, '_blank');
                        }
                      }
                    }}
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className="text-2xl">📎</Text>
                      <View className="flex-1">
                        <Text className={`text-base font-semibold ${isUser ? 'text-white' : 'text-gray-900'}`}>
                          {item.fileName || 'File'}
                        </Text>
                        {item.content !== `[File: ${item.fileName}]` && (
                          <Text className={`text-sm ${isUser ? 'text-purple-100' : 'text-gray-600'}`}>
                            {item.content}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                ) : (
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
                )}
              </View>
            </Pressable>
          </View>

          {/* Reactions Display */}
          {reactions[item.id] && reactions[item.id].length > 0 && (
            <View className={`flex-row flex-wrap gap-1 mt-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {(() => {
                const reactionGroups: Record<string, { emoji: string; users: string[]; hasCurrentUser: boolean }> = {};
                reactions[item.id].forEach((reaction) => {
                  if (!reactionGroups[reaction.emoji]) {
                    reactionGroups[reaction.emoji] = {
                      emoji: reaction.emoji,
                      users: [],
                      hasCurrentUser: false,
                    };
                  }
                  reactionGroups[reaction.emoji].users.push(reaction.userEmail);
                  if (reaction.userEmail === user?.email) {
                    reactionGroups[reaction.emoji].hasCurrentUser = true;
                  }
                });

                return Object.values(reactionGroups).map((group) => (
                  <TouchableOpacity
                    key={group.emoji}
                    className={`flex-row items-center px-2 py-1 rounded-full ${
                      group.hasCurrentUser ? 'bg-purple-100 border-2 border-purple-500' : 'bg-gray-100 border border-gray-300'
                    }`}
                    onPress={() => addReaction(item.id, group.emoji)}
                  >
                    <Text className="text-sm mr-1">{group.emoji}</Text>
                    <Text className={`text-xs font-semibold ${group.hasCurrentUser ? 'text-purple-700' : 'text-gray-600'}`}>
                      {group.users.length}
                    </Text>
                  </TouchableOpacity>
                ));
              })()}
            </View>
          )}

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

  // Render channel list (used in both sidebar and modal)
  const renderChannelList = () => (
    <FlatList
      data={channels}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 8 }}
      renderItem={({ item }) => {
        const unreadCount = getUnreadNotificationCount(item.id);
        const hasNotifications = unreadCount > 0;

        return (
          <TouchableOpacity
            className={`flex-row items-center px-3 py-2.5 rounded-lg mb-1 ${
              activeChannel?.id === item.id
                ? 'bg-purple-500'
                : 'bg-gray-50'
            } active:opacity-70`}
            onPress={() => switchChannel(item)}
          >
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text
                  className={`text-sm font-semibold ${
                    activeChannel?.id === item.id
                      ? 'text-white'
                      : 'text-gray-900'
                  }`}
                  numberOfLines={1}
                >
                  # {item.name}
                </Text>
                {hasNotifications && (
                  <View className="bg-red-500 w-5 h-5 rounded-full items-center justify-center">
                    <Text className="text-white text-[10px] font-bold">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <View className="flex-row items-center gap-1.5 mt-1">
                {item.isGeneral && (
                  <View
                    className={`px-1.5 py-0.5 rounded ${
                      activeChannel?.id === item.id
                        ? 'bg-white/20'
                        : 'bg-blue-100'
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-semibold ${
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
                    className={`px-1.5 py-0.5 rounded ${
                      activeChannel?.id === item.id
                        ? 'bg-white/20'
                        : (item.restricted ?? false)
                        ? 'bg-orange-100'
                        : 'bg-gray-100'
                    } ${canManageChannels ? 'active:opacity-70' : ''}`}
                    onPress={(e) => {
                      if (canManageChannels) {
                        e.stopPropagation();
                        toggleChannelRestriction(item);
                      }
                    }}
                    disabled={!canManageChannels}
                  >
                    <Text
                      className={`text-[10px] font-semibold ${
                        activeChannel?.id === item.id
                          ? 'text-white'
                          : (item.restricted ?? false)
                          ? 'text-orange-700'
                          : 'text-gray-500'
                      }`}
                    >
                      {(item.restricted ?? false) ? '🔒' : '🔓'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
      ListFooterComponent={
        canManageChannels ? (
          <TouchableOpacity
            className="flex-row items-center justify-center px-3 py-2.5 rounded-lg bg-green-50 active:opacity-70 mt-1"
            onPress={() => {
              setShowChannelModal(false);
              router.push({
                pathname: '/server/channels/[serverId]',
                params: { serverId, serverName, ownerEmail },
              });
            }}
          >
            <Text className="text-green-700 text-xs font-semibold">
              + New Channel
            </Text>
          </TouchableOpacity>
        ) : null
      }
    />
  );

  return (
    <View className="flex-1 flex-row bg-gray-50">
      {/* Sidebar (Large Screens Only) */}
      {isLargeScreen && (
        <View className="w-64 bg-white border-r border-gray-200">
        {/* Sidebar Header */}
        <View className="pt-2 px-4 pb-4 border-b border-gray-100">
          <View className="flex-row items-center justify-between mb-2">
            <TouchableOpacity
              className="active:opacity-70"
              onPress={() => router.back()}
            >
              <Text className="text-blue-500 text-2xl">‹</Text>
            </TouchableOpacity>
            {isOwner && (
              <TouchableOpacity
                className="bg-gray-100 w-8 h-8 rounded-full items-center justify-center active:opacity-70"
                onPress={() =>
                  router.push({
                    pathname: '/server/settings/[serverId]',
                    params: { serverId, serverName, ownerEmail },
                  })
                }
              >
                <Text className="text-gray-700 text-base">⚙</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text className="text-lg font-bold text-gray-900" numberOfLines={1}>
            {serverName || 'Server'}
          </Text>
          <Text className="text-xs text-gray-500 mt-1">
            {channels.length} {channels.length === 1 ? 'channel' : 'channels'}
          </Text>
        </View>

        {/* Channels List */}
        {renderChannelList()}
      </View>
      )}

      {/* Main Chat Area */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Chat Header */}
        <View className="pt-2 px-4 pb-4 bg-white border-b border-gray-100">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center gap-3">
              {!isLargeScreen && (
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    className="active:opacity-70"
                    onPress={() => router.back()}
                  >
                    <Text className="text-blue-500 text-2xl">‹</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="active:opacity-70"
                    onPress={() => setShowChannelModal(true)}
                  >
                    <View className="w-9 h-9 rounded-xl bg-purple-500 items-center justify-center">
                      <Text className="text-white text-sm font-bold">#</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">
                  #{activeChannel?.name || 'general'}
                </Text>
                <Text className="text-xs text-gray-500">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </Text>
              </View>
            </View>
            {!isLargeScreen && isOwner && (
              <TouchableOpacity
                className="bg-gray-100 w-9 h-9 rounded-full items-center justify-center active:opacity-70"
                onPress={() =>
                  router.push({
                    pathname: '/server/settings/[serverId]',
                    params: { serverId, serverName, ownerEmail },
                  })
                }
              >
                <Text className="text-gray-700 text-base">⚙</Text>
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
                Be the first to send a message in #{activeChannel?.name || 'this channel'}!
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

          {/* Emoji Picker */}
          {showEmojiPicker && (
            <View className="bg-white border-t border-gray-200" style={{ height: 350 }}>
              <EmojiPicker
                onEmojiClick={handleEmojiSelect}
                width="100%"
                height={350}
              />
            </View>
          )}

          <View className="flex-row items-end">
            <TouchableOpacity
              className="w-9 h-9 rounded-full items-center justify-center mb-1 mr-2 bg-gray-200 active:opacity-70"
              onPress={pickFile}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#8B5CF6" />
              ) : (
                <Text className="text-gray-600 text-xl">📎</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              className="w-9 h-9 rounded-full items-center justify-center mb-1 mr-2 bg-gray-200 active:opacity-70"
              onPress={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <Text className="text-gray-600 text-xl">😊</Text>
            </TouchableOpacity>
            <View className="flex-1 bg-gray-100 rounded-3xl px-5 py-2 mr-2">
              {/* File Previews inside input */}
              {pendingFiles.length > 0 && (
                <View className="mb-2 gap-2">
                  {pendingFiles.map((file, index) => (
                    <View key={index} className="flex-row items-center bg-white rounded-2xl p-2 border border-gray-200">
                      {isImageFile(file.type) ? (
                        <Image
                          source={{ uri: file.uri }}
                          className="w-12 h-12 rounded-lg"
                          resizeMode="cover"
                        />
                      ) : isVideoFile(file.type) ? (
                        <View className="w-12 h-12 rounded-lg bg-gray-200 items-center justify-center">
                          <Text className="text-xl">🎥</Text>
                        </View>
                      ) : (
                        <View className="w-12 h-12 rounded-lg bg-gray-200 items-center justify-center">
                          <Text className="text-xl">
                            {isAudioFile(file.type) ? '🎵' : '📎'}
                          </Text>
                        </View>
                      )}
                      <View className="flex-1 ml-2">
                        <Text className="text-xs font-semibold text-gray-900" numberOfLines={1}>
                          {file.name}
                        </Text>
                        <Text className="text-xs text-gray-500">
                          {isImageFile(file.type) ? 'Image' : isVideoFile(file.type) ? 'Video' : isAudioFile(file.type) ? 'Audio' : 'File'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        className="w-5 h-5 rounded-full bg-gray-300 items-center justify-center ml-1 active:opacity-70"
                        onPress={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Text className="text-gray-700 text-xs font-bold">✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
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
                (inputText.trim() || pendingFiles.length > 0) && (!(activeChannel?.restricted ?? false) || canManageChannels)
                  ? 'bg-purple-500'
                  : 'bg-gray-300'
              } active:opacity-70`}
              onPress={sendMessage}
              disabled={(!inputText.trim() && pendingFiles.length === 0) || ((activeChannel?.restricted ?? false) && !canManageChannels)}
            >
              <Text className="text-white text-lg font-bold">↑</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Channel Modal (Mobile Only) */}
      {!isLargeScreen && (
        <Modal
          visible={showChannelModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowChannelModal(false)}
        >
          <View className="flex-1 bg-black/50">
            <TouchableOpacity
              className="flex-1"
              activeOpacity={1}
              onPress={() => setShowChannelModal(false)}
            />
            <View className="bg-white rounded-t-3xl max-h-[70%]">
              <View className="px-6 pt-6 pb-4 border-b border-gray-100">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-2xl font-bold text-gray-900">Channels</Text>
                  <TouchableOpacity
                    className="active:opacity-70"
                    onPress={() => setShowChannelModal(false)}
                  >
                    <Text className="text-gray-500 text-2xl">✕</Text>
                  </TouchableOpacity>
                </View>
                <Text className="text-gray-500 text-sm">
                  {channels.length} {channels.length === 1 ? 'channel' : 'channels'}
                </Text>
              </View>
              {renderChannelList()}
            </View>
          </View>
        </Modal>
      )}

      {/* 3-Dot Menu Modal */}
      <Modal
        visible={openMenuId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenMenuId(null)}
      >
        <TouchableOpacity
          className="flex-1"
          activeOpacity={1}
          onPress={() => setOpenMenuId(null)}
        >
          <View
            style={{
              position: 'absolute',
              top: menuPosition?.y || 0,
              left: menuPosition?.x || 0,
              backgroundColor: 'white',
              borderRadius: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 3.84,
              elevation: 5,
              minWidth: 120,
            }}
          >
            <TouchableOpacity
              className="px-4 py-3 border-b border-gray-100 active:bg-gray-50"
              onPress={() => {
                setShowReactionPicker(openMenuId);
                setOpenMenuId(null);
              }}
            >
              <Text className="text-gray-900 text-sm">React</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="px-4 py-3 border-b border-gray-100 active:bg-gray-50"
              onPress={() => {
                const message = messages.find((m) => m.id === openMenuId);
                if (message) {
                  setReplyingTo(message);
                  setOpenMenuId(null);
                }
              }}
            >
              <Text className="text-gray-900 text-sm">Reply</Text>
            </TouchableOpacity>
            {messages.find((m) => m.id === openMenuId)?.senderEmail === user?.email && (
              <TouchableOpacity
                className="px-4 py-3 active:bg-gray-50"
                onPress={() => {
                  if (openMenuId) {
                    handleDeleteMessage(openMenuId);
                    setOpenMenuId(null);
                  }
                }}
              >
                <Text className="text-red-500 text-sm">Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Reaction Picker Modal */}
      <Modal
        visible={showReactionPicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReactionPicker(null)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/30 items-center justify-center"
          activeOpacity={1}
          onPress={() => setShowReactionPicker(null)}
        >
          <View className="bg-white rounded-2xl p-4 mx-4" style={{ maxWidth: 300 }}>
            <Text className="text-sm font-semibold text-gray-900 mb-3 text-center">
              React to message
            </Text>
            <View className="flex-row flex-wrap justify-center gap-2">
              {['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '🎉'].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  className="w-12 h-12 items-center justify-center bg-gray-100 rounded-xl active:bg-gray-200"
                  onPress={() => {
                    if (showReactionPicker) {
                      addReaction(showReactionPicker, emoji);
                    }
                  }}
                >
                  <Text className="text-2xl">{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
