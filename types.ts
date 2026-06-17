
export interface GeneratedImage {
  id: string;
  url?: string;
  prompt: string;
  timestamp: number;
  status: 'loading' | 'success' | 'error';
  error?: string;
  groundingMetadata?: any;
  resolution?: string;
  aspectRatio?: string;
  styleCode?: number;
}

export interface SourceImage {
  id: string;
  url: string;
  file: File;
}

export interface AppState {
  sourceImages: SourceImage[];
  generatedImages: GeneratedImage[];
  prompt: string;
  aspectRatio: string; // 'Original', '1:1', '2:3', '3:2', '3:4', '4:3', '5:4', '4:5', '9:16', '16:9', '21:9'
  resolution: string; // '1k', '2k', '4k'
  error: string | null; // For global/upload errors
  useGrounding: boolean;
  styleCode: string; // Stored as string to allow empty input state
  randomizeEachTime: boolean;
}

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic' | 'image/heif';

export type GarmentMode = 'primary' | 'secondary';

export interface GarmentAnalysis {
  baseGarment: string;
  garmentSubtype: string;
  classification: GarmentMode;
  colors: string[];
  patterns: string[];
  materials: string[];
  fitDescriptors: string[];
  silhouette: string[];
  constructionDetails: string[];
  distinctiveDetails: string[];
  visibilityNotes: string[];
  confidence: number;
}

export type PromptLabShotKind = 'offBody' | 'onBody';
