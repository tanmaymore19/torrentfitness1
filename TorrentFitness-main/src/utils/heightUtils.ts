/**
 * Height Conversion & Formatting Utilities (Feet & Inches)
 */

export interface FeetInches {
  feet: number;
  inches: number;
  totalInches: number;
  formatted: string; // e.g. "5 ft 8 in"
  notation: string;  // e.g. "5.8"
}

/**
 * Parses any incoming height value (legacy cm, decimal feet.inches, or total inches)
 * into a structured Feet & Inches object.
 */
export function parseHeight(val: any): FeetInches {
  if (!val && val !== 0) {
    return { feet: 5, inches: 8, totalInches: 68, formatted: '5 ft 8 in', notation: '5.8' };
  }

  const num = Number(val);
  if (isNaN(num) || num <= 0) {
    return { feet: 5, inches: 8, totalInches: 68, formatted: '5 ft 8 in', notation: '5.8' };
  }

  // 1. Legacy cm (> 100 cm, e.g. 175)
  if (num > 100) {
    const totalInches = Math.round(num / 2.54);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return {
      feet: Math.min(7, Math.max(4, feet)),
      inches: Math.min(11, Math.max(0, inches)),
      totalInches,
      formatted: `${feet} ft ${inches} in`,
      notation: `${feet}.${inches}`
    };
  }

  // 2. Decimal Feet.Inches notation (e.g. 5.4, 5.8, 5.11, 6.0)
  if (num >= 3.5 && num <= 7.95) {
    const feet = Math.floor(num);
    const decimal = Math.round((num - feet) * 100);
    let inches = 0;
    if (decimal >= 10 && decimal <= 11) {
      inches = decimal;
    } else if (decimal % 10 === 0) {
      inches = decimal / 10;
    } else {
      inches = Math.round((num - feet) * 10);
    }
    const safeInches = Math.min(11, Math.max(0, inches));
    const totalInches = (feet * 12) + safeInches;
    return {
      feet: Math.min(7, Math.max(4, feet)),
      inches: safeInches,
      totalInches,
      formatted: `${feet} ft ${safeInches} in`,
      notation: `${feet}.${safeInches}`
    };
  }

  // 3. Total inches (40 to 95 inches, e.g. 68)
  if (num >= 40 && num <= 95) {
    const feet = Math.floor(num / 12);
    const inches = num % 12;
    return {
      feet: Math.min(7, Math.max(4, feet)),
      inches,
      totalInches: num,
      formatted: `${feet} ft ${inches} in`,
      notation: `${feet}.${inches}`
    };
  }

  return { feet: 5, inches: 8, totalInches: 68, formatted: '5 ft 8 in', notation: '5.8' };
}

/**
 * Calculates BMI accurately using weight in kg and height in feet & inches.
 * Formula: weight (kg) / ((total_inches * 0.0254) ^ 2)
 */
export function calculateBmi(weightKg: number, feet: number, inches: number): number {
  const totalInches = (feet * 12) + inches;
  if (totalInches <= 0 || weightKg <= 0) return 22.0;
  const heightM = totalInches * 0.0254;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

/**
 * Formats height into clean Feet & Inches display string.
 */
export function formatHeight(val: any): string {
  if (!val && val !== 0) return '--';
  const { formatted } = parseHeight(val);
  return formatted;
}
