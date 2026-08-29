import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import clothesData from '../data/clothes.json';
import type {
  BodyStats,
  ClothingItem,
  EquipResult,
  EquippedItems,
  UserProfile,
} from '../types';

type PersistedState = {
  profile: UserProfile;
  bodyStats: BodyStats;
  recommendedIds: string[];
  equipped: EquippedItems;
  selectedId: string | null;
};

type AppContextValue = {
  profile: UserProfile;
  bodyStats: BodyStats;
  setBodyStats: React.Dispatch<React.SetStateAction<BodyStats>>;
  recommended: ClothingItem[];
  selectedId: string | null;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  equipped: EquippedItems;
  equipItem: (item: ClothingItem) => EquipResult;
  analyzeAndRecommend: () => ClothingItem[];
  allClothes: ClothingItem[];
  ready: boolean;
};

const STORAGE_KEY = 'lookfit-app-v1';
const EXP_PER_WEAR = 25;
const EXP_TO_NEXT = 100;

const AppContext = createContext<AppContextValue | null>(null);

const defaultProfile: UserProfile = {
  nickname: '스타일러',
  level: 1,
  exp: 0,
  expToNext: EXP_TO_NEXT,
};

const defaultBody: BodyStats = {
  shoulder: 50,
  waist: 50,
  lower: 50,
};

function matchesBody(item: ClothingItem, body: BodyStats) {
  return (
    body.shoulder >= item.match.shoulderMin &&
    body.shoulder <= item.match.shoulderMax &&
    body.waist >= item.match.waistMin &&
    body.waist <= item.match.waistMax &&
    body.lower >= item.match.lowerMin &&
    body.lower <= item.match.lowerMax
  );
}

function closestBy(
  items: ClothingItem[],
  score: (item: ClothingItem) => number,
) {
  return items.reduce((best, cur) => (score(cur) < score(best) ? cur : best));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [bodyStats, setBodyStats] = useState<BodyStats>(defaultBody);
  const [recommendedIds, setRecommendedIds] = useState<string[]>([]);
  const [equipped, setEquipped] = useState<EquippedItems>({
    topId: null,
    bottomId: null,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allClothes = useMemo(
    () => [...clothesData.tops, ...clothesData.bottoms] as ClothingItem[],
    [],
  );

  const recommended = useMemo(
    () =>
      recommendedIds
        .map((id) => allClothes.find((c) => c.id === id))
        .filter((c): c is ClothingItem => Boolean(c)),
    [recommendedIds, allClothes],
  );

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedState;
          if (parsed.profile) setProfile({ ...defaultProfile, ...parsed.profile, expToNext: EXP_TO_NEXT });
          if (parsed.bodyStats) setBodyStats({ ...defaultBody, ...parsed.bodyStats });
          if (parsed.recommendedIds) setRecommendedIds(parsed.recommendedIds);
          if (parsed.equipped) setEquipped(parsed.equipped);
          if (parsed.selectedId !== undefined) setSelectedId(parsed.selectedId);
        }
      } catch {
        // ignore corrupt storage
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const payload: PersistedState = {
      profile,
      bodyStats,
      recommendedIds,
      equipped,
      selectedId,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
  }, [ready, profile, bodyStats, recommendedIds, equipped, selectedId]);

  const analyzeAndRecommend = () => {
    const topsData = clothesData.tops as ClothingItem[];
    const bottomsData = clothesData.bottoms as ClothingItem[];

    let tops = topsData.filter((item) => matchesBody(item, bodyStats));
    let bottoms = bottomsData.filter((item) => matchesBody(item, bodyStats));

    if (!tops.length) {
      tops = [
        closestBy(topsData, (item) =>
          Math.abs(
            item.match.shoulderMin +
              item.match.shoulderMax -
              bodyStats.shoulder * 2,
          ),
        ),
      ];
    }
    if (!bottoms.length) {
      bottoms = [
        closestBy(bottomsData, (item) =>
          Math.abs(
            item.match.lowerMin + item.match.lowerMax - bodyStats.lower * 2,
          ),
        ),
      ];
    }

    const next = [...tops, ...bottoms];
    setRecommendedIds(next.map((i) => i.id));
    setSelectedId(null);
    return next;
  };

  const equipItem = (item: ClothingItem): EquipResult => {
    const already =
      (item.category === 'top' && equipped.topId === item.id) ||
      (item.category === 'bottom' && equipped.bottomId === item.id);

    if (already) {
      return {
        equipped: false,
        gainedExp: 0,
        leveledUp: false,
        level: profile.level,
        reason: 'already_equipped',
      };
    }

    setEquipped((prev) => ({
      ...prev,
      ...(item.category === 'top' ? { topId: item.id } : { bottomId: item.id }),
    }));

    let nextExp = profile.exp + EXP_PER_WEAR;
    let nextLevel = profile.level;
    let leveledUp = false;

    while (nextExp >= profile.expToNext) {
      nextExp -= profile.expToNext;
      nextLevel += 1;
      leveledUp = true;
    }

    setProfile((prev) => ({
      ...prev,
      level: nextLevel,
      exp: nextExp,
    }));

    return {
      equipped: true,
      gainedExp: EXP_PER_WEAR,
      leveledUp,
      level: nextLevel,
    };
  };

  const value: AppContextValue = {
    profile,
    bodyStats,
    setBodyStats,
    recommended,
    selectedId,
    setSelectedId,
    equipped,
    equipItem,
    analyzeAndRecommend,
    allClothes,
    ready,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
}
