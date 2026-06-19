import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getTotalUnread, listenToUserChats } from '../services/chatService';
import ChatScreen from './ChatScreen';

export default function ChatListScreen({ currentUserId, currentUserName, currentUserRole, onBack }) {
  const [chats, setChats]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selectedChatId, setSelectedChatId] = useState(null);

  useEffect(() => {
    if (!currentUserId) return;
    const unsub = listenToUserChats(currentUserId, (list) => {
      setChats(list);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUserId]);

  if (selectedChatId) {
    return (
      <ChatScreen
        donationId={selectedChatId}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        currentUserRole={currentUserRole}
        onBack={() => setSelectedChatId(null)}
      />
    );
  }

  const renderChat = ({ item }) => {
    const unread     = item.unread?.[currentUserId] || 0;
    const lastTime   = item.lastMessageAt?.toDate
      ? item.lastMessageAt.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' })
      : '';
    const otherNames = [item.donorName, item.volunteerName, item.beneficiaryName]
      .filter((n) => n && n !== currentUserName)
      .join(', ') || 'Delivery Chat';

    return (
      <TouchableOpacity style={styles.chatItem} onPress={() => setSelectedChatId(item.id)}>
        <View style={styles.chatAvatar}>
          <FontAwesome5 name="comments" size={22} color="#2e7d32" />
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatInfoRow}>
            <Text style={styles.chatTitle} numberOfLines={1}>
              {item.foodItem || 'Food Delivery'}
            </Text>
            <Text style={styles.chatTime}>{lastTime}</Text>
          </View>
          <View style={styles.chatInfoRow}>
            <Text style={styles.chatSub} numberOfLines={1}>
              {otherNames}
            </Text>
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </View>
          {item.lastMessage ? (
            <Text style={styles.lastMsg} numberOfLines={1}>
              {item.lastMessage}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        {getTotalUnread(chats, currentUserId) > 0 && (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{getTotalUnread(chats, currentUserId)}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2e7d32" />
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FontAwesome5 name="comment-slash" size={56} color="#c8e6c9" />
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySub}>
            Chats appear automatically when you have an active donation or delivery
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          renderItem={renderChat}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f9fafb' },
  centered:        { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:          {
    backgroundColor: '#2e7d32',
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 14,
    paddingBottom: 14, paddingHorizontal: 16,
    elevation: 4,
  },
  backBtn:         { marginRight: 12 },
  headerTitle:     { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  headerBadge:     {
    backgroundColor: '#e53935', borderRadius: 12,
    minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  headerBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  list:            { padding: 12 },
  separator:       { height: 1, backgroundColor: '#e8f5e9', marginHorizontal: 12 },

  chatItem:        {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    padding: 14, marginBottom: 8,
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07,
  },
  chatAvatar:      {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#e8f5e9', justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  chatInfo:        { flex: 1 },
  chatInfoRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatTitle:       { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 8 },
  chatTime:        { fontSize: 11, color: '#aaa' },
  chatSub:         { fontSize: 12, color: '#666', flex: 1 },
  lastMsg:         { fontSize: 12, color: '#999', marginTop: 3 },
  badge:           {
    backgroundColor: '#2e7d32', borderRadius: 10,
    minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  badgeText:       { color: '#fff', fontSize: 11, fontWeight: '700' },

  emptyContainer:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle:      { fontSize: 18, fontWeight: '700', color: '#4caf50', marginTop: 16 },
  emptySub:        { fontSize: 13, color: '#888', textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
