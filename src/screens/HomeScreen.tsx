import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { AvatarPlaceholder } from '../components/AvatarPlaceholder';

export function HomeScreen() {
  const { profile, equipped, allClothes } = useApp();
  const progress = Math.min(profile.exp / profile.expToNext, 1);
  const equippedTop = allClothes.find((c) => c.id === equipped.topId);
  const equippedBottom = allClothes.find((c) => c.id === equipped.bottomId);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.brand}>LOOKFIT</Text>
        <Text style={styles.nickname}>{profile.nickname}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.level}>Lv. {profile.level}</Text>
          <Text style={styles.expText}>
            EXP {profile.exp}/{profile.expToNext}
          </Text>
        </View>
        <View style={styles.expTrack}>
          <View style={[styles.expFill, { flex: progress }]} />
          <View style={{ flex: 1 - progress }} />
        </View>
      </View>

      <View style={styles.avatarArea}>
        <AvatarPlaceholder label="2D 아바타 Placeholder" />
        <View style={styles.equippedRow}>
          <Text style={styles.equippedLabel}>
            상의: {equippedTop?.name ?? '미착용'}
          </Text>
          <Text style={styles.equippedLabel}>
            하의: {equippedBottom?.name ?? '미착용'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  header: {
    gap: 6,
    marginBottom: 20,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.ink,
  },
  nickname: {
    fontSize: 16,
    color: colors.inkMuted,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  level: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  expText: {
    fontSize: 13,
    color: colors.inkMuted,
  },
  expTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.expTrack,
    overflow: 'hidden',
    flexDirection: 'row',
    marginTop: 4,
  },
  expFill: {
    backgroundColor: colors.expFill,
    borderRadius: 999,
  },
  avatarArea: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 24,
  },
  equippedRow: {
    gap: 4,
    alignItems: 'center',
  },
  equippedLabel: {
    fontSize: 13,
    color: colors.inkMuted,
  },
});
