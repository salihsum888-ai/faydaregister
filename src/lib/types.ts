export type RegistrationStatus = 'Processed' | 'Pending Review' | 'Rejected' | 'Processing' | 'Failed';

export interface Registration {
  id: string;
  applicantName: string;
  submissionDate: string;
  status: RegistrationStatus;
  location: string;
  email: string;
  phone: string;
  content: string;
  requiredFieldsFilled: boolean;
  attachmentsIncluded: boolean;
  officer?: string;
  remarks?: string;
  rejectionReason?: string;
  assignedReviewerId?: string;
  updatedAt?: string;
  isPrinted?: boolean;
  isSchoolRegistration?: boolean;
  schoolName?: string;
  isInstitutionRegistration?: boolean;
  institutionName?: string;
}

export interface DashboardStats {
  total: number;
  processed: number;
  pendingReview: number;
  rejected: number;
  processing: number;
  failed: number;
  totalOfficers: number;
  activeOfficers: number;
  pendingOfficers: number;
  onDutyOfficers: number;
  institutionsCount?: number;
  institutionRecordsCount?: number;
}

export interface DailyReport {
  id: string;
  officerId: string;
  date: string;
  ethioCount: number;
  safaricomCount: number;
  total: number;
  remarks?: string;
  timestamp?: any;
  isSchoolRegistration?: boolean;
  schoolName?: string;
  isInstitutionRegistration?: boolean;
  institutionName?: string;
  studentCount?: number;
  nonStudentCount?: number;
}

export interface MonthlySummary {
  id: string;
  officerId: string;
  month: string;
  year: string;
  ethio: number;
  safaricom: number;
  total: number;
  processed: number;
  processing: number;
  rejected: number;
  failed: number;
  pendingReview: number;
  timestamp?: any;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  createdAt: string;
}

export interface SharedRegistrationPayload {
  id: string;
  applicantName: string;
  status: RegistrationStatus;
  phone?: string;
  location?: string;
  institutionName?: string;
  submissionDate?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  text?: string;
  audioUrl?: string;
  audioDurationSeconds?: number;
  senderId: string;
  senderName: string;
  senderEmail: string;
  timestamp: any; 
  isEdited?: boolean;
  deletedFor?: string[];
  updatedAt?: any;
  replyToId?: string;
  replyToSenderName?: string;
  replyToText?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: 'image' | 'file';
  sharedRegistration?: SharedRegistrationPayload;
  isCallLog?: boolean;
  callLogData?: {
    callType: 'voice' | 'video';
    event: 'started' | 'ended' | 'missed' | 'declined';
    durationSeconds?: number;
  };
  isExamSubmission?: boolean;
  examSubmission?: MeetingExamSubmission;
}

export interface Conversation {
  id: string;
  type: 'dm' | 'group';
  members: string[];
  name?: string;
  description?: string;
  lastMessage?: string;
  lastTimestamp?: any;
  lastSenderId?: string;
  lastSenderName?: string;
  lastReadBy?: Record<string, string>;
  typingBy?: Record<string, string>;
  createdBy?: string;
  pinnedMessageId?: string;
  activeCall?: CallSession | null;
  isMeetingRoom?: boolean;
  meetingData?: MeetingSession;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'alert' | 'update';
  targetRegion?: string;
  targetRole?: 'all' | 'admin' | 'reviewer';
  date: string;
  timestamp?: any;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role: string;
  region?: string;
  cluster?: string;
  profilePhoto?: string;
  lastAnnouncementReadAt?: string;
  lastMessageReadAt?: string;
  lastCallsViewedAt?: string;
  updatedAt?: string;
  isDutyActive?: boolean;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
}

export interface SystemSettings {
  id: string;
  bureauName: string;
  logoUrl: string;
  contactEmail?: string;
  contactPhone?: string;
  officeAddress?: string;
  operationalHours?: string;
  systemProtocol?: string;
  maintenanceMode?: boolean;
  publicLookupEnabled?: boolean;
  primaryLanguage?: string;
  dateFormat?: string;
  institutionTargets?: Record<string, number>;
  slaTargetPct?: number;
  updatedAt: any;
}

export interface AuditLog {
  id: string;
  officerId: string;
  officerName: string;
  action: string;
  targetId: string;
  details: string;
  timestamp: any;
}

export interface CallParticipantState {
  uid: string;
  name: string;
  role?: string;
  photoUrl?: string;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isHandRaised?: boolean;
  joinedAt: string;
}

export interface CallSession {
  id: string;
  conversationId: string;
  conversationName: string;
  conversationType: 'dm' | 'group';
  callType: 'voice' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'declined';
  callerId: string;
  callerName: string;
  targetMemberIds: string[];
  activeParticipantIds: string[];
  participants?: Record<string, CallParticipantState>;
  screenSharerId?: string;
  screenSharerName?: string;
  offerSdp?: string;
  answerSdp?: string;
  callerCandidates?: string[];
  calleeCandidates?: string[];
  sdpVersion?: number;
  startedAt: string;
  connectedAt?: string;
  endedAt?: string;
  endedBy?: string;
  updatedAt?: any;
}

export interface MeetingQuestion {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  points: number;
  explanation?: string;
}

export interface MeetingPoll {
  id: string;
  question: string;
  options: string[];
  votes?: Record<string, number>;
  isOpen: boolean;
}

export interface MeetingSession {
  id: string;
  title: string;
  agenda: string;
  category: 'Protocol Briefing' | 'Institution Training' | 'Quality Audit' | 'Emergency Sync';
  status: 'scheduled' | 'live' | 'ended';
  hostId: string;
  hostName: string;
  scheduledFor: string;
  startedAt?: string;
  endedAt?: string;
  activeParticipantIds: string[];
  attendeeIds: string[];
  participants?: Record<string, CallParticipantState>;
  screenSharerId?: string;
  screenSharerName?: string;
  offerSdp?: string;
  answerSdp?: string;
  meetingNotes?: string;
  activePoll?: MeetingPoll;
  hasExam: boolean;
  examUnlocked: boolean;
  passingScorePct: number;
  examDurationMinutes: number;
  questions: MeetingQuestion[];
  createdAt: string;
  updatedAt?: any;
}

export interface MeetingExamSubmission {
  id: string;
  meetingId: string;
  meetingTitle: string;
  officerId: string;
  officerName: string;
  officerEmail?: string;
  answers: number[];
  correctCount: number;
  totalQuestions: number;
  earnedPoints: number;
  totalPoints: number;
  exactScorePct: number;
  passed: boolean;
  submittedAt: string;
}

