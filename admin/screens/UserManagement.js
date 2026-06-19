import { FontAwesome5 } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { deleteUser, listenAllUsers, updateUserRole, updateUserStatus } from '../../services/userService';
import { resetStuckVolunteer } from '../../services/volunteerAssignmentService';
import { useAdminTheme, roleBadge, statusColor } from '../theme';

const ROLES = ['All', 'Donor', 'Volunteer', 'Beneficiary', 'Admin'];

function useAllUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = listenAllUsers(list => { setUsers(list); setLoading(false); });
    return () => unsub();
  }, []);
  return { users, loading };
}

// ── User detail modal ─────────────────────────────────────────────────────────
function UserDetailModal({ user, visible, onClose, onBlock, onRoleChange, onDelete, onReset, pendingId }) {
  const { theme } = useAdminTheme();
  if (!user) return null;
  const rb = roleBadge(user.role);
  const isPending = pendingId === (user.uid || user.id);
  const isBlocked = user.status === 'blocked';

  const roleOptions = ['Donor', 'Volunteer', 'Beneficiary', 'Admin'];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: theme.surface, borderRadius: 20, width: '100%', maxWidth: 460, padding: 24, elevation: 10 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 14 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: theme.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: theme.primaryMid }}>{(user.name || 'U')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{user.name || '—'}</Text>
              <Text style={{ fontSize: 12, color: theme.textMuted }}>{user.email || '—'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <FontAwesome5 name="times" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Info rows */}
          {[
            { label: 'Role',       value: user.role     || '—' },
            { label: 'Status',     value: user.status   || '—' },
            { label: 'Phone',      value: user.phone    || '—' },
            { label: 'Joined',     value: user.createdAt?.toDate?.()?.toLocaleDateString() || '—' },
            { label: 'Location',   value: user.location ? `${user.location.latitude?.toFixed(4)}, ${user.location.longitude?.toFixed(4)}` : '—' },
          ].map(row => (
            <View key={row.label} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.borderLight }}>
              <Text style={{ width: 90, fontSize: 12, color: theme.textMuted, fontWeight: '600' }}>{row.label}</Text>
              <Text style={{ flex: 1, fontSize: 12, color: theme.text }}>{row.value}</Text>
            </View>
          ))}

          {/* Role change */}
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSec, marginBottom: 8 }}>CHANGE ROLE</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {roleOptions.map(r => (
                <TouchableOpacity
                  key={r}
                  onPress={() => onRoleChange(user, r)}
                  disabled={isPending}
                  style={{
                    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
                    backgroundColor: user.role === r ? theme.primary : theme.inputBg,
                    borderWidth: 1, borderColor: user.role === r ? theme.primary : theme.border,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: user.role === r ? '#fff' : theme.textSec }}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <ActionBtn
              label={isBlocked ? 'Unblock' : 'Block'}
              color={isBlocked ? theme.primary : theme.amber}
              icon={isBlocked ? 'unlock' : 'ban'}
              onPress={() => onBlock(user)}
              disabled={isPending}
              flex
            />
            {user.role === 'Volunteer' && (
              <ActionBtn label="Reset" color={theme.blue} icon="sync" onPress={() => onReset(user)} disabled={isPending} flex />
            )}
            <ActionBtn label="Delete" color={theme.red} icon="trash" onPress={() => onDelete(user)} disabled={isPending} flex />
          </View>
          {isPending && <ActivityIndicator style={{ marginTop: 12 }} color={theme.primary} />}
        </View>
      </View>
    </Modal>
  );
}

function ActionBtn({ label, color, icon, onPress, disabled, flex }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: color + '15', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
        borderWidth: 1, borderColor: color + '40', gap: 6, flex: flex ? 1 : undefined,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <FontAwesome5 name={icon} size={13} color={color} />
      <Text style={{ fontSize: 12, fontWeight: '700', color }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── User row card ─────────────────────────────────────────────────────────────
function UserRow({ user, onPress, theme }) {
  const rb = roleBadge(user.role);
  const sc = statusColor(user.status, theme);
  const isStuck = (user.role || '').toLowerCase() === 'volunteer' && (user.availability === 'busy' || !!user.assignedDonationId);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: theme.surface, borderRadius: 12, padding: 14,
        marginBottom: 8, elevation: 1,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04,
        borderLeftWidth: isStuck ? 3 : 0, borderLeftColor: theme.amber,
      }}
    >
      {/* Avatar */}
      <View style={{
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: theme.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 12,
      }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.primaryMid }}>{(user.name || 'U')[0].toUpperCase()}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }} numberOfLines={1}>{user.name || '(no name)'}</Text>
        <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }} numberOfLines={1}>{user.email || '—'}</Text>
      </View>

      {/* Role badge */}
      <View style={{ backgroundColor: rb.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 10 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: rb.text }}>{user.role || '—'}</Text>
      </View>

      {/* Status dot */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sc }} />
        <Text style={{ fontSize: 10, color: sc, fontWeight: '600', textTransform: 'capitalize' }}>{user.status || '—'}</Text>
      </View>

      <FontAwesome5 name="chevron-right" size={12} color={theme.textMuted} style={{ marginLeft: 10 }} />
    </TouchableOpacity>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function UserManagement({ search }) {
  const { theme } = useAdminTheme();
  const { users, loading } = useAllUsers();
  const [activeRole,  setActiveRole]  = useState('All');
  const [selectedUser, setSelectedUser] = useState(null);
  const [pendingId,   setPendingId]   = useState(null);

  const filtered = useMemo(() => {
    let list = users;
    if (activeRole !== 'All') {
      list = list.filter(u => (u.role || '').toLowerCase() === activeRole.toLowerCase());
    }
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
    }
    return list;
  }, [users, activeRole, search]);

  const counts = useMemo(() => {
    const c = { All: users.length };
    ROLES.slice(1).forEach(r => { c[r] = users.filter(u => (u.role||'').toLowerCase() === r.toLowerCase()).length; });
    return c;
  }, [users]);

  const withPending = async (fn) => {
    try { await fn(); } catch (e) { Alert.alert('Error', e.message); } finally { setPendingId(null); }
  };

  const handleBlock = async (u) => {
    const id = u.uid || u.id;
    const next = u.status === 'blocked' ? 'active' : 'blocked';
    Alert.alert(next === 'blocked' ? 'Block User' : 'Unblock User', `${next === 'blocked' ? 'Block' : 'Unblock'} ${u.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: next === 'blocked' ? 'destructive' : 'default', onPress: async () => {
        setPendingId(id);
        await withPending(() => updateUserStatus(id, next));
        setSelectedUser(prev => prev ? { ...prev, status: next } : null);
      }},
    ]);
  };

  const handleRoleChange = async (u, role) => {
    const id = u.uid || u.id;
    if (u.role === role) return;
    Alert.alert('Change Role', `Change ${u.name}'s role to ${role}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change', onPress: async () => {
        setPendingId(id);
        await withPending(() => updateUserRole(id, role));
        setSelectedUser(prev => prev ? { ...prev, role } : null);
      }},
    ]);
  };

  const handleDelete = async (u) => {
    const id = u.uid || u.id;
    Alert.alert('Delete User', `Permanently delete ${u.name}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setPendingId(id);
        setSelectedUser(null);
        await withPending(() => deleteUser(id));
      }},
    ]);
  };

  const handleReset = async (u) => {
    const id = u.uid || u.id;
    Alert.alert('Reset Volunteer', `Clear stuck availability for ${u.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', onPress: async () => {
        setPendingId(id);
        await withPending(() => resetStuckVolunteer(id));
      }},
    ]);
  };

  return (
    <View>
      {/* Summary cards */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Users',    value: counts.All,          color: theme.blue,    icon: 'users'            },
          { label: 'Donors',         value: counts.Donor,        color: theme.cyan,    icon: 'hand-holding-heart'},
          { label: 'Volunteers',     value: counts.Volunteer,    color: theme.primary, icon: 'user-friends'     },
          { label: 'Beneficiaries',  value: counts.Beneficiary,  color: theme.amber,   icon: 'people-carry'     },
          { label: 'Admins',         value: counts.Admin,        color: theme.purple,  icon: 'user-shield'      },
        ].map(s => (
          <View key={s.label} style={{ flex: 1, backgroundColor: s.color + '15', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 }}>
            <FontAwesome5 name={s.icon} size={16} color={s.color} />
            <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>{s.value}</Text>
            <Text style={{ fontSize: 10, color: theme.textSec, textAlign: 'center' }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Role tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: theme.surface, borderRadius: 12, padding: 4, marginBottom: 14, gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.border }}>
        {ROLES.map(r => (
          <TouchableOpacity
            key={r}
            onPress={() => setActiveRole(r)}
            style={{
              paddingVertical: 7, paddingHorizontal: 14, borderRadius: 9,
              backgroundColor: activeRole === r ? theme.primary : 'transparent',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: activeRole === r ? '#fff' : theme.textMuted }}>
              {r} {counts[r] !== undefined ? `(${counts[r]})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={{ alignItems: 'center', padding: 40 }}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ color: theme.textMuted, marginTop: 12 }}>Loading users…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState theme={theme} message={`No ${activeRole === 'All' ? '' : activeRole + ' '}users found.`} />
      ) : (
        <View>
          <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>{filtered.length} user{filtered.length !== 1 ? 's' : ''}</Text>
          {filtered.map(u => (
            <UserRow key={u.uid || u.id} user={u} theme={theme} onPress={() => setSelectedUser(u)} />
          ))}
        </View>
      )}

      {/* Detail modal */}
      <UserDetailModal
        user={selectedUser}
        visible={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        onBlock={handleBlock}
        onRoleChange={handleRoleChange}
        onDelete={handleDelete}
        onReset={handleReset}
        pendingId={pendingId}
      />
    </View>
  );
}

function EmptyState({ theme, message }) {
  return (
    <View style={{ alignItems: 'center', padding: 48 }}>
      <FontAwesome5 name="user-slash" size={36} color={theme.border} />
      <Text style={{ color: theme.textMuted, fontSize: 14, marginTop: 12, fontWeight: '600' }}>{message}</Text>
    </View>
  );
}
