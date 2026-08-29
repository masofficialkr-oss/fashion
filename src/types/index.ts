export type ClothingCategory = 'top' | 'bottom';

export type ClothingItem = {
  id: string;
  name: string;
  category: ClothingCategory;
  thumbnail: string | null;
  layer: string | null;
  color?: string;
  match: {
    shoulderMin: number;
    shoulderMax: number;
    waistMin: number;
    waistMax: number;
    lowerMin: number;
    lowerMax: number;
  };
};

export type BodyStats = {
  shoulder: number;
  waist: number;
  lower: number;
};

export type EquippedItems = {
  topId: string | null;
  bottomId: string | null;
};

export type UserProfile = {
  nickname: string;
  level: number;
  exp: number;
  expToNext: number;
};

export type EquipResult = {
  equipped: boolean;
  gainedExp: number;
  leveledUp: boolean;
  level: number;
  reason?: 'already_equipped';
};
