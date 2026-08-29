import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { BodySlider } from '../components/BodySlider';
import { AvatarPlaceholder } from '../components/AvatarPlaceholder';
import { useApp } from '../context/AppContext';
import { colors } from '../theme/colors';
import type { RootTabParamList } from '../navigation/types';

export function BodyAnalysisScreen() {
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const { bodyStats, setBodyStats, analyzeAndRecommend } = useApp();

  const onAnalyze = () => {
    analyzeAndRecommend();
    navigation.navigate('Closet');
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>체형 분석</Text>
      <Text style={styles.subtitle}>
        슬라이더로 어깨·허리·하체 비율을 조절하세요.
      </Text>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AvatarPlaceholder label="체형 프리뷰 Placeholder" height={220} />

        <View style={styles.sliderPanel}>
          <BodySlider
            label="어깨 넓이"
            value={bodyStats.shoulder}
            onChange={(shoulder) =>
              setBodyStats((prev) => ({ ...prev, shoulder }))
            }
            leftHint="좁음"
            rightHint="넓음"
          />
          <BodySlider
            label="허리 굵기"
            value={bodyStats.waist}
            onChange={(waist) => setBodyStats((prev) => ({ ...prev, waist }))}
            leftHint="가늘음"
            rightHint="굵음"
          />
          <BodySlider
            label="하체 비율"
            value={bodyStats.lower}
            onChange={(lower) => setBodyStats((prev) => ({ ...prev, lower }))}
            leftHint="슬림"
            rightHint="볼륨"
          />
        </View>
      </ScrollView>

      <Pressable style={styles.cta} onPress={onAnalyze}>
        <Text style={styles.ctaText}>분석 완료 및 옷 추천받기</Text>
      </Pressable>
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
  content: {
    gap: 20,
    paddingBottom: 16,
  },
  sliderPanel: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
