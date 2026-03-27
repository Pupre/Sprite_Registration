export interface LinearTrend {
  slope: number;
  intercept: number;
  predicted: number[];
}

export function fitLinearTrend(values: number[]): LinearTrend {
  if (values.length === 0) {
    return { slope: 0, intercept: 0, predicted: [] };
  }

  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    numerator += (index - meanX) * (values[index] - meanY);
    denominator += (index - meanX) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;

  return {
    slope,
    intercept,
    predicted: values.map((_, index) => intercept + slope * index)
  };
}

export function residualMse(values: number[], predicted: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    total += (values[index] - predicted[index]) ** 2;
  }

  return total / values.length;
}
