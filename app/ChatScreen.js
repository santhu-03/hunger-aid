import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getOrCreateChatRoom,
  listenToMessages,
  markChatAsRead,
  sendMessage,
} from '../services/chatService';

export default function ChatScreen({
  donationId,
  currentUserId,
  currentUserName,
  currentUserRole,
  onBack,
}) {
  const [messages, setMessages]   = useState([]);
  const [inputText, setInputText] = useState('');
  const [chatRoom, setChatRoom]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(false);
  const flatListRef               = useRef(null);

  useEffect(() => {
    if (!donationId) return;
    getOrCreateChatRoom(donationId)
      .then((room) => { setChatRoom(room); setLoading(false); })
      .catch((err) => { console.error('[Chat] init:', err.message); setLoading(false); });
  }, [donationId]);

  useEffect(() => {
    if (!donationId) return;
    const unsub = listenToMessages(donationId, (msgs) => {
      setMessages(msgs);
      markChatAsRead(donationId, currentUserId).catch(() => {});
    });
    return () => unsub();
  }, [donationId, currentUserId]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    setSending(true);
    const text = inputText.trim();
    setInputText('');
    try {
      await sendMessage(donationId, currentUserId, currentUserName, currentUserRole, text);
    } catch (e) {
      console.error('[Chat] send failed:', e.message);
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isOwn = item.senderId === currentUserId;
    const time  = item.createdAt?.toDate
      ? item.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <View style={[styles.msgRow, isOwn && styles.msgRowOwn]}>
        {!isOwn && (
          <View style={[styles.avatar, roleColor(item.senderRole)]}>
            <Text style={styles.avatarText}>
              {(item.senderName || 'U')[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          {!isOwn && (
            <Text style={styles.senderLabel}>
              {item.senderName}
              <Text style={styles.senderRole}> · {item.senderRole}</Text>
            </Text>
          )}
          <Text style={[styles.msgText, isOwn && styles.msgTextOwn]}>{item.text}</Text>
          <Text style={[styles.msgTime, isOwn && styles.msgTimeOwn]}>{time}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2e7d32" />
        <Text style={styles.loadingText}>Opening chat…</Text>
      </View>
    );
  }

  const participants = chatRoom
    ? [chatRoom.donorName, chatRoom.volunteerName, chatRoom.beneficiaryName].filter(Boolean)
    : [];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <FontAwesome5 name="arrow-left" size={18} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {chatRoom?.foodItem ? `Chat: ${chatRoom.foodItem}` : 'Delivery Chat'}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {participants.join(', ')}
          </Text>
        </View>
        <View style={styles.headerIcon}>
          <FontAwesome5 name="comments" size={20} color="rgba(255,255,255,0.7)" />
        </View>
      </View>

      {/* ── Message List ── */}
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FontAwesome5 name="comment-dots" size={56} color="#c8e6c9" />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySub}>
            Start the conversation about this delivery
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Input Bar ── */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message…"
          placeholderTextColor="#aaa"
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            (!inputText.trim() || sending) && styles.sendBtnDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <FontAwesome5 name="paper-plane" size={16} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function roleColor(role) {
  switch (role) {
    case 'Donor':       return { backgroundColor: '#1976d2' };
    case 'Volunteer':   return { backgroundColor: '#388e3c' };
    case 'Beneficiary': return { backgroundColor: '#f57c00' };
    default:            return { backgroundColor: '#607d8b' };
  }
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f1f8e9' },
  centered:        { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f8e9' },
  loadingText:     { marginTop: 12, color: '#2e7d32', fontWeight: '600' },

  // Header
  header:          {
    backgroundColor: '#2e7d32',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 14,
    paddingBottom: 14,
    paddingHorizontal: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
  },
  backBtn:         { marginRight: 12 },
  headerInfo:      { flex: 1 },
  headerTitle:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSub:       { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  headerIcon:      { marginLeft: 8 },

  // Empty state
  emptyContainer:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle:      { fontSize: 18, fontWeight: '700', color: '#4caf50', marginTop: 16 },
  emptySub:        { fontSize: 13, color: '#888', textAlign: 'center', marginTop: 8, lineHeight: 18 },

  // Messages
  messagesList:    { padding: 16, paddingBottom: 8 },
  msgRow:          { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  msgRowOwn:       { flexDirection: 'row-reverse' },
  avatar:          {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 8, marginBottom: 4,
  },
  avatarText:      { color: '#fff', fontWeight: '700', fontSize: 13 },
  bubble:          {
    maxWidth: '72%', borderRadius: 18, padding: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, elevation: 1,
  },
  bubbleOwn:       { backgroundColor: '#2e7d32', borderBottomRightRadius: 4 },
  bubbleOther:     { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  senderLabel:     { fontSize: 11, fontWeight: '700', color: '#555', marginBottom: 3 },
  senderRole:      { fontWeight: '400', color: '#888' },
  msgText:         { fontSize: 15, color: '#333', lineHeight: 20 },
  msgTextOwn:      { color: '#fff' },
  msgTime:         { fontSize: 10, color: '#aaa', marginTop: 4, textAlign: 'right' },
  msgTimeOwn:      { color: 'rgba(255,255,255,0.65)' },

  // Input
  inputRow:        {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#e0e0e0',
  },
  input:           {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 24,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    maxHeight: 120, color: '#333', marginRight: 8,
  },
  sendBtn:         {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#2e7d32', justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#a5d6a7' },
});
