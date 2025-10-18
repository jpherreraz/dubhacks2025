import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

type Tab = 'friends' | 'requests';

export default function FriendsScreen() {
  const { user } = useAuth();
  const client = useMemo(() => generateClient<Schema>(), []);
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Schema['Friend']['type'][]>([]);
  const [sentRequests, setSentRequests] = useState<Schema['FriendRequest']['type'][]>([]);
  const [receivedRequests, setReceivedRequests] = useState<Schema['FriendRequest']['type'][]>([]);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    console.log('FriendsScreen mounted, user:', user);
    if (user?.email) {
      fetchData();
    }
  }, [user?.email]);

  async function fetchData() {
    try {
      await Promise.all([fetchFriends(), fetchRequests()]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchFriends() {
    try {
      const { data: friendsList } = await client.models.Friend.list();
      console.log('All friends from DB:', friendsList);
      console.log('Current user email:', user?.email);

      // Only show friends where the current user is the owner
      const myFriends = friendsList.filter(
        (item) => item !== null && item.userEmail === user?.email
      );
      console.log('My friends after filter:', myFriends);
      setFriends(myFriends);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  }

  async function fetchRequests() {
    try {
      const { data: allRequests } = await client.models.FriendRequest.list();
      console.log('All friend requests:', allRequests);
      console.log('Current user email:', user?.email);

      // Filter out null values and separate sent and received requests
      const validRequests = allRequests.filter((req) => req !== null);
      console.log('Valid requests:', validRequests);

      const sent = validRequests.filter(
        (req) => req.senderEmail === user?.email && req.status === 'PENDING'
      );
      const received = validRequests.filter(
        (req) => req.receiverEmail === user?.email && req.status === 'PENDING'
      );

      console.log('Sent requests:', sent);
      console.log('Received requests:', received);

      setSentRequests(sent);
      setReceivedRequests(received);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  }

  async function handleSendRequest() {
    if (!friendEmail.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(friendEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (friendEmail.toLowerCase() === user?.email?.toLowerCase()) {
      Alert.alert('Error', "You can't send a friend request to yourself");
      return;
    }

    // Check if already friends
    if (friends.some((f) => f.friendEmail.toLowerCase() === friendEmail.toLowerCase())) {
      Alert.alert('Error', 'You are already friends with this person');
      return;
    }

    // Check if request already sent
    if (sentRequests.some((r) => r.receiverEmail.toLowerCase() === friendEmail.toLowerCase())) {
      Alert.alert('Error', 'Friend request already sent');
      return;
    }

    setSending(true);
    try {
      const { data: newRequest } = await client.models.FriendRequest.create({
        senderEmail: user?.email || '',
        receiverEmail: friendEmail.trim(),
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });

      if (newRequest) {
        setSentRequests((prev) => [...prev, newRequest]);
        setFriendEmail('');
        setShowAddFriend(false);
        Alert.alert('Success', `Friend request sent to ${friendEmail}!`);
      }
    } catch (error) {
      console.error('Error sending request:', error);
      Alert.alert('Error', 'Failed to send friend request');
    } finally {
      setSending(false);
    }
  }

  async function handleAcceptRequest(request: Schema['FriendRequest']['type']) {
    try {
      // Update request status
      await client.models.FriendRequest.update({
        id: request.id,
        status: 'ACCEPTED',
      });

      // Create friendship for both users
      const now = new Date().toISOString();
      await Promise.all([
        client.models.Friend.create({
          userEmail: user?.email || '',
          friendEmail: request.senderEmail,
          addedAt: now,
        }),
        client.models.Friend.create({
          userEmail: request.senderEmail,
          friendEmail: user?.email || '',
          addedAt: now,
        }),
      ]);

      // Refresh data
      await fetchData();
      Alert.alert('Success', `You are now friends with ${request.senderEmail}!`);
    } catch (error) {
      console.error('Error accepting request:', error);
      Alert.alert('Error', 'Failed to accept friend request');
    }
  }

  async function handleRejectRequest(request: Schema['FriendRequest']['type']) {
    try {
      await client.models.FriendRequest.update({
        id: request.id,
        status: 'REJECTED',
      });

      setReceivedRequests((prev) => prev.filter((r) => r.id !== request.id));
      Alert.alert('Request rejected');
    } catch (error) {
      console.error('Error rejecting request:', error);
      Alert.alert('Error', 'Failed to reject request');
    }
  }

  async function handleCancelRequest(request: Schema['FriendRequest']['type']) {
    try {
      await client.models.FriendRequest.delete({ id: request.id });
      setSentRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (error) {
      console.error('Error canceling request:', error);
      Alert.alert('Error', 'Failed to cancel request');
    }
  }

  async function handleRemoveFriend(friend: Schema['Friend']['type']) {
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove ${friend.friendEmail}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await client.models.Friend.delete({ id: friend.id });
              setFriends((prev) => prev.filter((f) => f.id !== friend.id));
            } catch (error) {
              console.error('Error removing friend:', error);
              Alert.alert('Error', 'Failed to remove friend');
            }
          },
        },
      ]
    );
  }

  function renderFriend({ item }: { item: Schema['Friend']['type'] }) {
    return (
      <View style={styles.listItem}>
        <View style={styles.itemInfo}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>
              {item.friendEmail.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
          <View style={styles.itemDetails}>
            <ThemedText style={styles.itemEmail}>{item.friendEmail}</ThemedText>
            <ThemedText style={styles.itemDate}>
              Friends since {new Date(item.addedAt).toLocaleDateString()}
            </ThemedText>
          </View>
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemoveFriend(item)}
        >
          <ThemedText style={styles.removeButtonText}>Remove</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  function renderReceivedRequest({ item }: { item: Schema['FriendRequest']['type'] }) {
    return (
      <View style={styles.listItem}>
        <View style={styles.itemInfo}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>
              {item.senderEmail.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
          <View style={styles.itemDetails}>
            <ThemedText style={styles.itemEmail}>{item.senderEmail}</ThemedText>
            <ThemedText style={styles.itemDate}>
              Sent {new Date(item.createdAt).toLocaleDateString()}
            </ThemedText>
          </View>
        </View>
        <View style={styles.requestButtons}>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => handleAcceptRequest(item)}
          >
            <ThemedText style={styles.acceptButtonText}>Accept</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={() => handleRejectRequest(item)}
          >
            <ThemedText style={styles.rejectButtonText}>Reject</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderSentRequest({ item }: { item: Schema['FriendRequest']['type'] }) {
    return (
      <View style={styles.listItem}>
        <View style={styles.itemInfo}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>
              {item.receiverEmail.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
          <View style={styles.itemDetails}>
            <ThemedText style={styles.itemEmail}>{item.receiverEmail}</ThemedText>
            <ThemedText style={styles.itemDate}>Pending</ThemedText>
          </View>
        </View>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => handleCancelRequest(item)}
        >
          <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="title" style={styles.headerTitle}>
            Friends
          </ThemedText>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>
          Friends
        </ThemedText>
        <ThemedText style={styles.headerSubtitle}>
          {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
          {receivedRequests.length > 0 && ` • ${receivedRequests.length} pending`}
        </ThemedText>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'friends' && styles.activeTab]}
          onPress={() => setActiveTab('friends')}
        >
          <ThemedText
            style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}
          >
            Friends ({friends.length})
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
          onPress={() => setActiveTab('requests')}
        >
          <ThemedText
            style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}
          >
            Requests ({receivedRequests.length + sentRequests.length})
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Add Friend Section */}
      {activeTab === 'friends' && (
        <>
          {showAddFriend ? (
            <View style={styles.addFriendContainer}>
              <ThemedText style={styles.addFriendLabel}>
                Enter friend's email
              </ThemedText>
              <View style={styles.addFriendInput}>
                <TextInput
                  style={styles.input}
                  placeholder="friend@example.com"
                  placeholderTextColor="#999"
                  value={friendEmail}
                  onChangeText={setFriendEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                  editable={!sending}
                />
              </View>
              <View style={styles.addFriendButtons}>
                <TouchableOpacity
                  style={[styles.button, styles.secondaryButton]}
                  onPress={() => {
                    setShowAddFriend(false);
                    setFriendEmail('');
                  }}
                  disabled={sending}
                >
                  <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.primaryButton,
                    sending && styles.buttonDisabled,
                  ]}
                  onPress={handleSendRequest}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText style={styles.primaryButtonText}>
                      Send Request
                    </ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.addFriendPrompt}>
              <TouchableOpacity
                style={styles.addFriendButton}
                onPress={() => setShowAddFriend(true)}
              >
                <ThemedText style={styles.addFriendButtonText}>
                  + Add Friend
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Content */}
      {activeTab === 'friends' ? (
        <FlatList
          data={friends}
          renderItem={renderFriend}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>
                No friends yet. Send a friend request to get started!
              </ThemedText>
            </View>
          }
        />
      ) : (
        <View style={styles.requestsContainer}>
          {receivedRequests.length > 0 && (
            <View style={styles.requestSection}>
              <ThemedText style={styles.sectionTitle}>
                Received ({receivedRequests.length})
              </ThemedText>
              <FlatList
                data={receivedRequests}
                renderItem={renderReceivedRequest}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.sectionList}
              />
            </View>
          )}
          {sentRequests.length > 0 && (
            <View style={styles.requestSection}>
              <ThemedText style={styles.sectionTitle}>
                Sent ({sentRequests.length})
              </ThemedText>
              <FlatList
                data={sentRequests}
                renderItem={renderSentRequest}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.sectionList}
              />
            </View>
          )}
          {receivedRequests.length === 0 && sentRequests.length === 0 && (
            <View style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>
                No pending requests
              </ThemedText>
            </View>
          )}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    opacity: 0.6,
  },
  activeTabText: {
    opacity: 1,
    fontWeight: '600',
    color: '#007AFF',
  },
  addFriendPrompt: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  addFriendButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  addFriendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  addFriendContainer: {
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  addFriendLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  addFriendInput: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  addFriendButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f5f5f5',
  },
  secondaryButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    padding: 16,
    flexGrow: 1,
  },
  requestsContainer: {
    flex: 1,
  },
  requestSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  sectionList: {
    gap: 12,
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
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginBottom: 12,
  },
  itemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  itemDetails: {
    flex: 1,
  },
  itemEmail: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemDate: {
    fontSize: 12,
    opacity: 0.6,
  },
  requestButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rejectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  removeButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
