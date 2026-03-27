
import firebase from 'firebase/compat/app';
import React from 'react';

export type LeadMarket = 'UK' | 'Spain' | 'France' | 'Germany';
export type CountryCode = 'UK' | 'ES' | 'FR' | 'DE';

export type ViewName = 'dashboard' | 'new-quote' | 'lead-intel' | 'market-trends' | 'data-miner' | 'price-comparison' | 'contacts' | 'ai-tools' | 'products' | 'admin' | 'campaigns' | 'intelligent-sales-hub' | 'sales-intel-center' | 'lead-dossier' | 'supervisor' | 'visualizer' | 'roofing-estimator';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  status: 'pending' | 'approved' | 'rejected';
  allowedViews: ViewName[];
  isBypassUser?: boolean;
}

export interface Note {
  id: string;
  text: string;
  author: string;
  createdAt: firebase.firestore.Timestamp;
  date: string; // derived
}

export interface ModalState {
  type: 'alert' | 'confirm' | 'prompt' | 'custom' | 'confirm-save' | 'KeyAccount' | 'SupervisorFeedback';
  title: string;
  message?: string;
  placeholder?: string;
  content?: React.ReactNode;
  onResolve?: (value: any) => void;
  companyName?: string;
}

export interface StatusJob {
  id: string;
  name: string;
  status: 'running' | 'complete' | 'error' | 'queued';
  progress: number;
  description: string;
  color?: string;
  abortController?: AbortController;
  context?: {
    leadId?: string;
    leadIds?: string[];
    currentLeadId?: string;
    jobId?: string;
    customerId?: string;
  };
}

// --- NEW: Backend Worker Job Schema ---
export interface PlanExtractionResult {
  summary: string;
  materials: Material[];
  images?: { url: string; label: string }[];
}

export interface PlanExtractionJob {
  id: string;
  leadId: string;
  userId: string;
  planningUrl: string;
  council: string;
  status: 'queued' | 'pending' | 'processing' | 'complete' | 'error';
  createdAt: firebase.firestore.Timestamp;
  updatedAt: firebase.firestore.Timestamp;
  result?: PlanExtractionResult;
  error?: string;
}

export interface FoundProfessional {
  name: string;
  companyName?: string;
  authority?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  website?: string;
  status: 'Verified' | 'Unverified' | 'Contradictory' | 'Invalid Format' | 'Inactive';
  market: LeadMarket;
  sourceUrl?: string;
  activityStatus?: 'Active' | 'Dissolved' | 'In Liquidation' | 'Unknown';
  companySize?: 'High' | 'Medium' | 'Low' | 'Unknown';
  companySizeReasoning?: string;
  financeReportUrl?: string;
}

export interface Customer {
  id: string;
  userId: string;
  company: string;
  contactName: string;
  type: string; // e.g. Architect, Roofer
  email: string;
  phone: string;
  mobile?: string; // Added mobile field
  address: string; // Allow object to handle legacy data gracefully
  website: string;
  status: 'Active' | 'Inactive' | 'Unverified' | 'Verified' | 'Contradictory' | 'Invalid Format';
  market: LeadMarket;
  sourceUrl?: string;
  activityStatus?: 'Active' | 'Dissolved' | 'In Liquidation' | 'Unknown';
  companySize?: 'High' | 'Medium' | 'Low' | 'Unknown';
  companySizeReasoning?: string;
  financeReportUrl?: string;
  sourceOrigin?: 'Data Miner' | 'Manual' | 'Lead Enrichment';
  isDeleted?: boolean;
}

export interface LeadContactVerification {
    confidenceScore: number;
    checks: {
        emailFormat: { valid: boolean; details: string };
        phoneFormat: { valid: boolean; details: string };
        dbMatch: { valid: boolean; details: string };
        websiteMatch: { valid: boolean; details: string };
        linkedinMatch: { valid: boolean; details: string };
    };
    recommendation: 'SAFE TO CALL' | 'LIKELY VALID' | 'INVALID';
    lastVerified: string; // ISO timestamp
}

export interface LeadContact {
  userId: string;
  market: LeadMarket;
  status: 'Verified' | 'Unverified' | 'Contradictory' | 'Invalid Format' | 'Inactive' | 'Active';
  contactName: string;
  company: string;
  type: string;
  email: string;
  phone: string;
  mobile?: string;
  address: string;
  website: string;
  source: string;
  linkedinUrl: string;
  contactFormUrl: string;
  isUpdating: boolean;
  qualityScore?: number;
  priority?: 'main' | 'secondary';
  companyProfile?: string;
  verification?: LeadContactVerification;
  personaTier?: 'Tier 1' | 'Tier 2' | 'Tier 3'; // V54 Buyer Persona Logic
  // Financial Data
  financialStatus?: 'Active' | 'Liquidation' | 'Dissolved' | 'Insolvent' | 'Dormant' | 'Unknown';
  financialRisk?: 'Low' | 'Medium' | 'High' | 'Unknown';
  financialLink?: string; // Official registry link
  financialLastChecked?: string;
}

export interface Material {
  name: string;
  quantity?: string | number;
  source?: string;
  type: 'Verbatim' | 'Inferred';
  confidence?: number;
  reasoning?: string;
  proof?: string;
}

export type SalesStage = 'New Leads' | 'Contacted' | 'Quoting' | 'Won' | 'Lost';

export interface OpportunityBasket {
    primary: string;
    highAttach: string[];
    thirdOrder: string;
}

export interface ClosedLoopFeedback {
    status: 'Won' | 'Lost';
    wonDetails?: {
        quotedSlateValue: number;
        quotedTotalBasketValue: number;
        appointedContractor: string;
    };
    lostDetails?: {
        reason: 'Price' | 'Availability' | 'Relationship' | 'Other';
        competitor: string;
        otherReason?: string;
    };
}

export interface PlanningDocument {
  type: string;
  filename: string;
  url: string;
  storageUrl?: string; // Secure URL for cached/uploaded plans
  size?: string;
  pages?: number;
  description?: string;
  pageNumber?: number;
  notes?: string;
  isLatest?: boolean;
}

export interface PartnerPrepReport {
  verification: {
    is_active_company: boolean;
    company_reg_number: string | null;
    confidence_score: number; // 0-100
  };
  enhanced_contact: {
    role: string;
    name: string;
    linkedin_or_source_url: string;
  };
  partner_strategy: {
    nearest_branch: string;
    trade_angle: string;
  };
}

export interface StrategicEmailDraft {
    angle: string;
    subject: string;
    body: string;
}

export interface SmartScanData {
    status: 'verified' | 'pending' | 'failed';
    assets: PlanningDocument[];
    dataVerification: {
        projectDescription: { value: string; source: string };
        siteAddress: { value: string; source: string };
        revisionStatus: { value: string; source: string };
        applicantName?: { value: string; source: string };
    };
    timestamp: string;
}

export interface Lead {
  id: string;
  userId: string;
  market: LeadMarket;
  title: string;
  address: string;
  summary: string;
  projectType: string;
  projectStage: 'Planning' | 'Approved' | 'Pre-Construction' | 'On-Site' | 'Complete' | 'Unknown' | 'Withdrawn' | 'Rejected' | 'Awaiting Decision' | 'Granted Conditionally' | 'Pre-Planning' | 'Overdue / Stalled';
  slateFitScore: 'High' | 'Medium' | 'Low';
  slateFitReason: string;
  sources: { uri: string, title: string }[];
  companies: Partial<LeadContact>[];
  companyNames: string[];
  notes: string;
  isFavorite: boolean;
  isDismissed: boolean;
  contactsFetched: boolean;
  strategyGenerated: boolean;
  applicationRef: string | null;
  council: string | null;
  planningUrl: string | null;
  specDocumentUrl: string | null;
  dateFound: string; // YYYY-MM-DD
  materials: Material[];
  isParsingIncomplete: boolean;
  isFindingContacts?: boolean;
  isGeneratingStrategy?: boolean;
  sourceText?: string;
  isPinned?: boolean;
  salesStrategy?: string;
  actionPlan?: string;
  isGeneratingActionPlan?: boolean;
  streetViewImageUrl?: string;
  materialFlag?: 'SLATE_SPECIFIED' | 'COMPETITOR_SPECIFIED' | 'MATERIAL_UNSPECIFIED' | 'SPECIFICATION_CONFLICT';
  statusMismatch?: boolean;
  isBuildingRegsOnly?: boolean;
  // Phase 1: Foundational Fixes
  formattedAddress?: string;
  geolocation?: { lat: number, lng: number };
  lastVerified?: string;
  keyDates?: { label: string; date: string }[];
  projectValue?: string;
  planningDocuments?: PlanningDocument[];
  // Phase 3: Intelligence Layer
  trustScore?: number;
  totalScore?: number;
  grade?: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D';
  lastUpdateChanges?: (keyof Lead)[];
  originalSearchType?: LeadSearchCategory;
  siteHistory?: {
    ref: string;
    date: string;
    description: string;
    url?: string;
  }[];
  // Improvement 2: Tracker
  lastCheckedForUpdate?: string; // ISO string
  isFullyEnriched?: boolean;
  // Improvement 3: Visual Vetting
  visualAnalysis?: {
    roofState?: string;
    buildingType?: string;
    roofEstimate?: string;
  };
  feedback?: 'good' | 'bad_contact' | 'won' | 'wrong_status';
  // ISH 2.0 Fields
  salesStage?: SalesStage;
  opportunityBasket?: OpportunityBasket;
  closedLoopFeedback?: ClosedLoopFeedback;
  // V53 Protocol
  jewsonOverlap?: boolean;
  companyStatus?: string;
  // V55 Enriched Fields
  startDate?: string;
  applicationDate?: string;
  decisionDate?: string;
  role?: string;
  contractor?: string;
  // V61 Smart Scan
  smartScan?: SmartScanData;
  // V63 Cloud Extraction
  ai_analysis?: PlanExtractionResult;
  multimodalEmbedding?: number[];
  embedding?: number[];
}

export interface ForensicResult {
    leadId: string;
    projectName: string;
    reportedStatus: string;
    forensicReality: string; // "The Truth"
    criticalAnomaly: string | null; // e.g., "Fire Incident", "Appeal Allowed", "Infra-Only"
    strategicAction: 'Monitor' | 'Pitch' | 'Discard';
    newProjectStage?: Lead['projectStage']; // Suggested update
    reasoning: string;
}

export type LeadSearchCategory = 'major_developments' | 'new_builds' | 'refurbishments' | 'extensions' | 'heritage' | 'general_search' | 'custom_group' | 'pre_planning' | 'active_construction';

export interface DisqualifiedLead {
    projectName: string;
    reason: string;
    sourceUrl?: string;
}

export interface SearchJob {
  id: string;
  userId: string;
  location: string;
  searchType?: LeadSearchCategory;
  leads: Lead[];
  status: 'running' | 'complete' | 'error';
  error: string | null;
  findMoreCount: number;
  market: LeadMarket;
  strategy?: string;
  disqualifiedLeads?: DisqualifiedLead[];
  searchParams?: StructuredSearchParams;
  radius?: number;
  keywords?: string[];
}

export interface MarketTrendReport {
  report: string;
  strategicLeadIds: string[];
}

export interface TenderAnalysisResult {
    summary: {
        deadlines: string[];
        requiredDocuments: string[];
        criticalCriteria: string[];
    };
    redFlags: string[];
    draftedResponses: {
        question: string;
        answer: string;

        source: string;
    }[];
    overallAssessment: string;
}

export interface SurveyAnalysisResult {
    summary: string;
    totalMaterials: { item: string; quantity: number; unit: string; notes: string; }[];
    sections: { id: string; description: string; materials: any[] }[];
    methodology: string[];
    missingInfo: string[];
    roofArea: string;
    roofPitch: string;
    projectAddress?: string; // Added from usage
}

export interface AutomatedQualityReport {
    confidence_score: number;
    requires_human_review: boolean;
    scale_validation_status: 'PASSED' | 'WARNING' | 'FAILED' | 'N/A';
    scale_validation_summary: string;
    constraint_checks_status: 'PASSED' | 'WARNING' | 'FAILED';
    constraint_checks_summary: string;
    consistency_check_status: 'PASSED' | 'WARNING' | 'FAILED';
    consistency_check_summary: string;
    final_sanity_check_status: 'PASSED' | 'WARNING' | 'FAILED';
    final_sanity_check_summary: string;
}

export interface StructuralDetails {
  foundations?: string;
  walls?: string;
  floors?: string;
  steelwork?: string;
}

export interface WindowDoor {
  id?: string;
  type: string;
  dimensions: string;
  u_value?: string;
  quantity: number;
  location: string;
}

export interface Finishes {
  external?: string;
  internal?: string;
}

export interface MechanicalElectrical {
  heating?: string;
  ventilation?: string;
  plumbing?: string;
  electrical?: string;
  drainage?: string;
}

export interface Compliance {
  building_regs?: string[];
  fire_safety?: string;
  accessibility?: string;
  notes?: string;
}

export interface RoofSection {
  id: string;
  label: string;
  type: "main_slope" | "flat_roof" | "dormer" | "extension" | "porch" | "valley" | "hip" | "garage" | "outbuilding" | "canopy" | "balcony" | "bay_window" | "parapet" | "terrace" | "chimney" | "skylight" | "velux" | "cladding" | "solar_panel";
  // Forensic Status: Determines if we calculate or ignore
  status: "Proposed" | "Existing" | "Demolish" | "Unknown";
  page_index: number; 
  bbox_2d: [number, number, number, number]; 
  polygon_2d?: number[]; // [y, x, y, x...] for precise drawing
  compass_direction?: string;
  vertices?: {x: number, y: number, node_type: string}[];
  confidence: number;
  visual_notes: string;
  inference_status?: "verified" | "estimated" | "merged" | "pass_consensus" | "manual_add" | "ai_recovery";
  
  section_id?: string;
  pitch_degrees?: number;
  area_m2?: number;
  ridge_length_m?: number;
  eave_length_m?: number;
  rafter_length_m?: number;
  
  // V2 Forensic Enhancements
  source_method?: 'Text Schedule Match' | 'Visual Estimation' | 'Geometry Inference' | 'Default Value' | 'Manual Input';
  data_flags?: string[]; // e.g. ["Pitch Inferred from Elevation", "Area from Text"]
}

export interface PlanReaderResult {
  quality_report: AutomatedQualityReport;
  project_details?: {
    address?: string;
    architect?: string;
    plan_scale?: string;
  };
  // Captured text context from Phase 1 (Scribe)
  plan_notes?: { category: string, text: string }[];
  roofing: {
    roof_sections: RoofSection[];
    slate_specification: {
      size: string;
      gauge_mm: number;
      head_lap_mm: number;
      source?: 'Extracted' | 'Default (Regs)' | 'Manual' | 'Default (Standard)'; 
    };
    quantities: {
      full_slates: number;
      slate_and_half: number;
      ridge_tiles: number;
      hip_tiles: number;
      battens_linear_m: number;
      batten_size: string;
      nails_65mm_galv: number;
      underlay_m2: number;
      flat_membrane_m2?: number; // NEW: Separate field for flat roof aggregation
      valley_liner_m: number;
      parapet_capping_m?: number; // NEW: Separate field for parapet linear length
    };
    flat_roof_system?: string;
  };
  structural: StructuralDetails;
  windows_doors: WindowDoor[];
  finishes: Finishes;
  mechanical_electrical: MechanicalElectrical;
  compliance: Compliance;
  visual_summary_svg?: string;
  visual_summary_image?: string;
}


export interface InternalContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string; // e.g. "Jewson", "MKM"
  country?: string;
  address?: string; // e.g. "Jewson, Tiverton Depot"
}

export interface Product {
    id: string;
    name: string;
    size: string;
    description: string;
    imageUrl: string;
    costPriceGBP: number;
    sellPriceGBP: number;
    stockLevel: number;
    thickness: number;
    costPerSlateEUR: number;
    transportEUR: number;
    slatesPerCrate: number;
    cratesPerLoad: number;
    slatesAndHalves: number;
}

export interface Accessory {
    id: string;
    name: string;
    priceGBP: number;
    unit: string;
    coverage: number;
    isDefault: boolean;
}

export interface Project {
    id: string;
    name: string;
    customerId: string;
    customerName: string; // fallback
    status: 'Quoted' | 'Won' | 'Lost';
    quotes: Quote[];
    createdAt: firebase.firestore.Timestamp;
    notes: { text: string; author: string; date: string }[];
    projectSummary: ProjectDetails;
}

export interface Quote {
    id: string;
    product: Product;
    createdAt: firebase.firestore.Timestamp;
    quoteHTML: string;
    diagramSVG: string;
    aiSalesStrategy: string;
    quoteNotes: string;
}

export interface QuoteSection {
    name: string;
    area: number;
    pitch: number;
    rafterLength?: number;
    eavesLength?: number;
}

export interface ProjectDetails {
    customerName: string;
    customerType: string;
    siteLocation: string;
    roofArea: number;
    roofPitch: number;
    eavesLength: number;
    rafterLength: number;
    exposure: 'sheltered' | 'moderate' | 'severe';
    sections?: QuoteSection[];
    visualImage?: string;
}

export interface TechnicalRule {
    pitchRange: [number, number];
    maxRafterLength: number;
    headlap: number; // in mm
    battenGauge: number; // in mm
}

export interface CampaignContact {
    id: string;
    contactName: string;
    company: string;
    email: string;
    phone: string;
}

export interface Campaign {
    id: string;
    name: string;
    goal: string;
    type: 'email' | 'sms';
    status: 'draft' | 'sent' | 'scheduled' | 'sending' | 'failed';
    contacts: CampaignContact[];
    createdAt: firebase.firestore.Timestamp;
    strategy: {
        targetAudienceAnalysis: string;
        keyPainPoints: string[];
        messagingAngle: string;
        recommendedChannels: string[];
    };
    emailTemplates?: {
        name: string;
        subject: string;
        body: string;
    }[];
    smsTemplates?: {
        name: string;
        body: string;
    }[];
    clicksendListId?: number;
    clicksendSmsCampaignId?: number;
    clicksendEmailCampaignId?: number;
    sendgridCampaignId?: string;
    lastSync?: firebase.firestore.Timestamp;
    market?: LeadMarket;
}

export interface ClickSendConfig {
  username: string;
  apiKey: string;
  fromEmail: string;
  fromName: string;
  fromEmailId?: number;
  fromSms?: string;
  masterTemplateId?: number;
}

export interface ClickSendBalance {
  balance: number;
  currency: string;
}

export interface ClickSendMasterTemplate {
  template_id_master: number;
  template_name: string;
}

export interface SentItem {
    id: string;
    type: 'single' | 'group';
    leadId?: string;
    leadTitle?: string;
    jobId?: string;
    jobLocation?: string;
    recipientName: string;
    recipientEmail: string;
    recipientCompany: string;
    sentAt: firebase.firestore.Timestamp;
    sentBy: string; // user email
    userId: string;
}

export interface StructuredSearchParams {
  location_filter?: string;
  country_code?: CountryCode;
  date_range?: string;
  min_grade?: 'A' | 'B' | 'C';
  sector_filter?: 'public_sector';
  data_source_type?: ('planning_portal' | 'contracts_finder')[];
  cpv_codes?: string[];
  limit?: number;
  search_mode?: 'discovery_weekly_list';
  keywords?: string[]; 
  projectStage?: string;
}

export interface DiscoverySource {
  id: string;
  region: string;
  url: string;
  market: LeadMarket;
}

// --- SUPERVISOR AI TYPES ---

export interface UserAction {
    id: string;
    timestamp: number;
    userId: string;
    actionType: 'SEARCH' | 'DELETE_LEAD' | 'SAVE_LEAD' | 'NAVIGATION' | 'FEATURE_USE' | 'FEEDBACK';
    view: ViewName;
    details: Record<string, any>; // Flexible payload (e.g. "Deleted Lead ID: 123, Reason: Duplicate")
}

export interface SupervisorReport {
    id: string;
    generatedAt: number; // timestamp
    periodStart: number;
    periodEnd: number;
    insights: {
        usagePatterns: string[]; // e.g. "User searches for 'Barns' 40% of time"
        frictionPoints: string[]; // e.g. "User deletes 80% of leads from source X"
        automationOpportunities: string[]; // e.g. "Suggest auto-filter for 'On-Site'"
        systemHealth: string; // "Stable", "High API Usage", etc.
    };
    recommendations: string[]; // Actionable dev/user steps
    rawSummary: string; // Markdown body from AI
}

export interface SupervisorFeedback {
    id: string;
    userId: string;
    timestamp: number;
    message: string;
    sentiment: 'Positive' | 'Negative' | 'Neutral' | 'Bug';
    contextView: ViewName;
}
