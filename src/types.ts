export type FontFamily = 'sans' | 'serif' | 'mono';
export type TextAlign = 'left' | 'center' | 'right';

export interface Slot {
  id: string;
  name: string;
  content: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface ViewerSettings {
  textColor: string;
  backgroundColor: string;
  backgroundMode: 'solid' | 'gradient';
  gradientStart: string;
  gradientEnd: string;
  gradientAngle: number;
  fontSize: number | string;
  fontFamily: FontFamily;
  textAlign: TextAlign;
  isBold: boolean;
  paddingX: number;
  letterSpacing: number;
  lineHeight: number;
}

export interface UIState {
  selectedSlotId: string | null;
}
