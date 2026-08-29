import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { BodyStats, EquippedItems } from '../types';
import { useApp } from '../context/AppContext';

type Props = {
  label?: string;
  height?: number;
  showBodyShape?: boolean;
};

export function AvatarPlaceholder({
  label = '아바타 이미지',
  height = 320,
  showBodyShape = true,
}: Props) {
  const { bodyStats, equipped, allClothes } = useApp();
  const top = allClothes.find((c) => c.id === equipped.topId);
  const bottom = allClothes.find((c) => c.id === equipped.bottomId);

  const shoulder = showBodyShape ? 70 + bodyStats.shoulder * 0.35 : 88;
  const waist = showBodyShape ? 52 + bodyStats.waist * 0.22 : 64;
  const hip = showBodyShape ? 60 + bodyStats.lower * 0.3 : 76;

  return (
    <View style={[styles.box, { height }]}>
      <View style={styles.figure}>
        <View style={styles.head} />
        <View style={styles.hair} />
        <View
          style={[
            styles.torso,
            {
              width: shoulder,
              borderBottomWidth: 0,
            },
          ]}
        >
          <View
            style={[
              styles.torsoFill,
              {
                width: shoulder,
                backgroundColor: top?.color ?? '#B7C0CF',
              },
            ]}
          />
          <View
            style={[
              styles.waistBand,
              {
                width: waist,
                backgroundColor: top?.color ?? '#A9B3C4',
              },
            ]}
          />
        </View>
        <View style={styles.legs}>
          <View
            style={[
              styles.leg,
              {
                backgroundColor: bottom?.color ?? '#A7B1C2',
                width: 18 + bodyStats.lower * 0.08,
              },
            ]}
          />
          <View
            style={[
              styles.leg,
              {
                backgroundColor: bottom?.color ?? '#A7B1C2',
                width: 18 + bodyStats.lower * 0.08,
              },
            ]}
          />
        </View>
        <View
          style={[
            styles.hips,
            {
              width: hip,
              backgroundColor: bottom?.color ?? '#9AA5B8',
            },
          ]}
        />
      </View>
      <Text style={styles.label}>{label}</Text>
      <BodyHint body={bodyStats} equipped={equipped} />
    </View>
  );
}

function BodyHint({
  body,
  equipped,
}: {
  body: BodyStats;
  equipped: EquippedItems;
}) {
  return (
    <Text style={styles.hint}>
      S{Math.round(body.shoulder)} · W{Math.round(body.waist)} · L
      {Math.round(body.lower)}
      {equipped.topId || equipped.bottomId ? ' · fitted' : ''}
    </Text>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    maxWidth: 280,
    alignSelf: 'center',
    borderRadius: 8,
    backgroundColor: colors.placeholder,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  figure: {
    alignItems: 'center',
    gap: 0,
    marginTop: 8,
  },
  head: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#D7B39A',
    zIndex: 2,
  },
  hair: {
    position: 'absolute',
    top: -2,
    width: 46,
    height: 20,
    borderRadius: 12,
    backgroundColor: '#3B2F2F',
    zIndex: 3,
  },
  torso: {
    alignItems: 'center',
    marginTop: 4,
  },
  torsoFill: {
    height: 78,
    borderRadius: 12,
  },
  waistBand: {
    height: 28,
    marginTop: -8,
    borderRadius: 8,
  },
  hips: {
    height: 18,
    borderRadius: 8,
    marginTop: -70,
    zIndex: 1,
  },
  legs: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    zIndex: 0,
  },
  leg: {
    height: 78,
    borderRadius: 8,
  },
  label: {
    fontSize: 13,
    color: colors.inkMuted,
    letterSpacing: 0.3,
  },
  hint: {
    fontSize: 11,
    color: colors.inkMuted,
    marginBottom: 8,
  },
});
