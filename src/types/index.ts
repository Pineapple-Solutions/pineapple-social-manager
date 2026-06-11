// src/types/index.ts
// Tipi centrali per Pineapple Social Manager

export type PostType = 'POST' | 'STORY' | 'REEL' | 'CAROUSEL';
export type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';
export type MediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
export type ContentSource = 'AI' | 'MANUAL' | 'SITE';
export type AITone = 'professional' | 'friendly' | 'funny' | 'inspirational' | 'luxury' | 'minimal' | 'auto';
export type CampaignGoal = 'AWARENESS' | 'ENGAGEMENT' | 'TRAFFIC' | 'CONVERSIONS';
export type Platform = 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK';

// --- Instagram ---
export interface InstagramPost {
  id: string;
  caption?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  timestamp: string;
  mediaType: MediaType;
  likeCount?: number;
  commentsCount?: number;
  reach?: number;
  impressions?: number;
}

export interface InstagramProfile {
  id: string;
  username: string;
  name: string;
  biography?: string;
  website?: string;
  profilePictureUrl?: string;
  followersCount: number;
  followingCount: number;
  mediaCount: number;
}

export interface InstagramMetricsData {
  date: string;
  followersCount: number;
  impressions: number;
  reach: number;
  profileViews: number;
  websiteClicks: number;
  engagementRate: number;
  avgLikes: number;
  avgComments: number;
}

// --- Facebook ---
export interface FacebookProfile {
  id: string;
  name: string;
  profilePictureUrl?: string;
  followersCount: number;
  likesCount: number;
}

export interface FacebookMetricsData {
  date: string;
  followersCount: number;
  impressions: number;
  reach: number;
  pageViews: number;
  reactions: number;
  shares: number;
  engagementRate: number;
}

// --- TikTok ---
export interface TikTokProfile {
  openId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  followersCount: number;
  followingCount: number;
  likesCount: number;
  videoCount: number;
}

export interface TikTokMetricsData {
  date: string;
  followersCount: number;
  videoViews: number;
  likes: number;
  comments: number;
  shares: number;
  profileViews: number;
  engagementRate: number;
}

// --- Scheduled Post ---
export interface ScheduledPostData {
  id: string;
  platform: Platform;
  type: PostType;
  status: PostStatus;
  caption?: string;
  hashtags?: string[];
  mediaUrls: string[];
  mediaType: MediaType;
  scheduledAt?: Date | string;
  publishedAt?: Date | string;
  instagramPostId?: string;
  facebookPostId?: string;
  tiktokPostId?: string;
  aiGenerated: boolean;
  siteName?: string;
  campaignName?: string;
  error?: string;
  likesCount?: number;
  commentsCount?: number;
  reachCount?: number;
  createdAt: Date | string;
}

// --- AI Generation ---
export interface AIMediaRef {
  url: string;
  alt?: string | null;
  description?: string | null;
  type?: string; // 'IMAGE' | 'VIDEO'
}

export interface AIGenerationRequest {
  type: 'caption' | 'hashtags' | 'ideas' | 'story_text' | 'reel_script' | 'full_post';
  topic?: string;
  siteUrl?: string;
  siteContext?: string;
  tone?: AITone;
  language?: string;
  keywords?: string[];
  existingCaption?: string;
  imageDescription?: string;
  targetAudience?: string;
  callToAction?: string;
  postType?: PostType;
  platform?: Platform;
  /** Media dalla Libreria selezionati dall'utente come riferimento per l'AI */
  mediaRefs?: AIMediaRef[];
  /** Risposta dell'utente a una domanda di chiarimento dell'AI */
  additionalContext?: string;
  /**
   * Durata totale del Reel in secondi (impostata dall'utente nello slider).
   * Usata per dire all'AI quante scene generare e di che durata, in modo che
   * la somma corrisponda esattamente alla durata del video.
   */
  reelDuration?: number;
  /**
   * Override del modello AI per questa singola esecuzione.
   * Se impostato, viene usato al posto del modello configurato per il tenant.
   * Non modifica le impostazioni globali del provider.
   */
  overrideModel?: string;
}

export interface AIClarificationOption {
  label: string;
  description: string;
}

/** Struttura di debug sulla costruzione del prompt, salvata nel campo `result` del GenerationJob */
export interface PromptInfo {
  /** Regole caricate dal DB (tabella globalPromptRule) */
  globalRules: string[];
  /** Input di configurazione usati per la generazione */
  config: Record<string, string | number | boolean | null | undefined>;
  /** [DEBUG] Frammenti del prompt iniettati dal codice (non da DB né da config utente) */
  codeRules?: string[];
  /** [DEBUG] System prompt completo inviato all'AI (solo generazione testo) */
  systemPrompt?: string;
  /** [DEBUG] User prompt completo inviato all'AI (solo generazione testo) */
  userPrompt?: string;
  /** [DEBUG] Prompt immagine finale assemblato (solo job IMAGE/VIDEO) */
  finalImagePrompt?: string;
}

export interface AIGenerationResult {
  caption?: string;
  hashtags?: string[];
  ideas?: ContentIdeaData[];
  storyText?: string;
  reelScript?: string;
  suggestedTimes?: string[];
  altText?: string;
  tokens: number;
  model: string;
  /** L'AI ha bisogno di un chiarimento prima di generare */
  needsClarification?: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: AIClarificationOption[];
  /** Informazioni di debug sulla costruzione del prompt */
  promptInfo?: PromptInfo;
}

// --- Reel Storyboard ---
/** Una singola scena dello storyboard di un Reel. Puramente informativa (guida di produzione). */
export interface ReelScene {
  scene: number;
  /** Durata suggerita dall'AI (es. "5s", "8s"). Non vincola la suddivisione delle clip Veo. */
  duration: string;
  visual: string;
  script: string;
  onScreenText?: string;
  transition?: string;
  /**
   * Durata massima manuale della scena in secondi (campo opzionale, solo metadato).
   * Non influenza la generazione delle clip Veo (che usa sempre calculateClipDurations sulla
   * durata totale del video impostata dall'utente).
   */
  maxDurationSeconds?: number;
}

export interface ReelStoryboard {
  hook?: string;
  totalDuration?: string;
  scenes?: ReelScene[];
  music?: string;
  cta?: string;
}

// --- Content Ideas ---
export interface ContentIdeaData {
  id: string;
  title: string;
  description?: string;
  type: PostType;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'USED';
  caption?: string;
  hashtags?: string[];
  imagePrompt?: string;
  /** Prompt video / storyboard testuale per idee di tipo REEL (generato dall'AI) */
  videoPrompt?: string;
  category?: string;
  priority: number;
  createdAt: Date | string;
}

// --- Scheduler ---
export interface SchedulerRuleData {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  contentType: PostType | 'MIXED';
  frequency: 'DAILY' | 'WEEKLY' | 'CUSTOM';
  postsPerDay: number;
  storiesPerDay: number;
  reelsPerWeek: number;
  preferredTimes: string[];
  timezone: string;
  activeDays: number[];
  contentSource: ContentSource;
  siteUrl?: string;
  aiTone: AITone;
  aiLanguage: string;
  aiTopics: string[];
}

// --- Peak Hours ---
export interface PeakHour {
  hour: number;
  dayOfWeek: number;
  score: number;
  label: string;
  reason: string;
}

export interface PeakHourSuggestion {
  time: string;
  score: number;
  label: string;
  dayLabel: string;
  reason: string;
}

// --- Connected Sites ---
export interface ConnectedSiteData {
  id: string;
  name: string;
  url: string;
  description?: string;
  logoUrl?: string;
  niche?: string;
  language: string;
  isActive: boolean;
  createdAt: Date | string;
}

// --- Config ---
export interface AppConfig {
  instagramAccessToken?: string;
  instagramBusinessAccountId?: string;
  instagramAppId?: string;
  instagramAppSecret?: string;
  facebookPageAccessToken?: string;
  facebookPageId?: string;
  tiktokAccessToken?: string;
  tiktokRefreshToken?: string;
  tiktokOpenId?: string;
  tiktokClientKey?: string;
  tiktokClientSecret?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  appPassword?: string;
  timezone?: string;
  defaultLanguage?: string;
  defaultTone?: AITone;
  autoPublish?: boolean;
  notificationsEnabled?: boolean;
}

// --- Dashboard Stats ---
export interface DashboardStats {
  totalScheduled: number;
  publishedToday: number;
  pendingApproval: number;
  failedPosts: number;
  totalFollowers: number;
  followersGrowth: number;
  avgEngagementRate: number;
  topPerformingType: PostType;
  postsThisWeek: number;
  storiesThisWeek: number;
}

// --- Campaign ---
export interface CampaignData {
  id: string;
  name: string;
  description?: string;
  goal?: CampaignGoal;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'DRAFT';
  startDate?: Date | string;
  endDate?: Date | string;
  siteName?: string;
  postsCount: number;
  createdAt: Date | string;
}

// --- API Responses ---
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
