'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import {
  collection,
  query,
  where,
  limit,
  doc,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import {
  setDocumentNonBlocking,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase/non-blocking-updates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  MonitorOff,
  PhoneOff,
  Users,
  Plus,
  GraduationCap,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  Sparkles,
  FileSpreadsheet,
  FileText,
  Trash2,
  Play,
  Lock,
  Unlock,
  Hand,
  BookOpen,
  Loader2,
  MessageSquare,
  Radio,
  RotateCcw,
  ShieldCheck,
  SwitchCamera,
  RefreshCw,
  Printer,
  Download,
  BarChart3,
  ImageIcon,
  X,
} from 'lucide-react';
import {
  Conversation,
  Message,
  UserProfile,
  MeetingSession,
  MeetingQuestion,
  MeetingExamSubmission,
  CallParticipantState,
} from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/i18n/language-provider';
import { cn } from '@/lib/utils';
import { acquireDisplayMediaStream, compressImageFileForScreenShare } from '@/lib/screen-share';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const DEFAULT_PROTOCOL_QUESTIONS: MeetingQuestion[] = [
  {
    id: 'q1',
    question:
      'What is the required digit length for a valid Fayda Registration ID (RID) in the Bureau Ledger?',
    options: ['12 Digits', '16 Digits', '29 Digits', '32 Digits'],
    correctOptionIndex: 2,
    points: 25,
    explanation:
      'Every official Fayda Registration ID (RID) consists of exactly 29 numeric digits.',
  },
  {
    id: 'q2',
    question:
      'When an applicant record has a biometric or document discrepancy, which status and action must be recorded?',
    options: [
      'Delete the record immediately without logging',
      'Mark status as Rejected and specify a Protocol Rejection Reason',
      'Leave status as Processed',
      'Change the institution name to Unknown',
    ],
    correctOptionIndex: 1,
    points: 25,
    explanation:
      'Discrepancies must be marked as Rejected (not generic "Issues") with an explicit protocol rejection reason.',
  },
  {
    id: 'q3',
    question:
      'How is the exact Success Rate calculated across Home, Intel, Performance, and Full Record pages?',
    options: [
      'Processed divided by (Processed + Processing + Rejected + Failed) rounded to 2 decimal places',
      'Processed divided by Rejected only',
      'Approximate integer rounding without Failed records',
      'Random sample estimate',
    ],
    correctOptionIndex: 0,
    points: 25,
    explanation:
      'All rates use the exact 2-decimal formula Number(((count / exactTotal) * 100).toFixed(2)) over the unified 4-status denominator.',
  },
  {
    id: 'q4',
    question:
      'When registering applicants under a university, college, or school, what must be enabled on the registration form?',
    options: [
      'Nothing — institutions are not tracked',
      'Enable the Institution Registration toggle and select or enter the Institution Name',
      'Enter the institution name inside the phone number field',
      'Only log it in personal notes',
    ],
    correctOptionIndex: 1,
    points: 25,
    explanation:
      'Enabling the Institution Registration toggle links the record to the Institutions Registry and Intel leaderboard.',
  },
];

function calcExactRate(count: number, total: number): number {
  if (total <= 0 || count <= 0) return 0;
  return Number(((count / total) * 100).toFixed(2));
}

export default function MeetingsAndExamsPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { t, formatDate } = useTranslation();

  // Create Meeting & Exam Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [category, setCategory] = useState<MeetingSession['category']>('Protocol Briefing');
  const [startImmediately, setStartImmediately] = useState(true);
  const [hasExam, setHasExam] = useState(true);
  const [passingScorePct, setPassingScorePct] = useState('80');
  const [examDurationMinutes, setExamDurationMinutes] = useState('10');
  const [questions, setQuestions] = useState<MeetingQuestion[]>(DEFAULT_PROTOCOL_QUESTIONS);
  const [isSavingMeeting, setIsSavingMeeting] = useState(false);

  // Active Live Meeting Room state
  const [activeMeetingConvId, setActiveMeetingConvId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user');
  const [hasLocalVideoTrack, setHasLocalVideoTrack] = useState(false);
  const [hasLocalAudioTrack, setHasLocalAudioTrack] = useState(false);
  const [hasLocalScreenTrack, setHasLocalScreenTrack] = useState(false);
  const [localMediaTick, setLocalMediaTick] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [liveNotesInput, setLiveNotesInput] = useState('');
  const [meetingElapsedSec, setMeetingElapsedSec] = useState(0);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [screenShareNotice, setScreenShareNotice] = useState<string | null>(null);
  const [isUploadingScreenPhoto, setIsUploadingScreenPhoto] = useState(false);
  const [pollQuestionInput, setPollQuestionInput] = useState(
    'Are all field units clear on the 29-digit RID verification protocol?'
  );
  const [pollOpt1, setPollOpt1] = useState('Yes — Clear & Ready');
  const [pollOpt2, setPollOpt2] = useState('Need Follow-up Clarification');

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setLocalVideoEl = useCallback(
    (el: HTMLVideoElement | null) => {
      localVideoRef.current = el;
      if (el && localStreamRef.current) {
        el.setAttribute('playsinline', 'true');
        el.setAttribute('webkit-playsinline', 'true');
        if (el.srcObject !== localStreamRef.current) {
          el.srcObject = localStreamRef.current;
        }
        el.muted = true;
        el.play().catch(() => {});
      }
    },
    [localMediaTick]
  );

  const setScreenVideoEl = useCallback(
    (el: HTMLVideoElement | null) => {
      screenVideoRef.current = el;
      if (el && screenStreamRef.current) {
        el.setAttribute('playsinline', 'true');
        el.setAttribute('webkit-playsinline', 'true');
        if (el.srcObject !== screenStreamRef.current) {
          el.srcObject = screenStreamRef.current;
        }
        el.muted = true;
        el.play().catch(() => {});
      }
    },
    [isScreenSharing, hasLocalScreenTrack]
  );

  // Post-Meeting Exam Portal & Certificate state
  const [examMeeting, setExamMeeting] = useState<MeetingSession | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [examRemainingSec, setExamRemainingSec] = useState<number>(600);
  const [latestSubmissionResult, setLatestSubmissionResult] =
    useState<MeetingExamSubmission | null>(null);
  const [isSubmittingExam, setIsSubmittingExam] = useState(false);
  const [certificateSub, setCertificateSub] = useState<MeetingExamSubmission | null>(null);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);
  const { data: currentUserProfile } = useDoc<UserProfile>(userProfileRef);
  const isAdmin = currentUserProfile?.role === 'admin';

  // Fetch all users so new meeting rooms include all bureau personnel
  const usersQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'users'), limit(1000));
  }, [db, user]);
  const { data: allUsers } = useCollection<UserProfile>(usersQuery);

  // Query conversations where user is a member, then filter isMeetingRoom === true
  const convsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'conversations'), where('members', 'array-contains', user.uid));
  }, [db, user]);
  const { data: rawConversations, isLoading: isConvsLoading } =
    useCollection<Conversation>(convsQuery);

  const meetingConversations = useMemo(() => {
    if (!rawConversations) return [];
    return rawConversations
      .filter((c) => Boolean(c.isMeetingRoom && c.meetingData))
      .sort((a, b) => {
        const timeA = new Date(a.meetingData?.createdAt || 0).getTime();
        const timeB = new Date(b.meetingData?.createdAt || 0).getTime();
        return timeB - timeA;
      });
  }, [rawConversations]);

  // Query messages for exam submissions
  const examMessagesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'messages'), limit(5000));
  }, [db, user]);
  const { data: rawMessages } = useCollection<Message>(examMessagesQuery);

  const examSubmissions = useMemo<MeetingExamSubmission[]>(() => {
    if (!rawMessages) return [];
    return rawMessages
      .filter((m) => Boolean(m.isExamSubmission && m.examSubmission))
      .map((m) => m.examSubmission!)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [rawMessages]);

  // Active live meeting object
  const activeMeetingConv = useMemo(
    () => meetingConversations.find((c) => c.id === activeMeetingConvId) || null,
    [meetingConversations, activeMeetingConvId]
  );
  const activeMeeting = activeMeetingConv?.meetingData || null;

  // Sync live notes when joining a meeting
  useEffect(() => {
    if (activeMeeting?.meetingNotes !== undefined) {
      setLiveNotesInput(activeMeeting.meetingNotes);
    }
  }, [activeMeeting?.id, activeMeeting?.meetingNotes]);

  // Elapsed timer for active meeting
  useEffect(() => {
    if (!activeMeeting || activeMeeting.status !== 'live') {
      setMeetingElapsedSec(0);
      return;
    }
    const startMs = new Date(activeMeeting.startedAt || activeMeeting.createdAt).getTime();
    const tick = () => {
      setMeetingElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeMeeting?.id, activeMeeting?.status, activeMeeting?.startedAt]);

  // Exam countdown timer
  useEffect(() => {
    if (!examMeeting || latestSubmissionResult) return;
    const interval = setInterval(() => {
      setExamRemainingSec((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [examMeeting?.id, latestSubmissionResult]);

  // Cleanup media streams when leaving meeting room
  useEffect(() => {
    if (!activeMeetingConvId) {
      stopMeetingMedia();
      return;
    }
    startMeetingCamera(true, false, cameraFacingMode);
    return () => {
      stopMeetingMedia();
    };
  }, [activeMeetingConvId]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      if (localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch(() => {});
    }
  }, [isCameraOn, localMediaTick, activeMeetingConvId]);

  useEffect(() => {
    if (screenVideoRef.current && screenStreamRef.current) {
      screenVideoRef.current.srcObject = screenStreamRef.current;
      screenVideoRef.current.play().catch(() => {});
    }
  }, [isScreenSharing, activeMeetingConvId]);

  const startMeetingMicMeter = (stream: MediaStream) => {
    if (micIntervalRef.current) {
      clearInterval(micIntervalRef.current);
      micIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (stream.getAudioTracks().length === 0) {
      setMicLevel(0);
      return;
    }
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      micIntervalRef.current = setInterval(() => {
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack || !audioTrack.enabled) {
          setMicLevel(0);
          return;
        }
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        setMicLevel(Math.min(100, Math.round((sum / dataArray.length) * 1.8)));
      }, 120);
    } catch {
      // Ignore AudioContext restriction
    }
  };

  const startMeetingCamera = async (
    wantVideo: boolean,
    wantMuted: boolean,
    facing: 'user' | 'environment' = 'user'
  ) => {
    setMediaNotice(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMediaNotice('Browser camera unavailable — make sure you are on HTTPS or localhost.');
      return;
    }

    const combinedStream = new MediaStream();
    let videoErr = '';
    let audioErr = '';

    if (wantVideo) {
      const videoAttempts: MediaStreamConstraints['video'][] = [
        { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        { facingMode: facing },
        { width: { ideal: 640 }, height: { ideal: 480 } },
        true,
      ];
      for (const vConstraint of videoAttempts) {
        try {
          const vStream = await navigator.mediaDevices.getUserMedia({
            video: vConstraint,
            audio: false,
          });
          vStream.getVideoTracks().forEach((t) => combinedStream.addTrack(t));
          videoErr = '';
          break;
        } catch (e: any) {
          videoErr = e?.name || 'CameraError';
        }
      }
    }

    try {
      const aStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      aStream.getAudioTracks().forEach((t) => {
        t.enabled = !wantMuted;
        combinedStream.addTrack(t);
      });
    } catch {
      try {
        const fallbackAud = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        fallbackAud.getAudioTracks().forEach((t) => {
          t.enabled = !wantMuted;
          combinedStream.addTrack(t);
        });
      } catch (e: any) {
        audioErr = e?.name || 'MicError';
      }
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }

    const hasVid = combinedStream.getVideoTracks().length > 0;
    const hasAud = combinedStream.getAudioTracks().length > 0;

    if (hasVid || hasAud) {
      localStreamRef.current = combinedStream;
      setHasLocalVideoTrack(hasVid);
      setHasLocalAudioTrack(hasAud);
      setIsCameraOn(hasVid);
      setLocalMediaTick((t) => t + 1);

      if (localVideoRef.current && hasVid) {
        localVideoRef.current.setAttribute('playsinline', 'true');
        localVideoRef.current.setAttribute('webkit-playsinline', 'true');
        localVideoRef.current.muted = true;
        localVideoRef.current.srcObject = combinedStream;
        localVideoRef.current.play().catch(() => {});
      }
      if (hasAud) {
        startMeetingMicMeter(combinedStream);
      }
      if (wantVideo && !hasVid) {
        setMediaNotice(
          `Phone camera blocked (${videoErr}). Tap "Retry Cam/Mic" and allow camera permission.`
        );
      } else if (!hasAud) {
        setMediaNotice(
          `Microphone blocked (${audioErr}). Tap "Retry Cam/Mic" and allow microphone permission.`
        );
      }
    } else {
      setHasLocalVideoTrack(false);
      setHasLocalAudioTrack(false);
      setMediaNotice(
        `Camera/Mic permission blocked (${
          videoErr || audioErr || 'Permission Denied'
        }). Allow Camera & Microphone in your browser address bar, then tap "Retry Cam/Mic".`
      );
    }
  };

  const stopMeetingMedia = () => {
    if (micIntervalRef.current) {
      clearInterval(micIntervalRef.current);
      micIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setHasLocalVideoTrack(false);
    setHasLocalAudioTrack(false);
    setHasLocalScreenTrack(false);
    setMicLevel(0);
    setIsScreenSharing(false);
    setScreenShareNotice(null);
  };

  // Exact KPI Statistics
  const kpiMetrics = useMemo(() => {
    const totalMeetings = meetingConversations.length;
    const liveMeetings = meetingConversations.filter(
      (c) => c.meetingData?.status === 'live'
    ).length;
    const uniqueAttendees = new Set<string>();
    meetingConversations.forEach((c) => {
      (c.meetingData?.attendeeIds || []).forEach((id) => uniqueAttendees.add(id));
    });

    const totalSubmissions = examSubmissions.length;
    const passedCount = examSubmissions.filter((s) => s.passed).length;
    const exactPassRate = calcExactRate(passedCount, totalSubmissions);
    const exactAvgScore =
      totalSubmissions > 0
        ? Number(
            (
              examSubmissions.reduce((acc, curr) => acc + curr.exactScorePct, 0) /
              totalSubmissions
            ).toFixed(2)
          )
        : 0;

    return {
      totalMeetings,
      liveMeetings,
      uniqueAttendeesCount: uniqueAttendees.size,
      totalSubmissions,
      passedCount,
      exactPassRate,
      exactAvgScore,
    };
  }, [meetingConversations, examSubmissions]);

  // Create a new Meeting + Post-Meeting Exam
  const handleCreateMeeting = async () => {
    if (!db || !user || !title.trim()) {
      toast({
        variant: 'destructive',
        title: 'Meeting Title Required',
        description: 'Please enter a title for the briefing or training session.',
      });
      return;
    }

    setIsSavingMeeting(true);
    try {
      const hostName =
        currentUserProfile?.fullName || user.email?.split('@')[0] || 'Bureau Host';
      const nowIso = new Date().toISOString();
      const convRef = doc(collection(db, 'conversations'));

      const allMemberIds = Array.from(
        new Set([user.uid, ...(allUsers || []).map((u) => u.id)])
      );

      const initialParticipant: CallParticipantState = {
        uid: user.uid,
        name: hostName,
        role: currentUserProfile?.role || 'Official',
        photoUrl: currentUserProfile?.profilePhoto || '',
        isMuted: false,
        isCameraOn: true,
        isScreenSharing: false,
        isHandRaised: false,
        joinedAt: nowIso,
      };

      const meetingPayload: MeetingSession = {
        id: convRef.id,
        title: title.trim(),
        agenda:
          agenda.trim() ||
          'Official Fayda Bureau operational briefing, quality rate review, and post-session assessment.',
        category,
        status: startImmediately ? 'live' : 'scheduled',
        hostId: user.uid,
        hostName,
        scheduledFor: nowIso,
        startedAt: startImmediately ? nowIso : undefined,
        activeParticipantIds: startImmediately ? [user.uid] : [],
        attendeeIds: [user.uid],
        participants: startImmediately ? { [user.uid]: initialParticipant } : {},
        meetingNotes:
          '• All 29-digit RIDs must be verified prior to final status approval.\n• Use Rejected (with explicit protocol reason) for document discrepancies.\n• All rates (Success, Processing, Rejection, Failed) are tracked to 2 decimal places.',
        hasExam,
        examUnlocked: false,
        passingScorePct: Math.min(100, Math.max(10, parseInt(passingScorePct || '80', 10) || 80)),
        examDurationMinutes: Math.max(1, parseInt(examDurationMinutes || '10', 10) || 10),
        questions: hasExam ? questions : [],
        createdAt: nowIso,
      };

      await setDocumentNonBlocking(
        convRef,
        {
          type: 'group',
          name: `[Meeting] ${meetingPayload.title}`,
          description: meetingPayload.agenda,
          members: allMemberIds,
          lastMessage: `${hostName} initialized meeting: ${meetingPayload.title}`,
          lastTimestamp: serverTimestamp(),
          lastSenderId: user.uid,
          lastSenderName: hostName,
          createdBy: user.uid,
          isMeetingRoom: true,
          meetingData: meetingPayload,
        },
        { merge: true }
      );

      setIsCreateOpen(false);
      setTitle('');
      setAgenda('');

      if (startImmediately) {
        setActiveMeetingConvId(convRef.id);
      }

      toast({
        title: startImmediately ? 'Live Meeting Launched' : 'Meeting Scheduled',
        description: `"${meetingPayload.title}" is now available to bureau personnel.`,
      });
    } finally {
      setIsSavingMeeting(false);
    }
  };

  // Join an existing Meeting Room
  const handleJoinMeetingRoom = (conv: Conversation) => {
    if (!db || !user || !conv.meetingData) return;
    const myName = currentUserProfile?.fullName || user.email?.split('@')[0] || 'Official';
    const nowIso = new Date().toISOString();
    const m = conv.meetingData;

    const nextActive = Array.from(new Set([...(m.activeParticipantIds || []), user.uid]));
    const nextAttendees = Array.from(new Set([...(m.attendeeIds || []), user.uid]));
    const nextParticipants: Record<string, CallParticipantState> = {
      ...(m.participants || {}),
      [user.uid]: {
        uid: user.uid,
        name: myName,
        role: currentUserProfile?.role || 'Official',
        photoUrl: currentUserProfile?.profilePhoto || '',
        isMuted: false,
        isCameraOn: true,
        isScreenSharing: false,
        isHandRaised: false,
        joinedAt: nowIso,
      },
    };

    updateDocumentNonBlocking(doc(db, 'conversations', conv.id), {
      meetingData: {
        ...m,
        status: 'live',
        startedAt: m.startedAt || nowIso,
        activeParticipantIds: nextActive,
        attendeeIds: nextAttendees,
        participants: nextParticipants,
      },
    });

    setIsMuted(false);
    setIsCameraOn(true);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setActiveMeetingConvId(conv.id);
  };

  const syncMyMeetingParticipant = (
    updates: Partial<CallParticipantState>,
    extraMeetingUpdates?: Partial<MeetingSession>
  ) => {
    if (!db || !user || !activeMeetingConv || !activeMeeting) return;
    const myName = currentUserProfile?.fullName || user.email?.split('@')[0] || 'Official';
    const currentMe = activeMeeting.participants?.[user.uid] || {
      uid: user.uid,
      name: myName,
      role: currentUserProfile?.role || 'Official',
      photoUrl: currentUserProfile?.profilePhoto || '',
      isMuted,
      isCameraOn,
      isScreenSharing,
      isHandRaised,
      joinedAt: new Date().toISOString(),
    };

    updateDocumentNonBlocking(doc(db, 'conversations', activeMeetingConv.id), {
      meetingData: {
        ...activeMeeting,
        ...(extraMeetingUpdates || {}),
        participants: {
          ...(activeMeeting.participants || {}),
          [user.uid]: {
            ...currentMe,
            ...updates,
          },
        },
      },
    });
  };

  const handleToggleMeetingMute = async () => {
    const next = !isMuted;
    setIsMuted(next);
    if (!next && (!localStreamRef.current || localStreamRef.current.getAudioTracks().length === 0)) {
      await startMeetingCamera(isCameraOn, false, cameraFacingMode);
    } else if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
    }
    syncMyMeetingParticipant({ isMuted: next });
  };

  const handleToggleMeetingCamera = async () => {
    const next = !isCameraOn;
    setIsCameraOn(next);
    if (next) {
      await startMeetingCamera(true, isMuted, cameraFacingMode);
    } else if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.stop();
        localStreamRef.current?.removeTrack(t);
      });
      setHasLocalVideoTrack(false);
      setLocalMediaTick((t) => t + 1);
    }
    syncMyMeetingParticipant({ isCameraOn: next });
  };

  const handleFlipMeetingCamera = async () => {
    const nextFacing = cameraFacingMode === 'user' ? 'environment' : 'user';
    setCameraFacingMode(nextFacing);
    await startMeetingCamera(true, isMuted, nextFacing);
  };

  const stopMeetingScreenShare = () => {
    if (!activeMeeting) return;
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setHasLocalScreenTrack(false);
    setIsScreenSharing(false);
    setScreenShareNotice(null);
    syncMyMeetingParticipant(
      { isScreenSharing: false },
      {
        screenSharerId:
          activeMeeting.screenSharerId === user?.uid ? '' : activeMeeting.screenSharerId,
        screenSharerName:
          activeMeeting.screenSharerId === user?.uid ? '' : activeMeeting.screenSharerName,
        sharedScreenImage:
          activeMeeting.screenSharerId === user?.uid ? '' : activeMeeting.sharedScreenImage || '',
        sharedScreenLabel:
          activeMeeting.screenSharerId === user?.uid ? '' : activeMeeting.sharedScreenLabel || '',
      }
    );
  };

  const handleToggleMeetingScreenShare = async () => {
    if (!activeMeeting) return;
    if (isScreenSharing || activeMeeting.screenSharerId === user?.uid) {
      stopMeetingScreenShare();
      return;
    }

    setScreenShareNotice(null);
    const result = await acquireDisplayMediaStream();
    if (!result.ok) {
      if (result.reason !== 'cancelled') {
        setScreenShareNotice(result.message);
      }
      return;
    }

    const myName = currentUserProfile?.fullName || user?.email?.split('@')[0] || 'Official';
    const stream = result.stream;
    screenStreamRef.current = stream;
    setHasLocalScreenTrack(true);
    setIsScreenSharing(true);

    if (screenVideoRef.current) {
      screenVideoRef.current.muted = true;
      screenVideoRef.current.srcObject = stream;
      screenVideoRef.current.play().catch(() => {});
    }

    const vidTrack = stream.getVideoTracks()[0];
    if (vidTrack) {
      vidTrack.onended = () => {
        stopMeetingScreenShare();
      };
    }

    syncMyMeetingParticipant(
      { isScreenSharing: true },
      {
        screenSharerId: user?.uid || '',
        screenSharerName: myName,
        sharedScreenImage: '',
        sharedScreenLabel: '',
      }
    );
  };

  const handleShareMeetingPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeMeeting) return;

    setIsUploadingScreenPhoto(true);
    try {
      const dataUrl = await compressImageFileForScreenShare(file);
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setHasLocalScreenTrack(false);
      setIsScreenSharing(true);
      setScreenShareNotice(null);

      const myName = currentUserProfile?.fullName || user?.email?.split('@')[0] || 'Official';
      syncMyMeetingParticipant(
        { isScreenSharing: true },
        {
          screenSharerId: user?.uid || '',
          screenSharerName: myName,
          sharedScreenImage: dataUrl,
          sharedScreenLabel: file.name || 'Shared Screenshot',
        }
      );
    } catch (err: any) {
      setScreenShareNotice(err?.message || 'Could not load that image. Please select a JPG or PNG.');
    } finally {
      setIsUploadingScreenPhoto(false);
    }
  };

  const handleUseMeetingRearCamera = async () => {
    setScreenShareNotice(null);
    setCameraFacingMode('environment');
    setIsCameraOn(true);
    await startMeetingCamera(true, isMuted, 'environment');
    syncMyMeetingParticipant({ isCameraOn: true });
  };

  const handleToggleRaiseHand = () => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    syncMyMeetingParticipant({ isHandRaised: next });
  };

  const handleSaveMeetingNotes = () => {
    if (!db || !activeMeetingConv || !activeMeeting) return;
    updateDocumentNonBlocking(doc(db, 'conversations', activeMeetingConv.id), {
      meetingData: {
        ...activeMeeting,
        meetingNotes: liveNotesInput,
      },
    });
    toast({
      title: 'Meeting Notes Synced',
      description: 'Shared briefing notes updated for all attendees.',
    });
  };

  const handleLaunchLivePoll = () => {
    if (!db || !activeMeetingConv || !activeMeeting || !pollQuestionInput.trim()) return;
    const poll = {
      id: `poll_${Date.now()}`,
      question: pollQuestionInput.trim(),
      options: [pollOpt1.trim() || 'Yes', pollOpt2.trim() || 'No'],
      votes: {},
      isOpen: true,
    };
    updateDocumentNonBlocking(doc(db, 'conversations', activeMeetingConv.id), {
      meetingData: {
        ...activeMeeting,
        activePoll: poll,
      },
    });
    toast({
      title: 'Live Poll Broadcasted',
      description: 'All participants in the meeting room can now vote.',
    });
  };

  const handleVoteLivePoll = (optionIdx: number) => {
    if (!db || !user || !activeMeetingConv || !activeMeeting?.activePoll) return;
    const currentPoll = activeMeeting.activePoll;
    const nextVotes = {
      ...(currentPoll.votes || {}),
      [user.uid]: optionIdx,
    };
    updateDocumentNonBlocking(doc(db, 'conversations', activeMeetingConv.id), {
      meetingData: {
        ...activeMeeting,
        activePoll: {
          ...currentPoll,
          votes: nextVotes,
        },
      },
    });
  };

  const handleCloseLivePoll = () => {
    if (!db || !activeMeetingConv || !activeMeeting?.activePoll) return;
    updateDocumentNonBlocking(doc(db, 'conversations', activeMeetingConv.id), {
      meetingData: {
        ...activeMeeting,
        activePoll: {
          ...activeMeeting.activePoll,
          isOpen: false,
        },
      },
    });
  };

  const handleDownloadCertificatePDF = (sub: MeetingExamSubmission) => {
    const pdf = new jsPDF('l', 'mm', 'a4');
    // Outer border
    pdf.setDrawColor(37, 99, 235);
    pdf.setLineWidth(2);
    pdf.rect(12, 12, 273, 186);
    pdf.setLineWidth(0.5);
    pdf.rect(15, 15, 267, 180);

    // Header
    pdf.setFontSize(11);
    pdf.setTextColor(71, 85, 105);
    pdf.text('NATIONAL FAYDA REGISTRATION BUREAU • OFFICIAL TRAINING & QUALITY DIVISION', 148.5, 34, {
      align: 'center',
    });

    pdf.setFontSize(26);
    pdf.setTextColor(15, 23, 42);
    pdf.text('CERTIFICATE OF PROTOCOL COMPETENCY', 148.5, 52, { align: 'center' });

    pdf.setFontSize(11);
    pdf.setTextColor(100, 116, 139);
    pdf.text('THIS OFFICIAL CREDENTIAL CERTIFIES THAT', 148.5, 70, { align: 'center' });

    // Officer Name
    pdf.setFontSize(24);
    pdf.setTextColor(37, 99, 235);
    pdf.text(sub.officerName.toUpperCase(), 148.5, 88, { align: 'center' });

    // Briefing Title
    pdf.setFontSize(12);
    pdf.setTextColor(51, 65, 85);
    pdf.text(
      `has successfully completed the briefing and passed the post-meeting assessment for:`,
      148.5,
      104,
      { align: 'center' }
    );

    pdf.setFontSize(16);
    pdf.setTextColor(15, 23, 42);
    pdf.text(`"${sub.meetingTitle}"`, 148.5, 118, { align: 'center' });

    // Exact 2-Decimal Score Box
    pdf.setFillColor(240, 253, 244);
    pdf.setDrawColor(16, 185, 129);
    pdf.roundedRect(78, 128, 141, 24, 4, 4, 'FD');
    pdf.setFontSize(13);
    pdf.setTextColor(5, 150, 105);
    pdf.text(
      `EXACT ASSESSMENT SCORE: ${sub.exactScorePct.toFixed(2)}% (${sub.correctCount} / ${sub.totalQuestions} CORRECT)`,
      148.5,
      143,
      { align: 'center' }
    );

    // Footer Metadata
    const certSerial = `CERT-${sub.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}`;
    pdf.setFontSize(10);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Certificate Serial: ${certSerial}`, 30, 175);
    pdf.text(
      `Issued Date: ${format(new Date(sub.submittedAt), 'MMMM dd, yyyy HH:mm')}`,
      148.5,
      175,
      { align: 'center' }
    );
    pdf.text('Status: VERIFIED PASS', 265, 175, { align: 'right' });

    pdf.save(`Fayda_Certificate_${sub.officerName.replace(/\s+/g, '_')}.pdf`);
    toast({
      title: 'Certificate Downloaded',
      description: `Official PDF certificate generated for ${sub.officerName}.`,
    });
  };

  const handleLeaveMeetingRoom = () => {
    if (!db || !user || !activeMeetingConv || !activeMeeting) return;
    stopMeetingMedia();
    const remaining = (activeMeeting.activeParticipantIds || []).filter((id) => id !== user.uid);
    const nextParticipants = { ...(activeMeeting.participants || {}) };
    delete nextParticipants[user.uid];

    updateDocumentNonBlocking(doc(db, 'conversations', activeMeetingConv.id), {
      meetingData: {
        ...activeMeeting,
        activeParticipantIds: remaining,
        participants: nextParticipants,
        screenSharerId:
          activeMeeting.screenSharerId === user.uid ? '' : activeMeeting.screenSharerId,
        screenSharerName:
          activeMeeting.screenSharerId === user.uid ? '' : activeMeeting.screenSharerName,
        sharedScreenImage:
          activeMeeting.screenSharerId === user.uid ? '' : activeMeeting.sharedScreenImage || '',
        sharedScreenLabel:
          activeMeeting.screenSharerId === user.uid ? '' : activeMeeting.sharedScreenLabel || '',
      },
    });
    setActiveMeetingConvId(null);
  };

  const handleEndMeetingAndUnlockExam = (conv: Conversation) => {
    if (!db || !conv.meetingData) return;
    stopMeetingMedia();
    const m = conv.meetingData;
    const updatedMeeting: MeetingSession = {
      ...m,
      status: 'ended',
      endedAt: new Date().toISOString(),
      activeParticipantIds: [],
      screenSharerId: '',
      screenSharerName: '',
      sharedScreenImage: '',
      sharedScreenLabel: '',
      examUnlocked: true,
    };

    updateDocumentNonBlocking(doc(db, 'conversations', conv.id), {
      meetingData: updatedMeeting,
      lastMessage: `Meeting ended • Post-Meeting Exam is now unlocked!`,
      lastTimestamp: serverTimestamp(),
    });

    setActiveMeetingConvId(null);
    if (updatedMeeting.hasExam && updatedMeeting.questions.length > 0) {
      openExamPortal(updatedMeeting);
    }
    toast({
      title: 'Meeting Concluded & Exam Unlocked',
      description: 'Participants can now complete the Post-Meeting Assessment Exam.',
    });
  };

  const handleToggleExamUnlock = (conv: Conversation) => {
    if (!db || !conv.meetingData) return;
    const m = conv.meetingData;
    const nextUnlocked = !m.examUnlocked;
    updateDocumentNonBlocking(doc(db, 'conversations', conv.id), {
      meetingData: {
        ...m,
        examUnlocked: nextUnlocked,
      },
    });
    toast({
      title: nextUnlocked ? 'Post-Meeting Exam Unlocked' : 'Exam Locked',
      description: nextUnlocked
        ? 'Attendees can now start the assessment exam.'
        : 'Exam access has been locked.',
    });
  };

  // Open Post-Meeting Exam Portal
  const openExamPortal = (meeting: MeetingSession) => {
    setExamMeeting(meeting);
    setSelectedAnswers({});
    setLatestSubmissionResult(null);
    setExamRemainingSec((meeting.examDurationMinutes || 10) * 60);
  };

  // Submit Post-Meeting Exam with Exact 2-Decimal Calculation
  const handleSubmitExam = async () => {
    if (!db || !user || !examMeeting) return;
    setIsSubmittingExam(true);

    try {
      const officerName =
        currentUserProfile?.fullName || user.email?.split('@')[0] || 'Official';
      let correctCount = 0;
      let earnedPoints = 0;
      let totalPoints = 0;
      const answerArray: number[] = [];

      examMeeting.questions.forEach((q, idx) => {
        const pts = Number(q.points || 25);
        totalPoints += pts;
        const chosen = selectedAnswers[idx] ?? -1;
        answerArray.push(chosen);
        if (chosen === q.correctOptionIndex) {
          correctCount += 1;
          earnedPoints += pts;
        }
      });

      const exactScorePct =
        totalPoints > 0
          ? Number(((earnedPoints / totalPoints) * 100).toFixed(2))
          : calcExactRate(correctCount, examMeeting.questions.length);

      const passed = exactScorePct >= (examMeeting.passingScorePct || 80);
      const submissionId = `exam_${examMeeting.id}_${user.uid}_${Date.now()}`;

      const submission: MeetingExamSubmission = {
        id: submissionId,
        meetingId: examMeeting.id,
        meetingTitle: examMeeting.title,
        officerId: user.uid,
        officerName,
        officerEmail: user.email || '',
        answers: answerArray,
        correctCount,
        totalQuestions: examMeeting.questions.length,
        earnedPoints,
        totalPoints,
        exactScorePct,
        passed,
        submittedAt: new Date().toISOString(),
      };

      const msgRef = doc(collection(db, 'messages'));
      await setDocumentNonBlocking(
        msgRef,
        {
          conversationId: examMeeting.id,
          text: `🎓 ${officerName} completed the Post-Meeting Exam for "${examMeeting.title}" • Score: ${exactScorePct}% (${correctCount}/${examMeeting.questions.length}) • ${
            passed ? 'PASSED' : 'RETAKE NEEDED'
          }`,
          senderId: user.uid,
          senderName: officerName,
          senderEmail: user.email || '',
          timestamp: serverTimestamp(),
          deletedFor: [],
          isExamSubmission: true,
          examSubmission: submission,
        },
        { merge: true }
      );

      setLatestSubmissionResult(submission);
      toast({
        title: passed ? 'Assessment Passed!' : 'Assessment Submitted',
        description: `Exact Score: ${exactScorePct}% (${correctCount}/${examMeeting.questions.length} correct).`,
      });
    } finally {
      setIsSubmittingExam(false);
    }
  };

  // Question Builder Helpers
  const handleAddQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: `q_${Date.now()}`,
        question: '',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctOptionIndex: 0,
        points: 25,
        explanation: '',
      },
    ]);
  };

  const handleUpdateQuestion = (index: number, updates: Partial<MeetingQuestion>) => {
    setQuestions((prev) => prev.map((q, idx) => (idx === index ? { ...q, ...updates } : q)));
  };

  const handleUpdateOptionText = (qIndex: number, optIndex: number, text: string) => {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== qIndex) return q;
        const nextOpts = [...q.options];
        nextOpts[optIndex] = text;
        return { ...q, options: nextOpts };
      })
    );
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Export Exam Results to Excel / PDF
  const handleExportExamExcel = () => {
    if (examSubmissions.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Submissions Yet',
        description: 'Complete at least one post-meeting exam to export results.',
      });
      return;
    }
    const rows = examSubmissions.map((s, idx) => ({
      'No.': idx + 1,
      'Meeting Title': s.meetingTitle,
      'Officer Name': s.officerName,
      'Officer Email': s.officerEmail || 'N/A',
      'Correct Answers': `${s.correctCount} / ${s.totalQuestions}`,
      'Earned Points': `${s.earnedPoints} / ${s.totalPoints}`,
      'Exact Score (%)': `${s.exactScorePct}%`,
      Status: s.passed ? 'PASSED' : 'FAILED',
      'Submitted At': format(new Date(s.submittedAt), 'yyyy-MM-dd HH:mm'),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Exam_Results');
    XLSX.writeFile(wb, `Fayda_Meeting_Exam_Results_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    toast({
      title: 'Excel Exported',
      description: 'Post-meeting exam ledger downloaded.',
    });
  };

  const handleExportExamPDF = () => {
    if (examSubmissions.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Submissions Yet',
        description: 'Complete at least one post-meeting exam to export results.',
      });
      return;
    }
    const pdf = new jsPDF('l', 'mm', 'a4');
    pdf.setFontSize(15);
    pdf.text('Official Bureau Post-Meeting Exam & Certification Ledger', 14, 15);
    pdf.setFontSize(9);
    pdf.text(
      `Total Submissions: ${kpiMetrics.totalSubmissions} | Exact Pass Rate: ${kpiMetrics.exactPassRate}% (${kpiMetrics.passedCount}/${kpiMetrics.totalSubmissions}) | Average Score: ${kpiMetrics.exactAvgScore}%`,
      14,
      22
    );

    const body = examSubmissions.map((s, idx) => [
      String(idx + 1),
      s.meetingTitle,
      s.officerName,
      `${s.correctCount} / ${s.totalQuestions}`,
      `${s.exactScorePct}%`,
      s.passed ? 'PASSED' : 'FAILED',
      format(new Date(s.submittedAt), 'MMM dd, yyyy HH:mm'),
    ]);

    autoTable(pdf, {
      startY: 28,
      head: [
        [
          '#',
          'Meeting Title',
          'Officer Name',
          'Correct / Total',
          'Exact Score (%)',
          'Result',
          'Submitted At',
        ],
      ],
      body,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
    });
    pdf.save(`Fayda_Meeting_Exam_Results_${format(new Date(), 'yyyyMMdd')}.pdf`);
    toast({
      title: 'PDF Exported',
      description: 'Official exam certification report saved.',
    });
  };

  if (isUserLoading || isConvsLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Dynamic Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              {t.meetingsPage.badge}
            </p>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground font-headline uppercase flex items-center gap-3">
            {t.meetingsPage.titleMain} {t.meetingsPage.titleHighlight}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {t.meetingsPage.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/communication')}
            className="h-11 px-4 rounded-xl text-xs font-bold"
          >
            <MessageSquare className="mr-2 h-4 w-4 text-primary" /> {t.meetingsPage.backToChatBtn}
          </Button>
          <Button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="h-11 px-5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs uppercase tracking-wider shadow-lg shadow-primary/20"
          >
            <Plus className="mr-2 h-4 w-4" /> {t.meetingsPage.hostMeetingBtn}
          </Button>
        </div>
      </div>

      {/* 4 Exact-Rate KPI Summary Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="rounded-[24px] p-6 border border-border/60 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t.meetingsPage.kpiSessionsTitle}
            </p>
            <div className="h-10 w-10 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Video className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-foreground mt-3 tabular-nums">
            {kpiMetrics.totalMeetings}
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-semibold">
            {kpiMetrics.liveMeetings > 0
              ? t.meetingsPage.kpiLiveCount.replace('{count}', String(kpiMetrics.liveMeetings))
              : t.meetingsPage.kpiAllArchived}
          </p>
        </Card>

        <Card className="rounded-[24px] p-6 border border-border/60 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t.meetingsPage.kpiParticipantsTitle}
            </p>
            <div className="h-10 w-10 rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-foreground mt-3 tabular-nums">
            {kpiMetrics.uniqueAttendeesCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-semibold">
            {t.meetingsPage.kpiParticipantsSub}
          </p>
        </Card>

        <Card className="rounded-[24px] p-6 border border-border/60 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t.meetingsPage.kpiPassRateTitle}
            </p>
            <div className="h-10 w-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Award className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-3 tabular-nums">
            {kpiMetrics.exactPassRate}%
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-semibold tabular-nums">
            {t.meetingsPage.kpiPassRateSub
              .replace('{passed}', String(kpiMetrics.passedCount))
              .replace('{total}', String(kpiMetrics.totalSubmissions))}
          </p>
        </Card>

        <Card className="rounded-[24px] p-6 border border-border/60 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t.meetingsPage.kpiAvgScoreTitle}
            </p>
            <div className="h-10 w-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <GraduationCap className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-foreground mt-3 tabular-nums">
            {kpiMetrics.exactAvgScore}%
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-semibold tabular-nums">
            {t.meetingsPage.kpiAvgScoreSub.replace('{total}', String(kpiMetrics.totalSubmissions))}
          </p>
        </Card>
      </section>

      {/* ACTIVE LIVE GROUP VIDEO & SCREEN-SHARE MEETING STUDIO */}
      {activeMeeting && activeMeetingConv && (
        <Card className="rounded-[32px] bg-slate-950 text-white border border-indigo-500/40 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
          <CardHeader className="p-6 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-widest">
                  <Radio className="h-3 w-3 animate-pulse" />
                  {t.meetingsPage.liveBriefingBadge} • {Math.floor(meetingElapsedSec / 60)}:
                  {String(meetingElapsedSec % 60).padStart(2, '0')}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-bold uppercase">
                  {activeMeeting.category}
                </span>
              </div>
              <CardTitle className="text-xl md:text-2xl font-black tracking-tight text-white">
                {activeMeeting.title}
              </CardTitle>
              <p className="text-xs text-slate-400">
                {t.meetingsPage.hostedByPrefix} {activeMeeting.hostName} •{' '}
                {Object.keys(activeMeeting.participants || {}).length || 1} {t.meetingsPage.participantsInRoomSuffix}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeMeeting.hasExam && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => openExamPortal(activeMeeting)}
                  className="h-9 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[10px] uppercase tracking-wider"
                >
                  <GraduationCap className="h-3.5 w-3.5 mr-1.5" /> {t.meetingsPage.takeExamBtn}
                </Button>
              )}
              {(activeMeeting.hostId === user?.uid || isAdmin) && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleEndMeetingAndUnlockExam(activeMeetingConv)}
                  className="h-9 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] uppercase tracking-wider"
                >
                  <PhoneOff className="h-3.5 w-3.5 mr-1.5" /> {t.meetingsPage.endMeetingLaunchExamBtn}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Columns: Screen Share Stage + Group Video Grid */}
              <div className="lg:col-span-2 space-y-4">
                <input
                  ref={screenPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleShareMeetingPhoto}
                />

                {(isScreenSharing || activeMeeting.screenSharerId || activeMeeting.sharedScreenImage) && (
                  <div className="rounded-2xl bg-slate-900 border border-indigo-500/40 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-300">
                        <MonitorUp className="h-4 w-4 text-indigo-400 animate-pulse" />
                        {isScreenSharing || activeMeeting.screenSharerId === user?.uid
                          ? t.meetingsPage.presentingYourScreen
                          : `${activeMeeting.screenSharerName || t.meetingsPage.hostLabel} ${t.meetingsPage.isPresentingSuffix}`}
                      </span>
                      {(isScreenSharing || activeMeeting.screenSharerId === user?.uid) && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleToggleMeetingScreenShare}
                          className="h-7 px-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-wider"
                        >
                          <MonitorOff className="h-3 w-3 mr-1" />
                          {t.meetingsPage.stopShareBtn}
                        </Button>
                      )}
                    </div>
                    <div className="h-[260px] rounded-xl bg-slate-950 flex items-center justify-center overflow-hidden border border-white/10">
                      {activeMeeting.sharedScreenImage ? (
                        <img
                          src={activeMeeting.sharedScreenImage}
                          alt={activeMeeting.sharedScreenLabel || 'Shared Screenshot'}
                          className="w-full h-full object-contain"
                        />
                      ) : isScreenSharing && hasLocalScreenTrack && screenStreamRef.current ? (
                        <video
                          ref={setScreenVideoEl}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center space-y-2 p-6">
                          <MonitorUp className="h-10 w-10 text-indigo-400 mx-auto" />
                          <p className="text-sm font-bold text-white">
                            {t.meetingsPage.liveStreamActiveTitle}
                          </p>
                          <p className="text-xs text-slate-400">
                            {t.meetingsPage.liveStreamActiveSub}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Participant Video Tiles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.values(
                    activeMeeting.participants || {
                      [user?.uid || 'me']: {
                        uid: user?.uid || 'me',
                        name: currentUserProfile?.fullName || 'You',
                        role: currentUserProfile?.role || 'Official',
                        isMuted,
                        isCameraOn,
                        isScreenSharing,
                        isHandRaised,
                        joinedAt: new Date().toISOString(),
                      },
                    }
                  ).map((p) => {
                    const isMe = p.uid === user?.uid;
                    const showCam = isMe ? isCameraOn : p.isCameraOn;
                    const muted = isMe ? isMuted : p.isMuted;
                    const hand = isMe ? isHandRaised : p.isHandRaised;

                    return (
                      <div
                        key={p.uid}
                        className="relative rounded-2xl bg-slate-900 border border-white/10 h-[210px] overflow-hidden flex flex-col items-center justify-center"
                      >
                        {showCam && isMe && hasLocalVideoTrack ? (
                          <video
                            key={`meeting-vid-${localMediaTick}`}
                            ref={setLocalVideoEl}
                            autoPlay
                            playsInline
                            muted
                            className={cn(
                              'absolute inset-0 w-full h-full object-cover',
                              cameraFacingMode === 'user' && '-scale-x-100'
                            )}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Avatar className="h-20 w-20 border-2 border-primary/50 shadow-xl">
                              <AvatarImage src={p.photoUrl} />
                              <AvatarFallback className="bg-primary text-white text-xl font-black">
                                {(p.name || 'OF').substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-[10px] font-bold text-emerald-400">
                              {showCam ? t.meetingsPage.hdVideoActive : t.meetingsPage.voiceAudioMode}
                            </span>
                          </div>
                        )}

                        {hand && (
                          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1 shadow-lg">
                            <Hand className="h-3 w-3" /> {t.meetingsPage.handRaisedBadge}
                          </div>
                        )}

                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur-md border border-white/10">
                          <span className="text-xs font-bold truncate">
                            {p.name} {isMe ? t.meetingsPage.youSuffix : ''}
                          </span>
                          <div className="flex items-center gap-2">
                            {isMe && !muted && hasLocalAudioTrack && (
                              <div className="flex items-end gap-0.5 h-3.5">
                                {[15, 35, 60, 80].map((thresh, idx) => (
                                  <span
                                    key={idx}
                                    className={cn(
                                      'w-1 rounded-full transition-all duration-75',
                                      micLevel >= thresh ? 'bg-emerald-400' : 'bg-white/20'
                                    )}
                                    style={{ height: `${(idx + 1) * 25}%` }}
                                  />
                                ))}
                              </div>
                            )}
                            {muted ? (
                              <MicOff className="h-3.5 w-3.5 text-rose-400" />
                            ) : (
                              <Mic className="h-3.5 w-3.5 text-emerald-400" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {screenShareNotice && (
                  <div className="rounded-xl bg-slate-900 border border-indigo-500/40 p-3 text-[11px] text-indigo-100 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                    <div className="flex items-start gap-2 text-left">
                      <MonitorUp className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                      <span>{screenShareNotice}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isUploadingScreenPhoto}
                        onClick={() => screenPhotoInputRef.current?.click()}
                        className="h-7 px-2.5 text-[10px] font-black uppercase tracking-wider rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        <ImageIcon className="h-3 w-3 mr-1" />
                        {t.meetingsPage.sharePhotoBtn}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleUseMeetingRearCamera}
                        className="h-7 px-2.5 text-[10px] font-black uppercase tracking-wider rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <SwitchCamera className="h-3 w-3 mr-1" />
                        {t.meetingsPage.useRearCamBtn}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setScreenShareNotice(null)}
                        className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300"
                        aria-label="Close"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {mediaNotice && (
                  <div className="flex items-center justify-center gap-2 text-[11px] text-slate-300 text-center">
                    <span>{mediaNotice}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => startMeetingCamera(isCameraOn, isMuted, cameraFacingMode)}
                      className="h-6 px-2 text-[9px] font-black uppercase tracking-wider rounded-lg"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" /> {t.meetingsPage.retryCamMicBtn}
                    </Button>
                  </div>
                )}

                {/* Room Media Control Bar */}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-2 sm:gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={handleToggleMeetingMute}
                    className={cn(
                      'h-11 px-3 sm:px-4 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-wider',
                      isMuted
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    )}
                  >
                    {isMuted ? (
                      <MicOff className="h-4 w-4 mr-1.5 shrink-0" />
                    ) : (
                      <Mic className="h-4 w-4 mr-1.5 shrink-0" />
                    )}
                    {isMuted ? t.meetingsPage.unmuteBtn : t.meetingsPage.muteBtn}
                  </Button>

                  <Button
                    type="button"
                    onClick={handleToggleMeetingCamera}
                    className={cn(
                      'h-11 px-3 sm:px-4 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-wider',
                      isCameraOn
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    )}
                  >
                    {isCameraOn ? (
                      <Video className="h-4 w-4 mr-1.5 shrink-0" />
                    ) : (
                      <VideoOff className="h-4 w-4 mr-1.5 shrink-0" />
                    )}
                    {isCameraOn ? t.meetingsPage.cameraOnBtn : t.meetingsPage.cameraOffBtn}
                  </Button>

                  {isCameraOn && hasLocalVideoTrack && (
                    <Button
                      type="button"
                      onClick={handleFlipMeetingCamera}
                      className="h-11 px-3 sm:px-4 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white"
                    >
                      <SwitchCamera className="h-4 w-4 mr-1.5 shrink-0" />
                      {t.meetingsPage.flipCamBtn}
                    </Button>
                  )}

                  <Button
                    type="button"
                    onClick={handleToggleMeetingScreenShare}
                    className={cn(
                      'h-11 px-3 sm:px-4 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-wider',
                      isScreenSharing
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    )}
                  >
                    {isScreenSharing ? (
                      <MonitorOff className="h-4 w-4 mr-1.5 shrink-0" />
                    ) : (
                      <MonitorUp className="h-4 w-4 mr-1.5 shrink-0" />
                    )}
                    {isScreenSharing ? t.meetingsPage.stopShareBtn : t.meetingsPage.shareScreenBtn}
                  </Button>

                  <Button
                    type="button"
                    onClick={handleToggleRaiseHand}
                    className={cn(
                      'h-11 px-3 sm:px-4 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-wider',
                      isHandRaised
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    )}
                  >
                    <Hand className="h-4 w-4 mr-1.5 shrink-0" />
                    {isHandRaised ? t.meetingsPage.lowerHandBtn : t.meetingsPage.raiseHandBtn}
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleLeaveMeetingRoom}
                    className="col-span-2 sm:col-span-1 h-11 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] sm:text-xs uppercase tracking-wider"
                  >
                    <PhoneOff className="h-4 w-4 mr-1.5 shrink-0" /> {t.meetingsPage.leaveRoomBtn}
                  </Button>
                </div>
              </div>

              {/* Right Column: Shared Live Briefing Notes & Live Room Poll */}
              <div className="rounded-2xl bg-slate-900 border border-white/10 p-4 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4" /> {t.meetingsPage.sharedNotesTitle}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {t.meetingsPage.sharedNotesSub}
                  </p>
                  <textarea
                    value={liveNotesInput}
                    onChange={(e) => setLiveNotesInput(e.target.value)}
                    rows={5}
                    className="w-full rounded-xl bg-slate-950 border border-white/10 p-3 text-xs text-slate-200 font-medium focus:outline-none focus:border-primary"
                    placeholder={t.meetingsPage.notesPlaceholder}
                  />
                  <Button
                    type="button"
                    onClick={handleSaveMeetingNotes}
                    className="w-full h-9 rounded-xl bg-primary hover:bg-primary/90 text-white font-black text-xs uppercase tracking-wider"
                  >
                    {t.meetingsPage.saveNotesBtn}
                  </Button>
                </div>

                {/* Live Room Poll */}
                <div className="pt-3 border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <BarChart3 className="h-4 w-4" /> {t.meetingsPage.livePollTitle}
                    </span>
                    {activeMeeting.activePoll?.isOpen &&
                      (activeMeeting.hostId === user?.uid || isAdmin) && (
                        <button
                          type="button"
                          onClick={handleCloseLivePoll}
                          className="text-[10px] font-bold text-slate-400 hover:text-white cursor-pointer"
                        >
                          {t.meetingsPage.closePollBtn}
                        </button>
                      )}
                  </div>

                  {activeMeeting.activePoll ? (
                    <div className="p-3 rounded-xl bg-slate-950 border border-white/10 space-y-2.5">
                      <p className="text-xs font-black text-white">
                        {activeMeeting.activePoll.question}
                      </p>
                      <div className="space-y-1.5">
                        {activeMeeting.activePoll.options.map((opt, idx) => {
                          const votesMap = activeMeeting.activePoll?.votes || {};
                          const totalVotes = Object.keys(votesMap).length;
                          const optVotes = Object.values(votesMap).filter((v) => v === idx).length;
                          const exactPct = calcExactRate(optVotes, totalVotes);
                          const isMyChoice = user?.uid ? votesMap[user.uid] === idx : false;

                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={!activeMeeting.activePoll?.isOpen}
                              onClick={() => handleVoteLivePoll(idx)}
                              className={cn(
                                'w-full text-left p-2 rounded-lg border text-[11px] font-bold transition-all flex items-center justify-between gap-2 cursor-pointer',
                                isMyChoice
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                                  : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                              )}
                            >
                              <span className="truncate">{opt}</span>
                              <span className="font-mono text-[10px] shrink-0 tabular-nums">
                                {exactPct.toFixed(2)}% ({optVotes}/{totalVotes})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    (activeMeeting.hostId === user?.uid || isAdmin) && (
                      <div className="space-y-2">
                        <Input
                          value={pollQuestionInput}
                          onChange={(e) => setPollQuestionInput(e.target.value)}
                          placeholder={t.meetingsPage.pollQuestionPlaceholder}
                          className="h-8 bg-slate-950 border-white/10 text-xs text-white"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <Input
                            value={pollOpt1}
                            onChange={(e) => setPollOpt1(e.target.value)}
                            placeholder={t.meetingsPage.option1Placeholder}
                            className="h-7 bg-slate-950 border-white/10 text-[11px] text-white"
                          />
                          <Input
                            value={pollOpt2}
                            onChange={(e) => setPollOpt2(e.target.value)}
                            placeholder={t.meetingsPage.option2Placeholder}
                            className="h-7 bg-slate-950 border-white/10 text-[11px] text-white"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleLaunchLivePoll}
                          className="w-full h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-wider"
                        >
                          {t.meetingsPage.broadcastPollBtn}
                        </Button>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meetings & Post-Meeting Exams Directory */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-foreground flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" /> {t.meetingsPage.directoryTitle}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t.meetingsPage.directorySub}
            </p>
          </div>
        </div>

        {meetingConversations.length === 0 ? (
          <Card className="rounded-[28px] p-12 text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <GraduationCap className="h-7 w-7" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-black uppercase">
                {t.meetingsPage.emptyMeetingsTitle}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t.meetingsPage.emptyMeetingsSub}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="rounded-xl bg-primary hover:bg-primary/90 text-white font-black text-xs uppercase tracking-wider px-6 h-11"
            >
              <Plus className="mr-2 h-4 w-4" /> {t.meetingsPage.hostFirstMeetingBtn}
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {meetingConversations.map((conv) => {
              const m = conv.meetingData!;
              const mySubs = examSubmissions.filter(
                (s) => s.meetingId === m.id && s.officerId === user?.uid
              );
              const myBestSub =
                mySubs.length > 0
                  ? [...mySubs].sort((a, b) => b.exactScorePct - a.exactScorePct)[0]
                  : null;
              const allMeetingSubs = examSubmissions.filter((s) => s.meetingId === m.id);
              const meetingPassCount = allMeetingSubs.filter((s) => s.passed).length;
              const meetingExactPassRate = calcExactRate(
                meetingPassCount,
                allMeetingSubs.length
              );

              return (
                <Card
                  key={conv.id}
                  className="rounded-[24px] border border-border/70 p-6 flex flex-col justify-between gap-5 hover:shadow-lg transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider',
                            m.status === 'live'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : m.status === 'scheduled'
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                          )}
                        >
                          {m.status === 'live' && (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          )}
                          {m.status === 'live'
                            ? t.meetingsPage.liveVideoRoomBadge
                            : m.status === 'scheduled'
                            ? t.meetingsPage.scheduledBadge
                            : t.meetingsPage.concludedBadge}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase">
                          {m.category}
                        </span>
                      </div>

                      {(m.hostId === user?.uid || isAdmin) && (
                        <button
                          type="button"
                          onClick={() => handleToggleExamUnlock(conv)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          {m.examUnlocked ? (
                            <>
                              <Unlock className="h-3 w-3 text-emerald-500" /> {t.meetingsPage.examOpenBtn}
                            </>
                          ) : (
                            <>
                              <Lock className="h-3 w-3 text-amber-500" /> {t.meetingsPage.unlockExamBtn}
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div>
                      <h3 className="text-lg font-black text-foreground tracking-tight">
                        {m.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {m.agenda}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-muted/40">
                        <span className="text-[9px] font-black uppercase text-muted-foreground block">
                          {t.meetingsPage.hostLabel}
                        </span>
                        <span className="font-bold truncate block">{m.hostName}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-muted/40">
                        <span className="text-[9px] font-black uppercase text-muted-foreground block">
                          {t.meetingsPage.examStandardLabel}
                        </span>
                        <span className="font-bold tabular-nums">
                          {m.hasExam ? `${m.questions.length} Qs • ${m.passingScorePct}%` : t.meetingsPage.noExamText}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-muted/40">
                        <span className="text-[9px] font-black uppercase text-muted-foreground block">
                          {t.meetingsPage.passRateLabel}
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {allMeetingSubs.length > 0
                            ? `${meetingExactPassRate.toFixed(2)}% (${meetingPassCount}/${allMeetingSubs.length})`
                            : t.meetingsPage.noAttemptsText}
                        </span>
                      </div>
                    </div>

                    {myBestSub && (
                      <div
                        className={cn(
                          'flex items-center justify-between px-3.5 py-2 rounded-xl border text-xs font-bold',
                          myBestSub.passed
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          {myBestSub.passed ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-rose-500" />
                          )}
                          {t.meetingsPage.yourBestScorePrefix} {myBestSub.exactScorePct.toFixed(2)}% ({myBestSub.correctCount}/
                          {myBestSub.totalQuestions})
                        </span>
                        {myBestSub.passed ? (
                          <button
                            type="button"
                            onClick={() => setCertificateSub(myBestSub)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700 cursor-pointer"
                          >
                            <Award className="h-3 w-3" /> {t.meetingsPage.certificateBtn}
                          </button>
                        ) : (
                          <span className="uppercase text-[10px] font-black">
                            {t.meetingsPage.retakeAvailableBadge}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border">
                    <Button
                      type="button"
                      variant={m.status === 'live' ? 'default' : 'outline'}
                      onClick={() => handleJoinMeetingRoom(conv)}
                      className="flex-1 h-10 rounded-xl font-black text-[11px] uppercase tracking-wider"
                    >
                      <Video className="mr-1.5 h-4 w-4" />
                      {m.status === 'live' ? t.meetingsPage.joinLiveCallBtn : t.meetingsPage.reopenRoomBtn}
                    </Button>

                    {m.hasExam && m.questions.length > 0 && (
                      <Button
                        type="button"
                        onClick={() => openExamPortal(m)}
                        className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[11px] uppercase tracking-wider"
                      >
                        <GraduationCap className="mr-1.5 h-4 w-4" />
                        {myBestSub ? t.meetingsPage.retakeReviewExamBtn : t.meetingsPage.takeExamBtn}
                      </Button>
                    )}

                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteDocumentNonBlocking(doc(db!, 'conversations', conv.id))}
                        className="h-10 w-10 rounded-xl text-muted-foreground hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Post-Meeting Exam Results & Certification Ledger */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-foreground flex items-center gap-2">
              <Award className="h-5 w-5 text-emerald-500" /> {t.meetingsPage.resultsLedgerTitle}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t.meetingsPage.resultsLedgerSub}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportExamExcel}
              className="h-9 rounded-xl text-xs font-bold"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600" /> {t.meetingsPage.exportExcelBtn}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportExamPDF}
              className="h-9 rounded-xl text-xs font-bold"
            >
              <FileText className="h-3.5 w-3.5 mr-1.5 text-rose-600" /> {t.meetingsPage.exportPdfBtn}
            </Button>
          </div>
        </div>

        <Card className="rounded-[24px] overflow-hidden border border-border/70">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-6 text-[10px] font-black uppercase tracking-widest">
                    {t.meetingsPage.colOfficial}
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest">
                    {t.meetingsPage.colMeeting}
                  </TableHead>
                  <TableHead className="text-center text-[10px] font-black uppercase tracking-widest">
                    {t.meetingsPage.colCorrectTotal}
                  </TableHead>
                  <TableHead className="text-center text-[10px] font-black uppercase tracking-widest">
                    {t.meetingsPage.colScoreRate}
                  </TableHead>
                  <TableHead className="text-center text-[10px] font-black uppercase tracking-widest">
                    {t.meetingsPage.colCertification}
                  </TableHead>
                  <TableHead className="pr-6 text-right text-[10px] font-black uppercase tracking-widest">
                    {t.meetingsPage.colSubmittedCredential}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {examSubmissions.length > 0 ? (
                  examSubmissions.map((sub) => (
                    <TableRow key={sub.id} className="h-14">
                      <TableCell className="pl-6 font-bold text-xs">{sub.officerName}</TableCell>
                      <TableCell className="text-xs font-semibold text-muted-foreground">
                        {sub.meetingTitle}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs font-bold tabular-nums">
                        {sub.correctCount} / {sub.totalQuestions}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs font-black tabular-nums">
                        {sub.exactScorePct.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase',
                            sub.passed
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          )}
                        >
                          {sub.passed ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {sub.passed ? t.meetingsPage.passedBadge : t.meetingsPage.failedBadge}
                        </span>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {formatDate(sub.submittedAt)}
                          </span>
                          {sub.passed && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setCertificateSub(sub)}
                              className="h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                            >
                              <Award className="h-3 w-3 mr-1" /> {t.meetingsPage.certificateBtn}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                      {t.meetingsPage.emptySubmissionsText}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </section>

      {/* CREATE MEETING + POST-MEETING EXAM BUILDER MODAL */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto rounded-[28px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              {t.meetingsPage.createModalTitle}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t.meetingsPage.createModalDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {t.meetingsPage.meetingTitleLabel}
                </Label>
                <Input
                  placeholder={t.meetingsPage.meetingTitlePlaceholder}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10 rounded-xl text-xs font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {t.meetingsPage.categoryLabel}
                </Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as MeetingSession['category'])}
                >
                  <SelectTrigger className="h-10 rounded-xl text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Protocol Briefing">Protocol Briefing</SelectItem>
                    <SelectItem value="Institution Training">Institution Training</SelectItem>
                    <SelectItem value="Quality Audit">Quality Audit</SelectItem>
                    <SelectItem value="Emergency Sync">Emergency Sync</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {t.meetingsPage.agendaLabel}
              </Label>
              <Input
                placeholder={t.meetingsPage.agendaPlaceholder}
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                className="h-10 rounded-xl text-xs"
              />
            </div>

            {/* Post-Meeting Exam Configuration */}
            <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    {t.meetingsPage.attachExamTitle}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t.meetingsPage.attachExamSub}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={hasExam ? 'default' : 'outline'}
                  onClick={() => setHasExam((prev) => !prev)}
                  className="h-8 rounded-xl text-[10px] font-black uppercase"
                >
                  {hasExam ? t.meetingsPage.examEnabledBtn : t.meetingsPage.noExamText}
                </Button>
              </div>

              {hasExam && (
                <div className="space-y-4 pt-2 border-t border-border">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground">
                        {t.meetingsPage.passingScoreLabel}
                      </Label>
                      <Input
                        type="number"
                        min={10}
                        max={100}
                        value={passingScorePct}
                        onChange={(e) => setPassingScorePct(e.target.value)}
                        className="h-9 rounded-xl text-xs font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground">
                        {t.meetingsPage.timeLimitLabel}
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        value={examDurationMinutes}
                        onChange={(e) => setExamDurationMinutes(e.target.value)}
                        className="h-9 rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {t.meetingsPage.examQuestionsLabel.replace('{count}', String(questions.length))}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setQuestions(DEFAULT_PROTOCOL_QUESTIONS)}
                        className="h-8 rounded-lg text-[10px] font-bold"
                      >
                        <Sparkles className="h-3 w-3 mr-1 text-primary" /> {t.meetingsPage.resetTemplateBtn}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddQuestion}
                        className="h-8 rounded-lg text-[10px] font-bold"
                      >
                        <Plus className="h-3 w-3 mr-1" /> {t.meetingsPage.addQuestionBtn}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                    {questions.map((q, qIdx) => (
                      <div
                        key={q.id}
                        className="p-3.5 rounded-xl bg-background border border-border space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black uppercase text-primary">
                            #{qIdx + 1} ({q.points} pts)
                          </span>
                          {questions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveQuestion(qIdx)}
                              className="text-muted-foreground hover:text-rose-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <Input
                          value={q.question}
                          onChange={(e) =>
                            handleUpdateQuestion(qIdx, { question: e.target.value })
                          }
                          placeholder={t.meetingsPage.questionPlaceholder}
                          className="h-9 text-xs font-bold"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {q.options.map((opt, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-1.5">
                              <input
                                type="radio"
                                name={`correct_${q.id}`}
                                checked={q.correctOptionIndex === optIdx}
                                onChange={() =>
                                  handleUpdateQuestion(qIdx, { correctOptionIndex: optIdx })
                                }
                              />
                              <Input
                                value={opt}
                                onChange={(e) =>
                                  handleUpdateOptionText(qIdx, optIdx, e.target.value)
                                }
                                className="h-8 text-[11px]"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              className="rounded-xl text-xs font-bold"
            >
              {t.meetingsPage.cancelBtn}
            </Button>
            <Button
              type="button"
              disabled={isSavingMeeting}
              onClick={handleCreateMeeting}
              className="rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-black uppercase tracking-wider"
            >
              {isSavingMeeting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Play className="h-4 w-4 mr-1.5" />
              )}
              {t.meetingsPage.launchMeetingBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POST-MEETING EXAM PORTAL & INSTANT SCORECARD MODAL */}
      <Dialog open={!!examMeeting} onOpenChange={(open) => !open && setExamMeeting(null)}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto rounded-[32px]">
          {examMeeting && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-primary" />
                    {t.meetingsPage.assessmentPrefix} {examMeeting.title}
                  </DialogTitle>
                  {!latestSubmissionResult && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-mono font-black">
                      <Clock className="h-3.5 w-3.5" />
                      {Math.floor(examRemainingSec / 60)}:
                      {String(examRemainingSec % 60).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <DialogDescription className="text-xs">
                  {t.meetingsPage.passingReqPrefix} {examMeeting.passingScorePct}% •{' '}
                  {examMeeting.questions.length} {t.meetingsPage.questionsSuffix}
                </DialogDescription>
              </DialogHeader>

              {latestSubmissionResult ? (
                /* Instant Graded Exact-Rate Certificate & Answer Review */
                <div className="space-y-6 py-3">
                  <div
                    className={cn(
                      'p-6 rounded-3xl border text-center space-y-3',
                      latestSubmissionResult.passed
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-rose-500/10 border-rose-500/30'
                    )}
                  >
                    <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center bg-background shadow-md">
                      {latestSubmissionResult.passed ? (
                        <ShieldCheck className="h-8 w-8 text-emerald-500" />
                      ) : (
                        <XCircle className="h-8 w-8 text-rose-500" />
                      )}
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                      {t.meetingsPage.examResultHeader}
                    </p>
                    <h3 className="text-4xl font-black tabular-nums">
                      {latestSubmissionResult.exactScorePct.toFixed(2)}%
                    </h3>
                    <p className="text-xs font-bold">
                      {latestSubmissionResult.correctCount} /{' '}
                      {latestSubmissionResult.totalQuestions} {t.meetingsPage.correctAnswersSuffix} (
                      {latestSubmissionResult.earnedPoints} / {latestSubmissionResult.totalPoints}{' '}
                      pts)
                    </p>
                    <span
                      className={cn(
                        'inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest',
                        latestSubmissionResult.passed
                          ? 'bg-emerald-500 text-white'
                          : 'bg-rose-600 text-white'
                      )}
                    >
                      {latestSubmissionResult.passed
                        ? t.meetingsPage.certifiedPassBadge
                        : `${t.meetingsPage.belowThresholdPrefix} ${examMeeting.passingScorePct}%`}
                    </span>
                  </div>

                  {/* Question-by-Question Review */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {t.meetingsPage.answerReviewTitle}
                    </p>
                    {examMeeting.questions.map((q, idx) => {
                      const chosen = latestSubmissionResult.answers[idx];
                      const isCorrect = chosen === q.correctOptionIndex;
                      return (
                        <div
                          key={q.id}
                          className={cn(
                            'p-4 rounded-2xl border space-y-2 text-xs',
                            isCorrect
                              ? 'bg-emerald-500/5 border-emerald-500/20'
                              : 'bg-rose-500/5 border-rose-500/20'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-black">
                              {idx + 1}. {q.question}
                            </p>
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded text-[9px] font-black uppercase shrink-0',
                                isCorrect
                                  ? 'bg-emerald-500/20 text-emerald-600'
                                  : 'bg-rose-500/20 text-rose-600'
                              )}
                            >
                              {isCorrect ? `+${q.points} pts` : '0 pts'}
                            </span>
                          </div>
                          <p className="text-muted-foreground">
                            {t.meetingsPage.yourAnswerPrefix}{' '}
                            <strong className={isCorrect ? 'text-emerald-600' : 'text-rose-600'}>
                              {chosen >= 0 ? q.options[chosen] : t.meetingsPage.noAnswerSelected}
                            </strong>
                          </p>
                          {!isCorrect && (
                            <p className="text-emerald-600 font-bold">
                              {t.meetingsPage.correctAnswerPrefix} {q.options[q.correctOptionIndex]}
                            </p>
                          )}
                          {q.explanation && (
                            <p className="text-[11px] text-muted-foreground italic">
                              {t.meetingsPage.notePrefix} {q.explanation}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <DialogFooter className="gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSelectedAnswers({});
                        setLatestSubmissionResult(null);
                      }}
                      className="rounded-xl text-xs font-bold"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> {t.meetingsPage.retakeExamBtn}
                    </Button>
                    {latestSubmissionResult.passed && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const sub = latestSubmissionResult;
                          setExamMeeting(null);
                          setCertificateSub(sub);
                        }}
                        className="rounded-xl text-xs font-black uppercase border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                      >
                        <Award className="h-3.5 w-3.5 mr-1.5" /> {t.meetingsPage.viewCertificateBtn}
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => setExamMeeting(null)}
                      className="rounded-xl text-xs font-black uppercase"
                    >
                      {t.meetingsPage.doneBtn}
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                /* Interactive Exam Question Sheet */
                <div className="space-y-5 py-2">
                  {examMeeting.meetingNotes && (
                    <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        {t.meetingsPage.briefingSummaryLabel}
                      </p>
                      <p className="text-xs text-muted-foreground whitespace-pre-line">
                        {examMeeting.meetingNotes}
                      </p>
                    </div>
                  )}

                  <div className="space-y-4">
                    {examMeeting.questions.map((q, qIdx) => (
                      <div
                        key={q.id}
                        className="p-4 rounded-2xl bg-muted/30 border border-border space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                            #{qIdx + 1} / {examMeeting.questions.length}
                          </span>
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {q.points} pts
                          </span>
                        </div>
                        <p className="text-sm font-black text-foreground">{q.question}</p>
                        <div className="grid grid-cols-1 gap-2">
                          {q.options.map((opt, optIdx) => {
                            const isSelected = selectedAnswers[qIdx] === optIdx;
                            return (
                              <button
                                key={optIdx}
                                type="button"
                                onClick={() =>
                                  setSelectedAnswers((prev) => ({ ...prev, [qIdx]: optIdx }))
                                }
                                className={cn(
                                  'w-full text-left p-3 rounded-xl border text-xs font-bold transition-all flex items-center gap-3 cursor-pointer',
                                  isSelected
                                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                    : 'bg-background border-border hover:bg-muted/60 text-foreground'
                                )}
                              >
                                <span
                                  className={cn(
                                    'h-6 w-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0',
                                    isSelected
                                      ? 'bg-white/20 text-white'
                                      : 'bg-muted text-muted-foreground'
                                  )}
                                >
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                <span>{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <DialogFooter className="gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setExamMeeting(null)}
                      className="rounded-xl text-xs font-bold"
                    >
                      {t.meetingsPage.cancelBtn}
                    </Button>
                    <Button
                      type="button"
                      disabled={isSubmittingExam}
                      onClick={handleSubmitExam}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider px-6"
                    >
                      {isSubmittingExam ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      )}
                      {t.meetingsPage.submitAssessmentBtn} ({Object.keys(selectedAnswers).length}/
                      {examMeeting.questions.length})
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* OFFICIAL PRINTABLE & PDF CERTIFICATE MODAL */}
      <Dialog
        open={Boolean(certificateSub)}
        onOpenChange={(open) => !open && setCertificateSub(null)}
      >
        <DialogContent className="sm:max-w-[650px] rounded-[32px] p-0 overflow-hidden">
          {certificateSub && (
            <>
              <DialogHeader className="p-6 pb-3 border-b bg-muted/20">
                <DialogTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                  <Award className="h-5 w-5 text-emerald-500" />
                  {t.meetingsPage.certModalTitle}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {t.meetingsPage.certModalDesc}
                </DialogDescription>
              </DialogHeader>

              <div className="p-6">
                <div className="p-6 sm:p-8 rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-primary/[0.04] via-background to-emerald-500/[0.05] text-center space-y-4 relative overflow-hidden">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
                    <ShieldCheck className="h-3.5 w-3.5" /> {t.meetingsPage.certBureauHeader}
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-foreground">
                      {t.meetingsPage.certMainTitle}
                    </h2>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      {t.meetingsPage.certCertifiesThat}
                    </p>
                  </div>

                  <div className="py-2">
                    <p className="text-2xl sm:text-3xl font-black text-primary uppercase tracking-tight">
                      {certificateSub.officerName}
                    </p>
                    {certificateSub.officerEmail && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {certificateSub.officerEmail}
                      </p>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    {t.meetingsPage.certCompletedText}
                  </p>

                  <p className="text-base font-black text-foreground">
                    &ldquo;{certificateSub.meetingTitle}&rdquo;
                  </p>

                  <div className="inline-flex flex-wrap items-center justify-center gap-3 px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-xs font-black uppercase text-emerald-700 dark:text-emerald-300">
                      {t.meetingsPage.certExactScorePrefix} {certificateSub.exactScorePct.toFixed(2)}%
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-600">
                      ({certificateSub.correctCount} / {certificateSub.totalQuestions} •{' '}
                      {certificateSub.earnedPoints}/{certificateSub.totalPoints} pts)
                    </span>
                  </div>

                  <div className="pt-4 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
                    <span>
                      CERT-
                      {certificateSub.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}
                    </span>
                    <span>
                      {formatDate(certificateSub.submittedAt)}
                    </span>
                    <span className="font-black text-emerald-600 uppercase">{t.meetingsPage.certVerifiedPass}</span>
                  </div>
                </div>
              </div>

              <DialogFooter className="p-6 pt-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.print()}
                  className="rounded-xl text-xs font-bold"
                >
                  <Printer className="h-3.5 w-3.5 mr-1.5" /> {t.meetingsPage.printCertBtn}
                </Button>
                <Button
                  type="button"
                  onClick={() => handleDownloadCertificatePDF(certificateSub)}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" /> {t.meetingsPage.downloadPdfCertBtn}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
