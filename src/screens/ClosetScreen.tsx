import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useApp } from '../context/AppContext';
import { colors } from '../theme/colors';
import type { ClothingItem } from '../types';
import type { RootTabParamList } from '../navigation/types';

export function ClosetScreen() {
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const {
    recommended,
    equipItem,
    equipped,
    selectedId,
    setSelectedId,
  } = useApp();
  const [feedback, setFeedback] = useState('');

  const selected = recommended.find((i) => i.id === selectedId) ?? null;

  const isEquipped = (item: ClothingItem) =>
    (item.category === 'top' && equipped.topId === item.id) ||
    (item.category === 'bottom' && equipped.bottomId === item.id);

  const alreadySelectedEquipped = selected ? isEquipped(selected) : false;

  const onWear = () => {
    if (!selected) return;
    const result = equipItem(selected);
    if (result.reason === 'already_equipped') {
      setFeedback('이미 착용 중인 아이템입니다');
      return;
    }
    setFeedback(`+${result.gainedExp} EXP · ${selected.name} 착용`);
    if (result.leveledUp) {
      Alert.alert('LEVEL UP', `Lv. ${result.level} 달성!`);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>옷장 · 추천 결과</Text>
      <Text style={styles.subtitle}>
        추천 아이템을 선택하고 착용하면 홈 아바타와 EXP가 반영됩니다.
      </Text>

      {recommended.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>아직 추천 결과가 없어요</Text>
          <Text style={styles.emptyBody}>
            체형 분석 탭에서 슬라이더를 조절한 뒤{'\n'}
            ‘분석 완료 및 옷 추천받기’를 눌러주세요.
          </Text>
        </View>
      ) : (
        <FlatList
          data={recommended}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const active = selectedId === item.id;
            const worn = isEquipped(item);
            return (
              <Pressable
                style={[styles.card, active && styles.cardActive]}
                onPress={() => setSelectedId(item.id)}
              >
                <View
                  style={[
                    styles.thumb,
                    item.color ? { backgroundColor: item.color } : null,
                  ]}
                >
                  <Text style={styles.thumbText}>
                    {item.category === 'top' ? 'TOP' : 'BTM'}
                  </Text>
                </View>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemMeta}>
                  {worn ? '착용 중' : item.id}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

      <Pressable
        style={[
          styles.cta,
          (!selected || alreadySelectedEquipped) && styles.ctaDisabled,
        ]}
        onPress={onWear}
        disabled={!selected || alreadySelectedEquipped}
      >
        <Text style={styles.ctaText}>
          {!selected
            ? '아이템을 선택하세요'
            : alreadySelectedEquipped
              ? `"${selected.name}" 이미 착용 중`
              : `"${selected.name}" 착용하기`}
        </Text>
      </Pressable>

      {(equipped.topId || equipped.bottomId) && (
        <Pressable
          style={styles.secondary}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.secondaryText}>메인에서 피팅 확인</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 16,
    fontSize: 14,
    color: colors.inkMuted,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    paddingBottom: 12,
    gap: 12,
  },
  row: {
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  cardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  thumb: {
    height: 96,
    borderRadius: 8,
    backgroundColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.inkMuted,
  },
  feedback: {
    textAlign: 'center',
    color: colors.accent,
    fontWeight: '700',
    marginBottom: 8,
    fontSize: 13,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondary: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  secondaryText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
});
