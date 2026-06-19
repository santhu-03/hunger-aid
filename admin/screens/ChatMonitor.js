import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { collection, getFirestore, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { useAdminTheme } from '../theme';

function useAllChats() {
  const [chats,   setChats]   = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const db = getFirestore();
    const unsub = onSnapshot(
      query(collection(db, 'chats'), orderBy('lastMessageAt', 'desc'), limit(50)),
      snap => { setChats(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);
  return { chats, loading };
}

function useRecentMessages(chatId) {
  const [msgs,    setMsgs]    = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!chatId) { setMsgs([]); return; }
    setLoading(true);
    const db = getFirestore();
    const unsub = onSnapshot(
      query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(20)),
      snap => { setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse()); setLoading(false); },
      () => setLoading(false)
    );
    return () => unsub();
  }, [chatId]);
  return { msgs, loading };
}

const ROLE_COLOR = { Donor: '#3b82f6', Volunteer: '#16a34a', Beneficiary: '#f59e0b', Admin: '#8b5cf6' };

function ChatRow({ chat, onSelect, isSelected, theme }) {
  const lastTime = chat.lastMessageAt?.toDate?.()?.toLocaleDateString() || '';
  const totalUnread = Object.values(chat.unread || {}).reduce((a, b) => a + b, 0);
  const participants = [chat.donorName, chat.volunteerName, chat.beneficiaryName].filter(Boolean);

  return (
    <TouchableOpacity
      onPress={() => onSelect(chat)}
      activeOpacity={0.8}
      style={{
        backgroundColor: isSelected ? theme.primary + '12' : theme.surface, borderRadius: 12, padding: 14,
        marginBottom: 7, elevation: isSelected ? 2 : 1, flexDirection: 'row', alignItems: 'center', gap: 12,
        borderWidth: isSelected ? 1 : 0, borderColor: theme.primary,
      }}
    >
      {/* Icon */}
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: theme.blue + '18', alignItems: 'center', justifyContent: 'center' }}>
        <FontAwesome5 name="comments" size={16} color={theme.blue} />
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }} numberOfLines={1}>
          {chat.foodItem || 'Food Delivery Chat'}
        </Text>
        <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }} numberOfLines={1}>
          {participants.join(' · ') || '—'}
        </Text>
        {chat.lastMessage ? (
          <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }} numberOfLines={1}>{chat.lastMessage}</Text>
        ) : null}
      </View>

      {/* Meta */}
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ fontSize: 10, color: theme.textMuted }}>{lastTime}</Text>
        {totalUnread > 0 && (
          <View style={{ backgroundColor: theme.red, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{totalUnread > 9 ? '9+' : totalUnread}</Text>
          </View>
        )}
        <Text style={{ fontSize: 9, color: theme.textMuted }}>{chat.participantIds?.length || 0} users</Text>
      </View>
    </TouchableOpacity>
  );
}

function MessageBubble({ msg, theme }) {
  const color = ROLE_COLOR[msg.senderRole] || theme.textMuted;
  const time  = msg.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '';
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color + '30', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color }}>{(msg.senderName || 'U')[0].toUpperCase()}</Text>
        </View>
        <Text style={{ fontSize: 11, fontWeight: '700', color }}>{msg.senderName || '—'}</Text>
        <View style={{ backgroundColor: color + '15', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
          <Text style={{ fontSize: 9, color, fontWeight: '600' }}>{msg.senderRole || '—'}</Text>
        </View>
        <Text style={{ fontSize: 9, color: theme.textMuted, marginLeft: 'auto' }}>{time}</Text>
      </View>
      <View style={{ backgroundColor: theme.inputBg, borderRadius: 10, padding: 10, marginLeft: 28 }}>
        <Text style={{ fontSize: 12, color: theme.text, lineHeight: 17 }}>{msg.text}</Text>
      </View>
    </View>
  );
}

export default function ChatMonitor({ search }) {
  const { theme }           = useAdminTheme();
  const { chats, loading }  = useAllChats();
  const [selected, setSelected] = useState(null);
  const { msgs, loading: msgsLoading } = useRecentMessages(selected?.id);

  const filtered = chats.filter(c => {
    if (!search?.trim()) return true;
    const q = search.trim().toLowerCase();
    return (c.foodItem || '').toLowerCase().includes(q) ||
      (c.donorName || '').toLowerCase().includes(q) ||
      (c.volunteerName || '').toLowerCase().includes(q) ||
      (c.beneficiaryName || '').toLowerCase().includes(q);
  });

  const totalUnread = chats.reduce((sum, c) => sum + Object.values(c.unread || {}).reduce((a,b)=>a+b,0), 0);
  const activeChats = chats.filter(c => !!c.lastMessage).length;

  return (
    <View>
      {/* Summary */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Chats',   value: chats.length,  color: theme.blue,    icon: 'comments'      },
          { label: 'Active Chats',  value: activeChats,   color: theme.primary, icon: 'comment-dots'  },
          { label: 'Unread Msgs',   value: totalUnread,   color: theme.red,     icon: 'envelope'      },
        ].map(s => (
          <View key={s.label} style={{ flex: 1, backgroundColor: s.color + '15', borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 }}>
            <FontAwesome5 name={s.icon} size={16} color={s.color} />
            <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text }}>{s.value}</Text>
            <Text style={{ fontSize: 10, color: theme.textSec }}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        {/* Chat list */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 10 }}>
            All Conversations ({filtered.length})
          </Text>
          {loading ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <FontAwesome5 name="comment-slash" size={32} color={theme.border} />
              <Text style={{ color: theme.textMuted, marginTop: 10 }}>No conversations.</Text>
            </View>
          ) : (
            filtered.map(c => (
              <ChatRow
                key={c.id}
                chat={c}
                onSelect={setSelected}
                isSelected={selected?.id === c.id}
                theme={theme}
              />
            ))
          )}
        </View>

        {/* Message view */}
        {selected && (
          <View style={{ flex: 1.2, backgroundColor: theme.surface, borderRadius: 16, padding: 16, maxHeight: 600 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                  {selected.foodItem || 'Delivery Chat'}
                </Text>
                <Text style={{ fontSize: 11, color: theme.textMuted }} numberOfLines={1}>
                  {[selected.donorName, selected.volunteerName, selected.beneficiaryName].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)} style={{ padding: 6 }}>
                <FontAwesome5 name="times" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {msgsLoading ? (
              <ActivityIndicator color={theme.primary} />
            ) : msgs.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <FontAwesome5 name="comment-dots" size={28} color={theme.border} />
                <Text style={{ color: theme.textMuted, marginTop: 8, fontSize: 12 }}>No messages yet.</Text>
              </View>
            ) : (
              msgs.map(m => <MessageBubble key={m.id} msg={m} theme={theme} />)
            )}

            {/* Participant list */}
            <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12, marginTop: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textMuted, marginBottom: 6 }}>PARTICIPANTS</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(selected.participantNames || {}).map(([uid, name]) => {
                  const role = uid === selected.donorId ? 'Donor' : uid === selected.volunteerId ? 'Volunteer' : 'Beneficiary';
                  const c = ROLE_COLOR[role] || theme.textMuted;
                  return (
                    <View key={uid} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c + '15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, gap: 5 }}>
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c }} />
                      <Text style={{ fontSize: 10, color: c, fontWeight: '600' }}>{name}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
