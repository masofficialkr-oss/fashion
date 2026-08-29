import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors } from '../theme/colors';

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  leftHint?: string;
  rightHint?: string;
};

export function BodySlider({
  label,
  value,
  onChange,
  leftHint = '좁음',
  rightHint = '넓음',
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{Math.round(value)}</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.accent}
      />
      <View style={styles.hints}>
        <Text style={styles.hint}>{leftHint}</Text>
        <Text style={styles.hint}>{rightHint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  slider: {
    width: '100%',
    height: 36,
  },
  hints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hint: {
    fontSize: 12,
    color: colors.inkMuted,
  },
});
