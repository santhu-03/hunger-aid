export const FOOD_CATEGORIES = [
  { label: 'Seafood', value: 'seafood' },
  { label: 'Meat / Chicken', value: 'meat' },
  { label: 'Dairy', value: 'dairy' },
  { label: 'Rice / Biryani', value: 'rice' },
  { label: 'Curry / Dal', value: 'curry' },
  { label: 'Vegetables', value: 'vegetables' },
  { label: 'Fried Snacks', value: 'snacks' },
  { label: 'Bakery', value: 'bakery' },
  { label: 'Fruits', value: 'fruits' },
  { label: 'Salad', value: 'salad' },
  { label: 'Beverages', value: 'beverages' },
  { label: 'Mixed Meal', value: 'mixed' },
  { label: 'Fallback', value: 'fallback' },
];

export const CATEGORY_LIMITS = {
  seafood: { room: 2, fridge: 15, risk: 5 },
  meat: { room: 2, fridge: 24, risk: 5 },
  dairy: { room: 2, fridge: 20, risk: 4 },
  rice: { room: 4, fridge: 24, risk: 5 },
  curry: { room: 6, fridge: 24, risk: 3 },
  vegetables: { room: 8, fridge: 24, risk: 3 },
  snacks: { room: 7, fridge: 24, risk: 2 },
  bakery: { room: 18, fridge: 40, risk: 1 },
  fruits: { room: 36, fridge: 96, risk: 1 },
  salad: { room: 2, fridge: 12, risk: 5 },
  beverages: { room: 2, fridge: 18, risk: 4 },
  mixed: { room: 6, fridge: 24, risk: 4 },
  fallback: { room: 8, fridge: 24, risk: 3 },
};

export const SMELL_OPTIONS = [
  { label: 'Normal', value: 'normal' },
  { label: 'Slight', value: 'slight' },
  { label: 'Bad', value: 'bad' },
];

export const APPEARANCE_OPTIONS = [
  { label: 'Normal', value: 'normal' },
  { label: 'Slight change', value: 'slight' },
  { label: 'Looks spoiled', value: 'spoiled' },
];

export const evaluateFood = ({
  category,
  hours,
  refrigerated,
  smell,
  appearance,
  reheated,
}) => {
  let score = 0;
  const limits = CATEGORY_LIMITS[category] || CATEGORY_LIMITS.fallback;

  if (smell === 'bad') score += 60;
  else if (smell === 'slight') score += 25;

  if (appearance === 'spoiled') score += 50;
  else if (appearance === 'slight') score += 20;

  const limit = refrigerated ? limits.fridge : limits.room;

  if (hours > limit) score += 50;
  else if (hours > limit * 0.7) score += 25;

  if (reheated) score += 15;

  score += limits.risk * 5;

  if (score >= 80) return 'Spoiled';
  if (score >= 45) return 'Average';
  return 'Fresh';
};

export const getReason = (status, category) => {
  const categoryLabel =
    FOOD_CATEGORIES.find((item) => item.value === category)?.label || 'food';

  if (status === 'Spoiled') {
    return `This ${categoryLabel} food has exceeded safe limits and may be unsafe to consume.`;
  }

  if (status === 'Average') {
    return 'This food is nearing spoilage. Consume soon or reheat properly.';
  }

  return 'This food appears safe based on storage conditions and time.';
};