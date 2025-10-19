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
  Image,
  Alert,
  GestureResponderEvent,
  PanResponder,
} from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { router, useLocalSearchParams } from 'expo-router';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import * as DocumentPicker from 'expo-document-picker';
import { uploadFile, isImageFile, isAudioFile, getFileUrl } from '@/lib/image-upload';
import { Audio } from 'expo-av';

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
              className={`h-full ${isUser ? 'bg-blue-300' : 'bg-blue-500'} rounded-full`}
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
                isUser ? 'bg-blue-400' : 'bg-blue-600'
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

export default function ChatScreen() {
  const { user } = useAuth();
  const { friendEmail } = useLocalSearchParams<{ friendEmail: string }>();
  const client = useMemo(() => generateClient<Schema>(), []);
  const [messages, setMessages] = useState<Schema['Message']['type'][]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
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
        next: async ({ items }) => {
          const sortedMessages = [...items].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          const validMessages = sortedMessages.filter((msg) => msg !== null);
          setMessages(validMessages);

          // Load fresh URLs for all messages with files
          await loadFileUrls(validMessages);
        },
      });

      return () => subscription.unsubscribe();
    }
  }, [user?.email, friendEmail]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (currentSound) {
        currentSound.unloadAsync();
      }
    };
  }, [currentSound]);

  async function loadFileUrls(messages: Schema['Message']['type'][]) {
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

      // Load fresh URLs for files
      await loadFileUrls(sortedMessages);

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

  async function pickFile() {
    try {
      if (Platform.OS === 'web') {
        // Web: Use HTML file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '*/*'; // Accept all file types
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
        // Mobile: Use expo-document-picker
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
      Alert.alert('Error', 'Failed to pick file');
    }
  }

  async function sendFileMessage(fileUri: string, fileName?: string, fileType?: string) {
    if (!user?.email || !friendEmail) {
      console.error('Missing user email or friend email');
      return;
    }

    console.log('Starting file upload...', { fileName, fileType });

    // Upload file to S3
    const result = await uploadFile(fileUri, fileName, fileType);
    console.log('File upload result:', result);

    // Determine content based on file type
    const isImage = isImageFile(result.fileType);
    const isAudio = isAudioFile(result.fileType);
    let content = '[File]';
    if (isImage) content = '[Image]';
    else if (isAudio) content = '[Audio]';
    else content = `[File: ${result.fileName}]`;

    console.log('Creating message with:', {
      senderEmail: user.email,
      receiverEmail: friendEmail,
      content,
      fileName: result.fileName,
      fileType: result.fileType,
    });

    // Send message with file URL and metadata
    const createdMessage = await client.models.Message.create({
      senderEmail: user.email,
      receiverEmail: friendEmail,
      content,
      fileUrl: result.url,
      filePath: result.path,
      fileName: result.fileName,
      fileType: result.fileType,
      createdAt: new Date().toISOString(),
      read: false,
    });

    console.log('Message created:', createdMessage);

    // Auto-scroll to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }

  async function sendMessage() {
    if (!user?.email || !friendEmail) return;
    if (!inputText.trim() && pendingFiles.length === 0) return;

    try {
      setUploading(true);

      // Send text message first if there is one
      if (inputText.trim()) {
        await client.models.Message.create({
          senderEmail: user.email,
          receiverEmail: friendEmail,
          content: inputText.trim(),
          createdAt: new Date().toISOString(),
          read: false,
        });
      }

      // Send each file as a separate message
      for (const file of pendingFiles) {
        await sendFileMessage(file.uri, file.name, file.type);
      }

      // Clear input and files
      setInputText('');
      setPendingFiles([]);
      setUploading(false);

      // Auto-scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      setUploading(false);
    }
  }

  async function playAudio(fileUrl: string, messageId: string) {
    try {
      // If already playing, stop it
      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        setCurrentSound(null);

        // If clicking the same audio, just stop
        if (playingMessageId === messageId) {
          setPlayingMessageId(null);
          return;
        }
      }

      // Set audio mode for playback
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Load and play new audio
      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUrl },
        { shouldPlay: true }
      );

      setCurrentSound(sound);
      setPlayingMessageId(messageId);
      setIsAudioPlaying(true);

      // Set up playback status update
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          // Update playing state
          setIsAudioPlaying(status.isPlaying || false);

          // Update progress
          setAudioProgress(prev => ({
            ...prev,
            [messageId]: {
              position: status.positionMillis || 0,
              duration: status.durationMillis || 0,
            }
          }));

          // Check if finished
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
      Alert.alert('Error', 'Failed to play audio file');
    }
  }

  async function pauseAudio() {
    try {
      if (currentSound) {
        await currentSound.pauseAsync();
        setIsAudioPlaying(false);
        // Don't set playingMessageId to null, so we can still seek while paused
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

      // If we have a current sound and it's for this message
      if (currentSound && playingMessageId === messageId && progress && progress.duration > 0) {
        const position = (percentage / 100) * progress.duration;
        await currentSound.setPositionAsync(position);
      }
    } catch (error) {
      console.error('Error seeking audio:', error);
    }
  }

  function renderMessage({ item }: { item: Schema['Message']['type'] }) {
    const isUser = item.senderEmail === user?.email;
    const hasFile = !!item.fileUrl || !!item.filePath;
    const isImage = hasFile && item.fileType && isImageFile(item.fileType);
    const isAudio = hasFile && item.fileType && isAudioFile(item.fileType);
    const isThisAudioLoaded = playingMessageId === item.id;
    const isPlaying = isThisAudioLoaded && isAudioPlaying;
    // Use fresh URL from fileUrls map (generated from filePath) if available, otherwise fall back to stored fileUrl
    const fileUrl = fileUrls[item.id] || item.fileUrl;

    return (
      <View className={`mb-2 px-4 ${isUser ? 'items-end' : 'items-start'}`}>
        <View
          className={`max-w-[75%] ${hasFile && isImage ? '' : 'px-4 py-3'} rounded-3xl ${
            isUser
              ? 'bg-blue-500 rounded-br-md'
              : 'bg-gray-200 rounded-bl-md'
          }`}
        >
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
          ) : hasFile && isAudio ? (
            <TouchableOpacity
              onPress={() => {
                if (item.fileUrl) {
                  if (isPlaying) {
                    pauseAudio();
                  } else if (isThisAudioLoaded) {
                    // If this audio is loaded but paused, resume it
                    resumeAudio();
                  } else {
                    // Otherwise start playing from beginning
                    playAudio(item.fileUrl, item.id);
                  }
                }
              }}
            >
              <View className="min-w-[250px]">
                <View className="flex-row items-center gap-3">
                  <View className={`w-10 h-10 rounded-full items-center justify-center ${
                    isUser ? 'bg-blue-400' : 'bg-gray-300'
                  }`}>
                    <Text className="text-xl">{isPlaying ? '⏸' : '▶️'}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className={`text-base font-semibold ${isUser ? 'text-white' : 'text-gray-900'}`}>
                      {item.fileName || 'Audio'}
                    </Text>
                    <Text className={`text-xs ${isUser ? 'text-blue-100' : 'text-gray-600'}`}>
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
                  // Open file in browser/download
                  if (Platform.OS === 'web') {
                    window.open(fileUrl, '_blank');
                  } else {
                    Alert.alert('File', `File: ${item.fileName}\nTap to download`);
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
                    <Text className={`text-sm ${isUser ? 'text-blue-100' : 'text-gray-600'}`}>
                      {item.content}
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <Text className={`text-base ${isUser ? 'text-white' : 'text-gray-900'}`}>
              {item.content}
            </Text>
          )}
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
        <View className="pt-2 px-6 pb-4 bg-white border-b border-gray-100 flex-row items-center">
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
      <View className="pt-2 px-4 pb-4 bg-white border-b border-gray-100">
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
          <TouchableOpacity
            className="w-9 h-9 rounded-full items-center justify-center mb-1 mr-2 bg-gray-200 active:opacity-70"
            onPress={pickFile}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <Text className="text-gray-600 text-xl">📎</Text>
            )}
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
                        {isImageFile(file.type) ? 'Image' : isAudioFile(file.type) ? 'Audio' : 'File'}
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
              inputText.trim() || pendingFiles.length > 0 ? 'bg-blue-500' : 'bg-gray-300'
            } active:opacity-70`}
            onPress={sendMessage}
            disabled={!inputText.trim() && pendingFiles.length === 0}
          >
            <Text className="text-white text-lg font-bold">↑</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
