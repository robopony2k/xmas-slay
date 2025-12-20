export const SNOW_DEFAULT_MAX_DEPTH = 36;
export const HOUSE_SNOW_BINS = 20;
export const TREE_SNOW_BINS = 12;
export const GROUND_SNOW_BINS = 220;
export const SNOW_BUDGET_MAX = 32000;

export const snowContext = {
  accumulation: 0,
  groundDepth: 0,
  groundBins: Array.from({ length: GROUND_SNOW_BINS }, () => 0),
  budget: SNOW_BUDGET_MAX,
  budgetMax: SNOW_BUDGET_MAX,
  puffQueue: [] as { x: number; y: number; strength: number }[],
  windSheen: 0,
  windDir: 0,
};
