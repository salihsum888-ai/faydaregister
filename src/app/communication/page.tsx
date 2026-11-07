'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import {
  collection,
  query,
  limit,
  serverTimestamp,
  where,
  doc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import {
  setDocumentNonBlocking,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase/non-blocking-updates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Send,
  MessageSquare,
  Loader2,
  Users,
  Plus,
  Search,
  Check,
  CheckCheck,
  Trash2,
  X,
  Pin,
  PinOff,
  ChevronLeft,
  User,
  Shield,
  Copy,
  Reply,
  SquarePen,
  FileDigit,
  Paperclip,
  Building2,
  Settings2,
  UserPlus,
  UserMinus,
  LogOut,
  FileText,
  Download,
  ExternalLink,
  Eye,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Video,
  GraduationCap,
  Radio,
  Mic,
  Square,
  Volume2,
  Clock,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import {
  Message,
  Conversation,
  UserProfile,
  Registration,
  SharedRegistrationPayload,
  CallSession,
  CallParticipantState,
} from '@/lib/types';
import { StatusBadge } from '@/components/dashboard/status-badge';
import {
  LiveCallOverlay,
  formatCallDuration,
} from '@/components/communication/live-call-overlay';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

const getTs = (d: any): number => {
  if (!d) return 0;
  if (typeof d === 'string') return new Date(d).getTime();
  if (d.toDate) return d.toDate().getTime();
  return new Date(d).getTime();
};

const formatDateSeparator = (date: Date): string => {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM dd, yyyy');
};

export default function CommunicationPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [inputText, setInputText] = useState('');
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [channelSearchTerm, setChannelSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'unread' | 'groups' | 'direct'>('all');
  const [personnelSearchTerm, setPersonnelSearchTerm] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'channels' | 'calls' | 'directory'>('channels');
  const [callHistoryFilter, setCallHistoryFilter] = useState<'all' | 'missed' | 'video' | 'voice'>('all');

  // Voice Note recording state
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingAudio, setPendingAudio] = useState<{
    url: string;
    duration: number;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartRef = useRef<number>(0);
  const lastTypingSentRef = useRef<number>(0);
  const [typingTick, setTypingTick] = useState(0);

  // In-conversation search
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [messageSearchTerm, setMessageSearchTerm] = useState('');
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);

  // Reply & Edit state
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  // Attachment & Shared RID state before sending
  const [pendingAttachment, setPendingAttachment] = useState<{
    url: string;
    name: string;
    type: 'image' | 'file';
  } | null>(null);
  const [pendingSharedReg, setPendingSharedReg] = useState<SharedRegistrationPayload | null>(null);
  const [isRidPickerOpen, setIsRidPickerOpen] = useState(false);
  const [ridSearchTerm, setRidSearchTerm] = useState('');
  const [inspectedSharedReg, setInspectedSharedReg] = useState<SharedRegistrationPayload | null>(
    null
  );
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Group / Channel Creation state
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Channel Info / Group Management Modal state
  const [isManageChannelOpen, setIsManageChannelOpen] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDescription, setEditGroupDescription] = useState('');
  const [addMemberSearch, setAddMemberSearch] = useState('');

  // Delete Message Dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [msgToDelete, setMsgToDelete] = useState<Message | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userProfileRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);
  const { data: currentUserProfile } = useDoc<UserProfile>(userProfileRef);

  const isAdmin = currentUserProfile?.role === 'admin';

  const convsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'conversations'), where('members', 'array-contains', user.uid));
  }, [db, user]);

  const { data: rawConversations } = useCollection<Conversation>(convsQuery);

  const usersQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'users'), limit(10000));
  }, [db, user]);

  const { data: allUsers } = useCollection<UserProfile>(usersQuery);

  // Query call log messages across channels for the Call History tab
  const callLogsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, 'messages'), where('isCallLog', '==', true), limit(500));
  }, [db, user]);

  const { data: rawCallLogs } = useCollection<Message>(callLogsQuery);

  // Query registrations so users can share 29-digit RIDs / Institution records in chat
  const registrationsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    if (isAdmin) {
      return query(collection(db, 'registrations'), limit(2000));
    }
    return query(
      collection(db, 'registrations'),
      where('assignedReviewerId', '==', user.uid),
      limit(2000)
    );
  }, [db, user, isAdmin]);

  const { data: availableRegistrations } = useCollection<Registration>(registrationsQuery);

  const filteredRegistrationsForPicker = useMemo(() => {
    if (!availableRegistrations) return [];
    const q = ridSearchTerm.trim().toLowerCase();
    return availableRegistrations
      .filter((r) => {
        if (!q) return true;
        const inst = (r.institutionName || r.schoolName || '').toLowerCase();
        return (
          r.applicantName.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          (r.phone || '').toLowerCase().includes(q) ||
          inst.includes(q)
        );
      })
      .slice(0, 30);
  }, [availableRegistrations, ridSearchTerm]);

  const getConvName = (conv: Conversation | undefined | null) => {
    if (!conv) return '...';
    if (conv.type === 'group') return conv.name || 'Bureau Group';
    const otherId = conv.members?.find((m) => m !== user?.uid);
    if (!otherId) return 'Private Vault';
    const otherUser = allUsers?.find((u) => u.id === otherId);
    return otherUser?.fullName || 'Bureau Official';
  };

  const getOtherUser = (conv: Conversation | undefined | null): UserProfile | undefined => {
    if (!conv || conv.type !== 'dm') return undefined;
    const otherId = conv.members.find((m) => m !== user?.uid);
    return allUsers?.find((u) => u.id === otherId);
  };

  const getOtherUserStatus = (conv: Conversation) => {
    if (conv.type !== 'dm') return null;
    const otherUser = getOtherUser(conv);
    return otherUser?.isDutyActive;
  };

  const isConvUnread = (conv: Conversation): boolean => {
    if (!user?.uid) return false;
    if (conv.id === activeConvId) return false;
    if (conv.lastSenderId && conv.lastSenderId === user.uid) return false;
    const lastMsgTs = getTs(conv.lastTimestamp);
    if (!lastMsgTs) return false;
    const convReadTs = conv.lastReadBy?.[user.uid] ? getTs(conv.lastReadBy[user.uid]) : 0;
    const profileReadTs = currentUserProfile?.lastMessageReadAt
      ? getTs(currentUserProfile.lastMessageReadAt)
      : 0;
    const effectiveReadTs = convReadTs > 0 ? convReadTs : profileReadTs;
    return lastMsgTs > effectiveReadTs;
  };

  const conversations = useMemo(() => {
    if (!rawConversations) return [];
    return [...rawConversations]
      .filter((c) => {
        if (c.isMeetingRoom) return false;
        if (channelSearchTerm) {
          const name = c.type === 'group' ? c.name || '' : getConvName(c);
          const matchesName = name.toLowerCase().includes(channelSearchTerm.toLowerCase());
          const matchesLast = (c.lastMessage || '')
            .toLowerCase()
            .includes(channelSearchTerm.toLowerCase());
          if (!matchesName && !matchesLast) return false;
        }
        if (channelFilter === 'unread' && !isConvUnread(c)) return false;
        if (channelFilter === 'groups' && c.type !== 'group') return false;
        if (channelFilter === 'direct' && c.type !== 'dm') return false;
        return true;
      })
      .sort((a, b) => {
        const timeA = getTs(a.lastTimestamp);
        const timeB = getTs(b.lastTimestamp);
        return timeB - timeA;
      });
  }, [rawConversations, channelSearchTerm, channelFilter, allUsers, activeConvId, user?.uid]);

  const totalUnreadChannels = useMemo(() => {
    if (!rawConversations) return 0;
    return rawConversations.filter((c) => isConvUnread(c)).length;
  }, [rawConversations, activeConvId, user?.uid, currentUserProfile?.lastMessageReadAt]);

  // Call History logs filtered to user's conversations
  const callHistoryItems = useMemo(() => {
    if (!rawCallLogs || !rawConversations || !user) return [];
    const myConvMap = new Map<string, Conversation>();
    rawConversations.forEach((c) => {
      if (!c.isMeetingRoom) myConvMap.set(c.id, c);
    });

    return rawCallLogs
      .filter((m) => {
        const conv = myConvMap.get(m.conversationId);
        if (!conv) return false;
        const data = m.callLogData;
        if (!data) return false;
        if (callHistoryFilter === 'missed' && data.event !== 'missed' && data.event !== 'declined') {
          return false;
        }
        if (callHistoryFilter === 'video' && data.callType !== 'video') return false;
        if (callHistoryFilter === 'voice' && data.callType !== 'voice') return false;
        if (channelSearchTerm.trim()) {
          const q = channelSearchTerm.toLowerCase();
          const cName = getConvName(conv).toLowerCase();
          const sName = (m.senderName || '').toLowerCase();
          if (!cName.includes(q) && !sName.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => getTs(b.timestamp) - getTs(a.timestamp));
  }, [rawCallLogs, rawConversations, user, callHistoryFilter, channelSearchTerm, allUsers]);

  const missedCallsCount = useMemo(() => {
    if (!rawCallLogs || !rawConversations || !user) return 0;
    const myConvIds = new Set(rawConversations.filter((c) => !c.isMeetingRoom).map((c) => c.id));
    return rawCallLogs.filter(
      (m) =>
        myConvIds.has(m.conversationId) &&
        m.senderId !== user.uid &&
        (m.callLogData?.event === 'missed' || m.callLogData?.event === 'declined')
    ).length;
  }, [rawCallLogs, rawConversations, user]);

  const directorySections = useMemo(() => {
    if (!allUsers || !user) return { command: [], units: [] };

    const filtered = allUsers.filter(
      (u) =>
        u.id !== user.uid &&
        ((u.fullName || '').toLowerCase().includes(personnelSearchTerm.toLowerCase()) ||
          (u.email || '').toLowerCase().includes(personnelSearchTerm.toLowerCase()) ||
          (u.region || '').toLowerCase().includes(personnelSearchTerm.toLowerCase()))
    );

    return {
      command: filtered.filter((u) => u.role === 'admin'),
      units: filtered.filter((u) => u.role !== 'admin'),
    };
  }, [allUsers, personnelSearchTerm, user]);

  const messagesQuery = useMemoFirebase(() => {
    if (!db || !activeConvId || !user) return null;
    return query(
      collection(db, 'messages'),
      where('conversationId', '==', activeConvId),
      limit(10000)
    );
  }, [db, activeConvId, user]);

  const { data: rawMessages, isLoading: isMessagesLoading } = useCollection<Message>(messagesQuery);

  const messages = useMemo(() => {
    if (!rawMessages || !user) return [];
    return [...rawMessages].sort((a, b) => getTs(a.timestamp) - getTs(b.timestamp));
  }, [rawMessages, user]);

  const filteredMessages = useMemo(() => {
    if (!messages || !user) return [];
    const visible = messages.filter((m) => !m.deletedFor?.includes(user.uid));
    if (!messageSearchTerm.trim()) return visible;
    const q = messageSearchTerm.toLowerCase();
    return visible.filter(
      (m) =>
        (m.text || '').toLowerCase().includes(q) ||
        (m.senderName || '').toLowerCase().includes(q) ||
        (m.sharedRegistration?.id || '').toLowerCase().includes(q) ||
        (m.sharedRegistration?.applicantName || '').toLowerCase().includes(q) ||
        (m.sharedRegistration?.institutionName || '').toLowerCase().includes(q)
    );
  }, [messages, user, messageSearchTerm]);

  const activeConv = useMemo(
    () => rawConversations?.find((c) => c.id === activeConvId),
    [rawConversations, activeConvId]
  );

  // Periodic tick to expire stale typing indicators cleanly
  useEffect(() => {
    const iv = setInterval(() => {
      setTypingTick((t) => t + 1);
    }, 2500);
    return () => clearInterval(iv);
  }, []);

  // Compute who is currently typing in activeConv (within last 6 seconds)
  const activeTypingNames = useMemo(() => {
    void typingTick;
    if (!activeConv?.typingBy || !user?.uid) return [] as string[];
    const now = Date.now();
    const names: string[] = [];
    Object.entries(activeConv.typingBy).forEach(([uid, tsIso]) => {
      if (uid === user.uid || !tsIso) return;
      const diff = now - getTs(tsIso);
      if (diff >= 0 && diff < 6500) {
        const u = allUsers?.find((usr) => usr.id === uid);
        names.push(u?.fullName || 'Official');
      }
    });
    return names;
  }, [activeConv?.typingBy, user?.uid, allUsers, typingTick]);

  // Auto-select most recent conversation on desktop so chats are immediately visible
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth >= 1024 && !activeConvId && conversations.length > 0) {
      setActiveConvId(conversations[0].id);
    }
  }, [conversations, activeConvId]);

  // Sync per-conversation & user read timestamps whenever active conversation changes or new messages arrive
  useEffect(() => {
    if (!db || !user?.uid) return;
    const nowIso = new Date().toISOString();
    updateDocumentNonBlocking(doc(db, 'users', user.uid), {
      lastMessageReadAt: nowIso,
    });
    if (activeConvId) {
      updateDocumentNonBlocking(doc(db, 'conversations', activeConvId), {
        [`lastReadBy.${user.uid}`]: nowIso,
      });
    }
  }, [db, user?.uid, activeConvId, rawMessages?.length]);

  // Reset composer helpers when switching channels
  useEffect(() => {
    setReplyingTo(null);
    setEditingMessage(null);
    setPendingAttachment(null);
    setPendingSharedReg(null);
    setPendingAudio(null);
    setIsMessageSearchOpen(false);
    setMessageSearchTerm('');
  }, [activeConvId]);

  useEffect(() => {
    if (scrollRef.current && !messageSearchTerm) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  }, [filteredMessages.length, activeConvId, messageSearchTerm]);

  const scrollToMessage = (msgId: string) => {
    const el = document.getElementById(`chat-msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      setTimeout(() => setHighlightedMsgId((prev) => (prev === msgId ? null : prev)), 2200);
    }
  };

  // Check if an outgoing message has been seen by at least one other member in the conversation
  const getMessageSeenInfo = (msg: Message) => {
    if (!activeConv || !user?.uid || msg.senderId !== user.uid) {
      return { isSeen: false, seenByNames: [] as string[] };
    }
    const msgTime = getTs(msg.timestamp);
    if (!msgTime) return { isSeen: false, seenByNames: [] as string[] };
    const otherMemberIds = (activeConv.members || []).filter((id) => id !== user.uid);
    const seenByNames: string[] = [];

    otherMemberIds.forEach((memberId) => {
      const readAt = activeConv.lastReadBy?.[memberId];
      if (readAt && getTs(readAt) >= msgTime) {
        const u = allUsers?.find((usr) => usr.id === memberId);
        seenByNames.push(u?.fullName || 'Official');
      }
    });

    return {
      isSeen: seenByNames.length > 0,
      seenByNames,
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 700 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Attachment Too Large',
        description: 'Please select an image or document under 700 KB for instant transmission.',
      });
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const isImg = file.type.startsWith('image/');
      setPendingAttachment({
        url: result,
        name: file.name,
        type: isImg ? 'image' : 'file',
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Voice Note Recording Handlers
  const handleStartVoiceRecording = async () => {
    if (isRecordingAudio) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast({
        variant: 'destructive',
        title: 'Microphone Unavailable',
        description: 'Your browser does not support voice recording in this context.',
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordingStartRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecordingAudio(true);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.start(250);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.max(1, Math.floor((Date.now() - recordingStartRef.current) / 1000));
        setRecordingSeconds(elapsed);
      }, 500);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Microphone Permission Required',
        description: 'Please allow microphone access to record a voice note.',
      });
    }
  };

  const handleStopVoiceRecording = (cancel = false) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    const duration = Math.max(1, Math.floor((Date.now() - recordingStartRef.current) / 1000));
    setIsRecordingAudio(false);
    setRecordingSeconds(0);

    if (!recorder) return;

    recorder.onstop = () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      if (cancel || audioChunksRef.current.length === 0) {
        audioChunksRef.current = [];
        return;
      }
      const mimeType = recorder.mimeType || 'audio/webm';
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      audioChunksRef.current = [];
      if (blob.size > 750 * 1024) {
        toast({
          variant: 'destructive',
          title: 'Voice Note Too Long',
          description: 'Please keep voice notes under 60 seconds for instant delivery.',
        });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result as string;
        setPendingAudio({
          url: base64Audio,
          duration,
        });
      };
      reader.readAsDataURL(blob);
    };

    try {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    } catch {
      recorder.stream.getTracks().forEach((t) => t.stop());
    }
  };

  const handleInputTyping = (val: string) => {
    setInputText(val);
    if (!db || !user?.uid || !activeConvId) return;
    const now = Date.now();
    if (val.trim() && now - lastTypingSentRef.current > 2800) {
      lastTypingSentRef.current = now;
      updateDocumentNonBlocking(doc(db, 'conversations', activeConvId), {
        [`typingBy.${user.uid}`]: new Date(now).toISOString(),
      });
    }
  };

  const handleStartEditMessage = (msg: Message) => {
    setReplyingTo(null);
    setEditingMessage(msg);
    setInputText(msg.text || '');
  };

  const handleStartReplyMessage = (msg: Message) => {
    setEditingMessage(null);
    setReplyingTo(msg);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db || !activeConvId) return;

    const trimmed = inputText.trim();
    if (!trimmed && !pendingAttachment && !pendingSharedReg && !pendingAudio) return;

    const senderFullName =
      currentUserProfile?.fullName || user.email?.split('@')[0] || 'Official';
    const nowIso = new Date().toISOString();

    // Handle editing an existing message
    if (editingMessage) {
      updateDocumentNonBlocking(doc(db, 'messages', editingMessage.id), {
        text: trimmed,
        isEdited: true,
        updatedAt: serverTimestamp(),
      });
      toast({
        title: 'Transmission Updated',
        description: 'Your message has been edited.',
      });
      setEditingMessage(null);
      setInputText('');
      return;
    }

    const messageData: Record<string, any> = {
      conversationId: activeConvId,
      text:
        trimmed ||
        (pendingAudio
          ? `🎙️ Voice Note (${formatCallDuration(pendingAudio.duration)})`
          : pendingSharedReg
          ? `Shared Registration Record: ${pendingSharedReg.applicantName} (${pendingSharedReg.id})`
          : pendingAttachment
          ? `Attached: ${pendingAttachment.name}`
          : ''),
      senderId: user.uid,
      senderName: senderFullName,
      senderEmail: user.email || '',
      timestamp: serverTimestamp(),
      deletedFor: [],
    };

    if (replyingTo) {
      messageData.replyToId = replyingTo.id;
      messageData.replyToSenderName = replyingTo.senderName;
      messageData.replyToText =
        replyingTo.text ||
        (replyingTo.sharedRegistration
          ? `RID: ${replyingTo.sharedRegistration.applicantName}`
          : 'Attachment');
    }

    if (pendingAttachment) {
      messageData.attachmentUrl = pendingAttachment.url;
      messageData.attachmentName = pendingAttachment.name;
      messageData.attachmentType = pendingAttachment.type;
    }

    if (pendingSharedReg) {
      messageData.sharedRegistration = pendingSharedReg;
    }

    if (pendingAudio) {
      messageData.audioUrl = pendingAudio.url;
      messageData.audioDurationSeconds = pendingAudio.duration;
    }

    const msgRef = doc(collection(db, 'messages'));
    setDocumentNonBlocking(msgRef, messageData, { merge: true });

    const previewSummary =
      trimmed ||
      (pendingAudio
        ? `🎙️ Voice Note (${formatCallDuration(pendingAudio.duration)})`
        : pendingSharedReg
        ? `[RID] ${pendingSharedReg.applicantName}`
        : pendingAttachment
        ? `[Attachment] ${pendingAttachment.name}`
        : 'New transmission');

    updateDocumentNonBlocking(doc(db, 'conversations', activeConvId), {
      lastMessage: previewSummary,
      lastTimestamp: serverTimestamp(),
      lastSenderId: user.uid,
      lastSenderName: senderFullName,
      [`lastReadBy.${user.uid}`]: nowIso,
      [`typingBy.${user.uid}`]: '',
    });

    // If current sender is Admin, also push a personal notification doc to recipient(s)
    if (isAdmin && activeConv?.members) {
      const otherMembers = activeConv.members.filter((m) => m !== user.uid);
      otherMembers.forEach((recipientId) => {
        const notifRef = doc(collection(db, 'users', recipientId, 'notifications'));
        setDocumentNonBlocking(
          notifRef,
          {
            title:
              activeConv.type === 'group'
                ? `${senderFullName} in ${activeConv.name || 'Group'}`
                : `Direct Message from ${senderFullName}`,
            message: previewSummary,
            type: 'info',
            isRead: false,
            createdAt: nowIso,
          },
          { merge: true }
        );
      });
    }

    setInputText('');
    setReplyingTo(null);
    setPendingAttachment(null);
    setPendingSharedReg(null);
    setPendingAudio(null);
  };

  const handleOpenDirectMessage = async (otherId: string) => {
    if (!db || !user) return;

    const existingDm = rawConversations?.find(
      (c) => c.type === 'dm' && c.members.includes(user.uid) && c.members.includes(otherId)
    );

    if (existingDm) {
      setActiveConvId(existingDm.id);
      setSidebarTab('channels');
      return;
    }

    setIsCreating(true);
    try {
      const newDmRef = doc(collection(db, 'conversations'));
      const nowIso = new Date().toISOString();
      const dmData = {
        type: 'dm',
        members: [user.uid, otherId],
        lastMessage: 'Secure link established.',
        lastTimestamp: serverTimestamp(),
        lastSenderId: user.uid,
        lastSenderName: currentUserProfile?.fullName || 'Official',
        lastReadBy: { [user.uid]: nowIso },
        createdBy: user.uid,
      };
      await setDocumentNonBlocking(newDmRef, dmData, { merge: true });
      setActiveConvId(newDmRef.id);
      setSidebarTab('channels');
      toast({
        title: 'Secure Link Established',
        description: 'Direct communication path initialized.',
      });
    } catch {
      toast({
        title: 'Handshake Failed',
        description: 'Could not initialize channel.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateConversation = async () => {
    if (!db || !user || selectedUserIds.length === 0) return;

    setIsCreating(true);
    try {
      if (selectedUserIds.length === 1) {
        await handleOpenDirectMessage(selectedUserIds[0]);
      } else {
        const newGroupRef = doc(collection(db, 'conversations'));
        const nowIso = new Date().toISOString();
        const groupData = {
          type: 'group',
          name: newGroupName.trim() || 'Tactical Coordination Group',
          description: newGroupDescription.trim() || 'Bureau Operational Coordination Channel',
          members: [user.uid, ...selectedUserIds],
          lastMessage: 'Tactical group initialized.',
          lastTimestamp: serverTimestamp(),
          lastSenderId: user.uid,
          lastSenderName: currentUserProfile?.fullName || 'Official',
          lastReadBy: { [user.uid]: nowIso },
          createdBy: user.uid,
        };
        await setDocumentNonBlocking(newGroupRef, groupData, { merge: true });
        setActiveConvId(newGroupRef.id);
        toast({
          title: 'Group Assembled',
          description: `"${groupData.name}" is now online.`,
        });
      }

      setIsCreateGroupOpen(false);
      setSelectedUserIds([]);
      setNewGroupName('');
      setNewGroupDescription('');
      setPersonnelSearchTerm('');
    } catch {
      toast({
        title: 'Handshake Failed',
        description: 'Could not initialize channel.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const openManageChannelModal = () => {
    if (!activeConv) return;
    setEditGroupName(activeConv.name || '');
    setEditGroupDescription(activeConv.description || '');
    setAddMemberSearch('');
    setIsManageChannelOpen(true);
  };

  const handleSaveGroupDetails = () => {
    if (!db || !activeConv || activeConv.type !== 'group') return;
    updateDocumentNonBlocking(doc(db, 'conversations', activeConv.id), {
      name: editGroupName.trim() || 'Tactical Coordination Group',
      description: editGroupDescription.trim(),
    });
    toast({
      title: 'Channel Updated',
      description: 'Group designation and details saved.',
    });
  };

  const handleAddMemberToGroup = (memberId: string, memberName: string) => {
    if (!db || !activeConv || activeConv.type !== 'group') return;
    updateDocumentNonBlocking(doc(db, 'conversations', activeConv.id), {
      members: arrayUnion(memberId),
      lastMessage: `${memberName} added to group.`,
      lastTimestamp: serverTimestamp(),
    });
    toast({
      title: 'Personnel Added',
      description: `${memberName} has been added to ${activeConv.name || 'the group'}.`,
    });
  };

  const handleRemoveMemberFromGroup = (memberId: string, memberName: string) => {
    if (!db || !activeConv || activeConv.type !== 'group') return;
    updateDocumentNonBlocking(doc(db, 'conversations', activeConv.id), {
      members: arrayRemove(memberId),
    });
    toast({
      variant: 'destructive',
      title: 'Personnel Removed',
      description: `${memberName} was removed from the group.`,
    });
  };

  const handleLeaveGroup = () => {
    if (!db || !user || !activeConv || activeConv.type !== 'group') return;
    updateDocumentNonBlocking(doc(db, 'conversations', activeConv.id), {
      members: arrayRemove(user.uid),
    });
    setIsManageChannelOpen(false);
    setActiveConvId(null);
    toast({
      title: 'Left Channel',
      description: `You have exited ${activeConv.name || 'the group'}.`,
    });
  };

  const handleDeleteConversation = () => {
    if (!db || !activeConv || !isAdmin) return;
    deleteDocumentNonBlocking(doc(db, 'conversations', activeConv.id));
    setIsManageChannelOpen(false);
    setActiveConvId(null);
    toast({
      variant: 'destructive',
      title: 'Channel Deleted',
      description: 'The communication channel was permanently removed.',
    });
  };

  const pinnedMessage = messages.find((m) => m.id === activeConv?.pinnedMessageId);

  const handleTogglePin = (msg: Message) => {
    if (!db || !activeConvId || !activeConv) return;
    const isCurrentlyPinned = activeConv.pinnedMessageId === msg.id;
    updateDocumentNonBlocking(doc(db, 'conversations', activeConvId), {
      pinnedMessageId: isCurrentlyPinned ? '' : msg.id,
    });
    toast({
      title: isCurrentlyPinned ? 'Intelligence Unpinned' : 'Intelligence Pinned',
      description: isCurrentlyPinned
        ? 'Removed message from channel header.'
        : 'Message pinned to channel header.',
    });
  };

  const handleCopyText = (text: string, label = 'Transmission') => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: `${label} copied to clipboard.` });
  };

  const handleConfirmDeleteMessage = () => {
    if (!db || !user || !msgToDelete) return;
    if (msgToDelete.senderId === user.uid || isAdmin) {
      deleteDocumentNonBlocking(doc(db, 'messages', msgToDelete.id));
    } else {
      updateDocumentNonBlocking(doc(db, 'messages', msgToDelete.id), {
        deletedFor: arrayUnion(user.uid),
      });
    }
    toast({
      title: 'Transmission Purged',
      description: 'Message removed from viewport.',
      variant: 'destructive',
    });
    setIsDeleteDialogOpen(false);
    setMsgToDelete(null);
  };

  // Voice & Video Call Handlers
  const postCallLogMessage = (
    convId: string,
    callType: 'voice' | 'video',
    event: 'started' | 'ended' | 'missed' | 'declined',
    durationSeconds?: number
  ) => {
    if (!db || !user) return;
    const senderFullName =
      currentUserProfile?.fullName || user.email?.split('@')[0] || 'Official';
    const label = callType === 'video' ? 'Video Call' : 'Voice Call';
    const summaryText =
      event === 'started'
        ? `📞 ${senderFullName} started a ${label}.`
        : event === 'ended'
        ? `📴 ${label} ended • Duration ${formatCallDuration(durationSeconds || 0)}`
        : event === 'declined'
        ? `📵 ${label} was declined.`
        : `Missed ${label}`;

    const msgRef = doc(collection(db, 'messages'));
    setDocumentNonBlocking(
      msgRef,
      {
        conversationId: convId,
        text: summaryText,
        senderId: user.uid,
        senderName: senderFullName,
        senderEmail: user.email || '',
        timestamp: serverTimestamp(),
        deletedFor: [],
        isCallLog: true,
        callLogData: {
          callType,
          event,
          durationSeconds: durationSeconds || 0,
        },
      },
      { merge: true }
    );

    updateDocumentNonBlocking(doc(db, 'conversations', convId), {
      lastMessage: summaryText,
      lastTimestamp: serverTimestamp(),
      lastSenderId: user.uid,
      lastSenderName: senderFullName,
    });
  };

  const handleStartCall = (callType: 'voice' | 'video') => {
    if (!db || !user || !activeConv) return;

    const senderFullName =
      currentUserProfile?.fullName || user.email?.split('@')[0] || 'Official';
    const nowIso = new Date().toISOString();

    // If there is already a live/ringing call on this conversation, join it instead of overwriting
    if (
      activeConv.activeCall &&
      (activeConv.activeCall.status === 'ringing' || activeConv.activeCall.status === 'active')
    ) {
      handleAcceptIncomingCall(activeConv, callType === 'video');
      return;
    }

    const callId = `call_${Date.now()}`;
    const myParticipant: CallParticipantState = {
      uid: user.uid,
      name: senderFullName,
      role: currentUserProfile?.role || 'Official',
      photoUrl: currentUserProfile?.profilePhoto || '',
      isMuted: false,
      isCameraOn: callType === 'video',
      isScreenSharing: false,
      joinedAt: nowIso,
    };

    const newCall: CallSession = {
      id: callId,
      conversationId: activeConv.id,
      conversationName: getConvName(activeConv),
      conversationType: activeConv.type,
      callType,
      status: 'ringing',
      callerId: user.uid,
      callerName: senderFullName,
      targetMemberIds: activeConv.members || [user.uid],
      activeParticipantIds: [user.uid],
      participants: {
        [user.uid]: myParticipant,
      },
      startedAt: nowIso,
    };

    updateDocumentNonBlocking(doc(db, 'conversations', activeConv.id), {
      activeCall: newCall,
    });

    postCallLogMessage(activeConv.id, callType, 'started');

    toast({
      title: `${callType === 'video' ? 'Video' : 'Voice'} Call Initialized`,
      description: `Ringing ${getConvName(activeConv)}...`,
    });
  };

  const handleAcceptIncomingCall = (conv: Conversation, withVideo: boolean) => {
    if (!db || !user || !conv.activeCall) return;
    const senderFullName =
      currentUserProfile?.fullName || user.email?.split('@')[0] || 'Official';
    const nowIso = new Date().toISOString();
    const call = conv.activeCall;

    const nextActiveIds = Array.from(new Set([...(call.activeParticipantIds || []), user.uid]));
    const myParticipant: CallParticipantState = {
      uid: user.uid,
      name: senderFullName,
      role: currentUserProfile?.role || 'Official',
      photoUrl: currentUserProfile?.profilePhoto || '',
      isMuted: false,
      isCameraOn: withVideo,
      isScreenSharing: false,
      joinedAt: nowIso,
    };

    setActiveConvId(conv.id);
    updateDocumentNonBlocking(doc(db, 'conversations', conv.id), {
      'activeCall.status': 'active',
      'activeCall.connectedAt': call.connectedAt || nowIso,
      'activeCall.activeParticipantIds': nextActiveIds,
      [`activeCall.participants.${user.uid}`]: myParticipant,
    });
  };

  const handleDeclineIncomingCall = (conv: Conversation) => {
    if (!db || !user || !conv.activeCall) return;
    const call = conv.activeCall;
    if (conv.type === 'dm') {
      updateDocumentNonBlocking(doc(db, 'conversations', conv.id), {
        'activeCall.status': 'declined',
        'activeCall.endedAt': new Date().toISOString(),
        'activeCall.endedBy': user.uid,
      });
      postCallLogMessage(conv.id, call.callType, 'declined');
    }
  };

  const handleUpdateParticipantState = (
    convId: string,
    call: CallSession,
    updates: Partial<CallParticipantState>,
    extraCallUpdates?: Partial<CallSession>
  ) => {
    if (!db || !user) return;
    const existingMe = call.participants?.[user.uid] || {
      uid: user.uid,
      name: currentUserProfile?.fullName || 'Official',
      role: currentUserProfile?.role || 'Official',
      photoUrl: currentUserProfile?.profilePhoto || '',
      isMuted: false,
      isCameraOn: call.callType === 'video',
      isScreenSharing: false,
      joinedAt: new Date().toISOString(),
    };

    const dotUpdates: Record<string, any> = {};

    if (Object.keys(updates).length > 0) {
      dotUpdates[`activeCall.participants.${user.uid}`] = {
        ...existingMe,
        ...updates,
      };
    }

    if (extraCallUpdates) {
      Object.entries(extraCallUpdates).forEach(([key, val]) => {
        if (val !== undefined) {
          dotUpdates[`activeCall.${key}`] = val;
        }
      });
    }

    if (Object.keys(dotUpdates).length > 0) {
      updateDocumentNonBlocking(doc(db, 'conversations', convId), dotUpdates);
    }
  };

  const handleEndOrLeaveCall = (
    conv: Conversation,
    durationSeconds: number,
    reason: 'ended' | 'missed' = 'ended'
  ) => {
    if (!db || !user || !conv.activeCall) return;
    const call = conv.activeCall;
    const remainingIds = (call.activeParticipantIds || []).filter((id) => id !== user.uid);

    if (conv.type === 'dm' || remainingIds.length === 0) {
      updateDocumentNonBlocking(doc(db, 'conversations', conv.id), {
        activeCall: {
          ...call,
          status: 'ended',
          activeParticipantIds: [],
          screenSharerId: '',
          screenSharerName: '',
          endedAt: new Date().toISOString(),
          endedBy: user.uid,
        },
      });
      postCallLogMessage(conv.id, call.callType, reason, durationSeconds);
      toast({
        title: reason === 'missed' ? 'Call Unanswered' : 'Call Ended',
        description:
          reason === 'missed'
            ? 'Recipient did not answer the call.'
            : `Call duration: ${formatCallDuration(durationSeconds)}`,
      });
    } else {
      const nextParticipants = { ...(call.participants || {}) };
      delete nextParticipants[user.uid];
      updateDocumentNonBlocking(doc(db, 'conversations', conv.id), {
        activeCall: {
          ...call,
          activeParticipantIds: remainingIds,
          participants: nextParticipants,
          screenSharerId: call.screenSharerId === user.uid ? '' : call.screenSharerId,
          screenSharerName: call.screenSharerId === user.uid ? '' : call.screenSharerName,
        },
      });
      toast({
        title: 'Left Group Call',
        description: 'You have disconnected from the group call.',
      });
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto h-[calc(100dvh-5.5rem)] lg:h-[calc(100dvh-6rem)] min-h-[520px] pb-20 lg:pb-2 flex flex-col gap-3 sm:gap-4 animate-in fade-in duration-700">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 sm:px-2 shrink-0">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-foreground font-headline uppercase leading-none truncate">
              Coordination Portal
            </h1>
            {totalUnreadChannels > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-[#FF6B4A] text-white shadow-sm shrink-0">
                {totalUnreadChannels} Unread
              </span>
            )}
          </div>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-widest font-black mt-0.5 hidden sm:block">
            Authorized Tactical Link • Direct & Group Channels
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push('/meetings')}
            className="rounded-full px-3 sm:px-4 h-8 sm:h-9 md:h-10 font-black text-[9px] sm:text-[10px] uppercase tracking-widest border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
          >
            <GraduationCap className="mr-1 sm:mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>Meetings & Exams</span>
          </Button>

          <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-3 sm:px-5 h-8 sm:h-9 md:h-10 font-black text-[9px] sm:text-[10px] uppercase tracking-widest shadow-xl shadow-primary/10"
              >
                <Plus className="mr-1 sm:mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>New Chat</span>
              </Button>
            </DialogTrigger>
          <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[460px] p-0 overflow-hidden rounded-[32px] border-none shadow-2xl bg-popover max-h-[90vh] flex flex-col">
            <DialogHeader className="p-6 border-b bg-muted/30">
              <DialogTitle className="text-lg font-black text-foreground uppercase tracking-tight">
                Initialize Tactical Link
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Select 1 official for a Direct Message or multiple officials to assemble a Group channel.
              </DialogDescription>
            </DialogHeader>
            <div className="p-6 space-y-5 flex-1 overflow-hidden flex flex-col">
              {selectedUserIds.length > 1 && (
                <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">
                      Group Designation
                    </Label>
                    <Input
                      placeholder="e.g. Sector A Response Team"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="h-10 rounded-xl bg-background border-border font-bold text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">
                      Channel Purpose (Optional)
                    </Label>
                    <Input
                      placeholder="e.g. Daily registration & institution verification sync"
                      value={newGroupDescription}
                      onChange={(e) => setNewGroupDescription(e.target.value)}
                      className="h-9 rounded-xl bg-background border-border text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">
                    Select Personnel
                  </Label>
                  <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {selectedUserIds.length} Selected
                  </span>
                </div>

                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                  <Input
                    placeholder="Search name, role, or region..."
                    className="pl-9 h-10 text-xs bg-muted/20 border-border rounded-xl font-medium"
                    value={personnelSearchTerm}
                    onChange={(e) => setPersonnelSearchTerm(e.target.value)}
                  />
                </div>

                <ScrollArea className="flex-1 border border-border rounded-2xl bg-muted/10 p-2 max-h-[260px]">
                  <div className="space-y-1">
                    {allUsers &&
                    user &&
                    allUsers.filter(
                      (u) =>
                        u.id !== user.uid &&
                        ((u.fullName || '')
                          .toLowerCase()
                          .includes(personnelSearchTerm.toLowerCase()) ||
                          (u.email || '')
                            .toLowerCase()
                            .includes(personnelSearchTerm.toLowerCase()) ||
                          (u.region || '')
                            .toLowerCase()
                            .includes(personnelSearchTerm.toLowerCase()))
                    ).length > 0 ? (
                      allUsers
                        .filter(
                          (u) =>
                            u.id !== user.uid &&
                            ((u.fullName || '')
                              .toLowerCase()
                              .includes(personnelSearchTerm.toLowerCase()) ||
                              (u.email || '')
                                .toLowerCase()
                                .includes(personnelSearchTerm.toLowerCase()) ||
                              (u.region || '')
                                .toLowerCase()
                                .includes(personnelSearchTerm.toLowerCase()))
                        )
                        .map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center justify-between p-2.5 hover:bg-background rounded-xl transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9 border border-border/50 shadow-sm">
                                <AvatarImage src={u.profilePhoto} />
                                <AvatarFallback
                                  className={cn(
                                    'text-[10px] font-black',
                                    u.role === 'admin'
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted'
                                  )}
                                >
                                  {(u.fullName || 'OF').substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-foreground uppercase tracking-tight flex items-center gap-1.5">
                                  {u.fullName}
                                  {u.role === 'admin' && (
                                    <Shield className="h-2.5 w-2.5 text-primary" />
                                  )}
                                </p>
                                <p className="text-[9px] text-muted-foreground font-bold uppercase truncate max-w-[180px]">
                                  {u.role} • {u.region || 'HQ'}
                                </p>
                              </div>
                            </div>
                            <Checkbox
                              checked={selectedUserIds.includes(u.id)}
                              onCheckedChange={(c) =>
                                setSelectedUserIds((prev) =>
                                  c ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                                )
                              }
                              className="rounded-full h-5 w-5"
                            />
                          </div>
                        ))
                    ) : (
                      <div className="py-14 text-center opacity-30">
                        <Search className="h-8 w-8 mx-auto mb-2" />
                        <p className="text-[10px] font-black uppercase tracking-widest">
                          No matching personnel
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
            <DialogFooter className="p-6 bg-muted/30 border-t">
              <Button
                onClick={handleCreateConversation}
                disabled={selectedUserIds.length === 0 || isCreating}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/10 transition-all active:scale-[0.98]"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : selectedUserIds.length > 1 ? (
                  `Create Group (${selectedUserIds.length + 1} Members)`
                ) : (
                  'Open Direct Channel'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Main Split View */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 sm:gap-4 overflow-hidden relative min-h-0">
        {/* Left Sidebar */}
        <Card
          className={cn(
            'w-full lg:w-[340px] xl:w-[360px] shrink-0 min-h-0 flex flex-col border-border shadow-sm bg-card overflow-hidden rounded-3xl transition-all duration-300',
            activeConvId ? 'hidden lg:flex' : 'flex flex-1 lg:flex-initial'
          )}
        >
          <div className="p-4 border-b border-border bg-muted/10 space-y-3">
            <Tabs
              value={sidebarTab}
              onValueChange={(v: any) => setSidebarTab(v)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-3 w-full h-10 p-1 rounded-2xl">
                <TabsTrigger
                  value="channels"
                  className="text-[10px] font-black uppercase tracking-wider rounded-xl flex items-center gap-1"
                >
                  <span>Channels</span>
                  {totalUnreadChannels > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[#FF6B4A] text-white text-[9px] font-black">
                      {totalUnreadChannels}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="calls"
                  className="text-[10px] font-black uppercase tracking-wider rounded-xl flex items-center gap-1"
                >
                  <span>Calls</span>
                  {missedCallsCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black">
                      {missedCallsCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="directory"
                  className="text-[10px] font-black uppercase tracking-wider rounded-xl"
                >
                  Staff ({allUsers ? Math.max(0, allUsers.length - 1) : 0})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder={
                  sidebarTab === 'channels'
                    ? 'Search channels or messages...'
                    : sidebarTab === 'calls'
                    ? 'Search call history...'
                    : 'Search personnel...'
                }
                className="pl-9 h-10 text-xs bg-background border-border rounded-xl font-semibold"
                value={sidebarTab === 'directory' ? personnelSearchTerm : channelSearchTerm}
                onChange={(e) =>
                  sidebarTab === 'directory'
                    ? setPersonnelSearchTerm(e.target.value)
                    : setChannelSearchTerm(e.target.value)
                }
              />
            </div>

            {sidebarTab === 'channels' && (
              <div className="flex items-center gap-1 pt-0.5">
                {(['all', 'unread', 'groups', 'direct'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setChannelFilter(tab)}
                    className={cn(
                      'flex-1 py-1 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer',
                      channelFilter === tab
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}

            {sidebarTab === 'calls' && (
              <div className="flex items-center gap-1 pt-0.5">
                {(['all', 'missed', 'video', 'voice'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCallHistoryFilter(tab)}
                    className={cn(
                      'flex-1 py-1 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer',
                      callHistoryFilter === tab
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/60'
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3">
              {sidebarTab === 'channels' ? (
                <div className="space-y-1">
                  {conversations.length > 0 ? (
                    conversations.map((conv) => {
                      const isActive = getOtherUserStatus(conv);
                      const isSelected = activeConvId === conv.id;
                      const unread = isConvUnread(conv);
                      const lastTs = getTs(conv.lastTimestamp);
                      const otherUser = getOtherUser(conv);

                      return (
                        <button
                          key={conv.id}
                          onClick={() => setActiveConvId(conv.id)}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left mb-1 relative border border-transparent cursor-pointer',
                            isSelected
                              ? 'bg-primary/10 border-primary/20 shadow-sm'
                              : unread
                              ? 'bg-primary/[0.04] border-primary/15 hover:bg-primary/[0.08]'
                              : 'hover:bg-muted/50'
                          )}
                        >
                          <div className="relative shrink-0">
                            <Avatar className="h-11 w-11 border-2 border-background shadow-sm">
                              {conv.type === 'group' ? (
                                <div className="bg-primary/10 h-full w-full flex items-center justify-center">
                                  <Users className="h-5 w-5 text-primary" />
                                </div>
                              ) : (
                                <AvatarImage
                                  src={
                                    otherUser?.profilePhoto ||
                                    `https://api.dicebear.com/7.x/initials/svg?seed=${getConvName(conv)}`
                                  }
                                />
                              )}
                              <AvatarFallback className="font-black text-[10px]">
                                {getConvName(conv).substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {isActive !== null && (
                              <span
                                className={cn(
                                  'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background',
                                  isActive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'
                                )}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p
                                className={cn(
                                  'text-xs font-black uppercase tracking-tight truncate',
                                  isSelected || unread ? 'text-primary' : 'text-foreground'
                                )}
                              >
                                {getConvName(conv)}
                              </p>
                              {lastTs > 0 && (
                                <span className="text-[9px] font-mono text-muted-foreground/60 shrink-0 tabular-nums">
                                  {isToday(new Date(lastTs))
                                    ? format(new Date(lastTs), 'HH:mm')
                                    : format(new Date(lastTs), 'MMM dd')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p
                                className={cn(
                                  'text-[11px] truncate',
                                  unread
                                    ? 'text-foreground font-bold'
                                    : 'text-muted-foreground font-medium'
                                )}
                              >
                                {conv.lastSenderId === user?.uid ? 'You: ' : ''}
                                {conv.lastMessage || 'Link active'}
                              </p>
                              {unread && (
                                <span className="h-2.5 w-2.5 rounded-full bg-[#FF6B4A] shrink-0 shadow-[0_0_8px_rgba(255,107,74,0.7)]" />
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="py-20 text-center px-6 opacity-30">
                      <MessageSquare className="h-10 w-10 mx-auto mb-3" />
                      <p className="text-[10px] font-black uppercase tracking-widest">
                        No matching channels
                      </p>
                    </div>
                  )}
                </div>
              ) : sidebarTab === 'calls' ? (
                <div className="space-y-1.5">
                  {callHistoryItems.length > 0 ? (
                    callHistoryItems.map((logMsg) => {
                      const conv = rawConversations?.find((c) => c.id === logMsg.conversationId);
                      const data = logMsg.callLogData!;
                      const isOutgoing = logMsg.senderId === user?.uid;
                      const isMissedOrDeclined =
                        data.event === 'missed' || data.event === 'declined';
                      const ts = getTs(logMsg.timestamp);

                      return (
                        <div
                          key={logMsg.id}
                          className="flex items-center justify-between gap-2.5 p-3 rounded-2xl border border-border/60 bg-background/50 hover:bg-muted/50 transition-all"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveConvId(logMsg.conversationId);
                              setSidebarTab('channels');
                            }}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                          >
                            <div
                              className={cn(
                                'h-10 w-10 rounded-2xl flex items-center justify-center shrink-0',
                                isMissedOrDeclined
                                  ? 'bg-rose-500/15 text-rose-500'
                                  : data.callType === 'video'
                                  ? 'bg-indigo-500/15 text-indigo-500'
                                  : 'bg-emerald-500/15 text-emerald-500'
                              )}
                            >
                              {isMissedOrDeclined ? (
                                <PhoneMissed className="h-4 w-4" />
                              ) : isOutgoing ? (
                                <PhoneOutgoing className="h-4 w-4" />
                              ) : (
                                <PhoneIncoming className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-black uppercase tracking-tight text-foreground truncate">
                                {conv ? getConvName(conv) : logMsg.senderName}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] font-bold mt-0.5">
                                <span
                                  className={cn(
                                    'uppercase',
                                    isMissedOrDeclined
                                      ? 'text-rose-500'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  {data.callType === 'video' ? 'Video' : 'Voice'} •{' '}
                                  {data.event === 'missed'
                                    ? 'Missed'
                                    : data.event === 'declined'
                                    ? 'Declined'
                                    : data.event === 'ended'
                                    ? formatCallDuration(data.durationSeconds || 0)
                                    : 'Initialized'}
                                </span>
                                {ts > 0 && (
                                  <span className="text-muted-foreground/60 font-mono">
                                    •{' '}
                                    {isToday(new Date(ts))
                                      ? format(new Date(ts), 'HH:mm')
                                      : format(new Date(ts), 'MMM dd')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>

                          {conv && (
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              onClick={() => {
                                setActiveConvId(conv.id);
                                setTimeout(() => {
                                  handleStartCall(data.callType);
                                }, 80);
                              }}
                              className="h-9 w-9 rounded-xl shrink-0 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                              title={`Call back (${data.callType})`}
                            >
                              {data.callType === 'video' ? (
                                <Video className="h-4 w-4" />
                              ) : (
                                <PhoneCall className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-20 text-center px-6 opacity-30">
                      <PhoneCall className="h-10 w-10 mx-auto mb-3" />
                      <p className="text-[10px] font-black uppercase tracking-widest">
                        No call logs found
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {directorySections.command.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[9px] font-black text-primary uppercase tracking-[0.2em] px-3 flex items-center gap-1.5">
                        <Shield className="h-3 w-3" /> Bureau Command
                      </p>
                      {directorySections.command.map((u) => (
                        <DirectoryRow key={u.id} user={u} onOpen={handleOpenDirectMessage} />
                      ))}
                    </div>
                  )}

                  {directorySections.units.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] px-3 flex items-center gap-1.5">
                        <User className="h-3 w-3" /> Field Units
                      </p>
                      {directorySections.units.map((u) => (
                        <DirectoryRow key={u.id} user={u} onOpen={handleOpenDirectMessage} />
                      ))}
                    </div>
                  )}

                  {directorySections.command.length === 0 &&
                    directorySections.units.length === 0 && (
                      <div className="py-20 text-center px-6 opacity-20">
                        <User className="h-10 w-10 mx-auto mb-3" />
                        <p className="text-[10px] font-black uppercase tracking-widest">
                          No personnel found
                        </p>
                      </div>
                    )}
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Right Message Viewport */}
        <Card
          className={cn(
            'flex-1 min-w-0 min-h-0 flex flex-col border-border shadow-sm bg-card overflow-hidden rounded-3xl transition-all duration-300',
            !activeConvId ? 'hidden lg:flex' : 'flex'
          )}
        >
          {activeConvId && activeConv ? (
            <>
              {/* Active Channel Header */}
              <CardHeader className="py-3 px-3.5 sm:px-5 border-b flex flex-col gap-2.5 bg-card shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="lg:hidden h-9 w-9 -ml-1 rounded-xl shrink-0"
                      onClick={() => setActiveConvId(null)}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <button
                      type="button"
                      onClick={openManageChannelModal}
                      className="flex items-center gap-2.5 sm:gap-3 text-left group min-w-0 cursor-pointer"
                    >
                      <Avatar className="h-9 w-9 sm:h-10 sm:w-10 border border-border shadow-sm shrink-0">
                        {activeConv.type === 'group' ? (
                          <div className="bg-primary/10 h-full w-full flex items-center justify-center">
                            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                          </div>
                        ) : (
                          <AvatarImage
                            src={
                              getOtherUser(activeConv)?.profilePhoto ||
                              `https://api.dicebear.com/7.x/initials/svg?seed=${getConvName(activeConv)}`
                            }
                          />
                        )}
                        <AvatarFallback className="font-black text-[10px]">
                          {getConvName(activeConv).substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <CardTitle className="text-xs sm:text-sm md:text-base font-black text-foreground leading-none uppercase tracking-tight group-hover:text-primary transition-colors truncate">
                          {getConvName(activeConv)}
                        </CardTitle>
                        <div className="flex items-center gap-1.5 mt-1">
                          {activeTypingNames.length > 0 ? (
                            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider animate-pulse truncate">
                              {activeTypingNames.join(', ')} typing...
                            </span>
                          ) : (
                            <>
                              <span
                                className={cn(
                                  'h-1.5 w-1.5 rounded-full shrink-0',
                                  activeConv.type === 'group' || getOtherUserStatus(activeConv)
                                    ? 'bg-green-500 animate-pulse'
                                    : 'bg-muted-foreground/30'
                                )}
                              />
                              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.1em] truncate">
                                {activeConv.type === 'group'
                                  ? `${activeConv.members?.length || 0} Members`
                                  : getOtherUserStatus(activeConv)
                                  ? 'Active Duty'
                                  : 'Offline'}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Header Call & Utility Buttons */}
                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartCall('voice')}
                      className="h-8 sm:h-9 rounded-xl px-2 sm:px-2.5 text-[10px] font-black uppercase tracking-wider border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                      title="Start Voice Call"
                    >
                      <PhoneCall className="h-3.5 w-3.5 sm:mr-1.5" />
                      <span className="hidden sm:inline">Voice</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartCall('video')}
                      className="h-8 sm:h-9 rounded-xl px-2 sm:px-2.5 text-[10px] font-black uppercase tracking-wider border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
                      title="Start Video & Screen-Share Call"
                    >
                      <Video className="h-3.5 w-3.5 sm:mr-1.5" />
                      <span className="hidden sm:inline">Video</span>
                    </Button>
                    <Button
                      type="button"
                      variant={isMessageSearchOpen ? 'default' : 'outline'}
                      size="icon"
                      onClick={() => {
                        setIsMessageSearchOpen((prev) => !prev);
                        if (isMessageSearchOpen) setMessageSearchTerm('');
                      }}
                      className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl"
                      title="Search in conversation"
                    >
                      <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openManageChannelModal}
                      className="h-8 sm:h-9 rounded-xl px-2 sm:px-3 text-[10px] font-black uppercase tracking-wider"
                      title="Channel Info"
                    >
                      <Settings2 className="h-3.5 w-3.5 md:mr-1.5" />
                      <span className="hidden md:inline">
                        {activeConv.type === 'group' ? 'Manage' : 'Info'}
                      </span>
                    </Button>
                  </div>
                </div>

                {/* Active Ongoing Call Banner in Channel */}
                {activeConv.activeCall &&
                  (activeConv.activeCall.status === 'ringing' ||
                    activeConv.activeCall.status === 'active') &&
                  !activeConv.activeCall.activeParticipantIds?.includes(user?.uid || '') && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 animate-in slide-in-from-top-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <Radio className="h-4 w-4 text-emerald-500 animate-pulse shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-black text-emerald-700 dark:text-emerald-300 truncate">
                            Live {activeConv.activeCall.callType === 'video' ? 'Video' : 'Voice'}{' '}
                            Call • {activeConv.activeCall.callerName}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {activeConv.activeCall.activeParticipantIds?.length || 1} connected
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleAcceptIncomingCall(activeConv, true)}
                          className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider px-2.5"
                        >
                          <Video className="h-3.5 w-3.5 mr-1" /> Video
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleAcceptIncomingCall(activeConv, false)}
                          className="h-8 rounded-xl text-[10px] font-black uppercase tracking-wider px-2.5"
                        >
                          <PhoneCall className="h-3.5 w-3.5 mr-1" /> Voice
                        </Button>
                      </div>
                    </div>
                  )}

                {/* Toggleable In-Conversation Search Bar */}
                {isMessageSearchOpen && (
                  <div className="flex items-center gap-2 pt-1 animate-in slide-in-from-top-1 duration-200">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search messages, sender, or 29-digit RID in this channel..."
                        value={messageSearchTerm}
                        onChange={(e) => setMessageSearchTerm(e.target.value)}
                        className="h-9 pl-9 pr-8 text-xs rounded-xl bg-muted/30"
                        autoFocus
                      />
                      {messageSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setMessageSearchTerm('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap tabular-nums">
                      {filteredMessages.length} results
                    </span>
                  </div>
                )}
              </CardHeader>

              {/* Pinned Message Banner */}
              {activeConv.pinnedMessageId && pinnedMessage && (
                <div className="bg-primary/[0.04] border-b border-primary/15 px-5 py-2.5 flex items-center justify-between group/pinned animate-in slide-in-from-top-1">
                  <button
                    type="button"
                    onClick={() => scrollToMessage(pinnedMessage.id)}
                    className="flex items-center gap-3 overflow-hidden text-left flex-1 cursor-pointer"
                  >
                    <div className="p-1.5 bg-primary/10 rounded-lg">
                      <Pin className="h-3.5 w-3.5 text-primary shrink-0" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-[9px] font-black text-primary uppercase tracking-[0.2em] leading-none mb-0.5">
                        Pinned Intelligence • {pinnedMessage.senderName}
                      </p>
                      <p className="text-xs text-foreground truncate font-semibold">
                        &ldquo;{pinnedMessage.text}&rdquo;
                      </p>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => handleTogglePin(pinnedMessage)}
                    title="Unpin message"
                  >
                    <PinOff className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {/* Message Feed */}
              <CardContent className="flex-1 p-0 flex flex-col min-h-0 bg-muted/5">
                <ScrollArea ref={scrollRef} className="flex-1 p-5">
                  <div className="space-y-5">
                    {isMessagesLoading ? (
                      <div className="space-y-6 py-4">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={cn(
                              'flex flex-col max-w-[70%] space-y-2',
                              i % 2 === 0 ? 'ml-auto items-end' : 'mr-auto items-start'
                            )}
                          >
                            <Skeleton className="h-3 w-24 rounded" />
                            <Skeleton className="h-12 w-56 rounded-2xl" />
                          </div>
                        ))}
                      </div>
                    ) : filteredMessages.length === 0 ? (
                      <div className="py-16 text-center opacity-40">
                        <MessageSquare className="h-10 w-10 mx-auto mb-2" />
                        <p className="text-xs font-bold uppercase tracking-wider">
                          {messageSearchTerm
                            ? 'No messages match your search'
                            : 'No messages yet — send the first transmission below'}
                        </p>
                      </div>
                    ) : (
                      filteredMessages.map((msg, index) => {
                        const isMe = msg.senderId === user?.uid;
                        const isPinned = activeConv.pinnedMessageId === msg.id;
                        const msgDate = msg.timestamp?.toDate
                          ? msg.timestamp.toDate()
                          : new Date();
                        const prevMsg = index > 0 ? filteredMessages[index - 1] : null;
                        const prevDate = prevMsg?.timestamp?.toDate
                          ? prevMsg.timestamp.toDate()
                          : null;
                        const showDateDivider = !prevDate || !isSameDay(msgDate, prevDate);
                        const seenInfo = getMessageSeenInfo(msg);

                        return (
                          <div key={msg.id} className="space-y-4">
                            {showDateDivider && (
                              <div className="flex items-center justify-center my-2">
                                <span className="px-3 py-1 rounded-full bg-muted/80 border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                  {formatDateSeparator(msgDate)}
                                </span>
                              </div>
                            )}

                            <div
                              id={`chat-msg-${msg.id}`}
                              className={cn(
                                'flex flex-col max-w-[85%] sm:max-w-[75%] group/msg transition-all duration-500 rounded-2xl',
                                isMe ? 'ml-auto items-end' : 'mr-auto items-start',
                                highlightedMsgId === msg.id &&
                                  'ring-2 ring-primary bg-primary/5 p-2'
                              )}
                            >
                              {/* Message Meta & Action Toolbar */}
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                                  {msg.senderName}
                                </p>
                                <span className="text-[9px] font-mono text-muted-foreground/60 tabular-nums">
                                  {msg.timestamp?.toDate
                                    ? format(msg.timestamp.toDate(), 'HH:mm')
                                    : '...'}
                                </span>
                                {msg.isEdited && (
                                  <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60 italic">
                                    (edited)
                                  </span>
                                )}

                                {/* Hover Actions: Reply, Edit (own), Pin, Copy, Delete */}
                                <div className="flex items-center gap-0.5 opacity-70 sm:opacity-0 sm:group-hover/msg:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => handleStartReplyMessage(msg)}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                                    title="Reply to message"
                                  >
                                    <Reply className="h-3 w-3" />
                                  </button>
                                  {isMe && (
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditMessage(msg)}
                                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                                      title="Edit message"
                                    >
                                      <SquarePen className="h-3 w-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePin(msg)}
                                    className={cn(
                                      'p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors cursor-pointer',
                                      isPinned && 'text-primary'
                                    )}
                                    title={isPinned ? 'Unpin message' : 'Pin message'}
                                  >
                                    {isPinned ? (
                                      <PinOff className="h-3 w-3" />
                                    ) : (
                                      <Pin className="h-3 w-3" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(msg.text || '')}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                    title="Copy message"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMsgToDelete(msg);
                                      setIsDeleteDialogOpen(true);
                                    }}
                                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                                    title="Delete message"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>

                              {/* Message Bubble */}
                              <div
                                className={cn(
                                  'px-4 py-3 rounded-[22px] text-sm shadow-sm transition-all border space-y-2.5 max-w-full',
                                  isMe
                                    ? 'bg-primary text-primary-foreground border-primary/10 rounded-tr-none'
                                    : 'bg-card text-foreground border-border rounded-tl-none',
                                  isPinned && 'ring-1 ring-primary/40'
                                )}
                              >
                                {/* Quoted Reply Box */}
                                {msg.replyToId && (
                                  <button
                                    type="button"
                                    onClick={() => scrollToMessage(msg.replyToId!)}
                                    className={cn(
                                      'w-full text-left px-3 py-1.5 rounded-xl border-l-2 text-xs block truncate cursor-pointer transition-colors',
                                      isMe
                                        ? 'bg-white/15 border-white/80 text-white/90 hover:bg-white/20'
                                        : 'bg-muted/70 border-primary text-foreground hover:bg-muted'
                                    )}
                                  >
                                    <span className="text-[9px] font-black uppercase tracking-wider block opacity-80">
                                      Replying to {msg.replyToSenderName || 'Official'}
                                    </span>
                                    <span className="truncate block opacity-90 text-[11px]">
                                      {msg.replyToText}
                                    </span>
                                  </button>
                                )}

                                {/* Shared Registration RID Card */}
                                {msg.sharedRegistration && (
                                  <div
                                    onClick={() =>
                                      setInspectedSharedReg(msg.sharedRegistration || null)
                                    }
                                    className={cn(
                                      'p-3 rounded-2xl border cursor-pointer transition-all space-y-2 min-w-[240px]',
                                      isMe
                                        ? 'bg-white/15 border-white/25 hover:bg-white/20 text-white'
                                        : 'bg-muted/50 border-border hover:bg-muted text-foreground'
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                                        <FileDigit className="h-3.5 w-3.5" />
                                        Shared Registration RID
                                      </span>
                                      <StatusBadge status={msg.sharedRegistration.status} />
                                    </div>
                                    <div>
                                      <p className="text-xs font-black">
                                        {msg.sharedRegistration.applicantName}
                                      </p>
                                      <p className="text-[11px] font-mono opacity-85 truncate">
                                        {msg.sharedRegistration.id}
                                      </p>
                                    </div>
                                    {msg.sharedRegistration.institutionName && (
                                      <div className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/10 dark:bg-white/10">
                                        <Building2 className="h-3 w-3" />
                                        <span>{msg.sharedRegistration.institutionName}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between pt-1 border-t border-current/10 text-[10px] font-bold opacity-80">
                                      <span>Click to inspect record</span>
                                      <Eye className="h-3 w-3" />
                                    </div>
                                  </div>
                                )}

                                {/* Voice Note Audio Player */}
                                {msg.audioUrl && (
                                  <div
                                    className={cn(
                                      'p-2.5 rounded-2xl border space-y-1.5 min-w-[230px]',
                                      isMe
                                        ? 'bg-white/15 border-white/25 text-white'
                                        : 'bg-muted/60 border-border text-foreground'
                                    )}
                                  >
                                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
                                      <span className="inline-flex items-center gap-1.5">
                                        <Mic className="h-3.5 w-3.5" /> Voice Note
                                      </span>
                                      {msg.audioDurationSeconds ? (
                                        <span className="font-mono tabular-nums">
                                          {formatCallDuration(msg.audioDurationSeconds)}
                                        </span>
                                      ) : null}
                                    </div>
                                    <audio
                                      src={msg.audioUrl}
                                      controls
                                      preload="metadata"
                                      className="h-8 w-full max-w-[240px]"
                                    />
                                  </div>
                                )}

                                {/* Rich Call Log Card */}
                                {msg.isCallLog && msg.callLogData && (
                                  <div
                                    className={cn(
                                      'p-3 rounded-2xl border flex items-center justify-between gap-3 min-w-[230px]',
                                      isMe
                                        ? 'bg-white/15 border-white/25 text-white'
                                        : 'bg-muted/60 border-border text-foreground'
                                    )}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div
                                        className={cn(
                                          'h-9 w-9 rounded-xl flex items-center justify-center shrink-0',
                                          msg.callLogData.event === 'missed' ||
                                            msg.callLogData.event === 'declined'
                                            ? 'bg-rose-500/20 text-rose-300'
                                            : 'bg-emerald-500/20 text-emerald-300'
                                        )}
                                      >
                                        {msg.callLogData.callType === 'video' ? (
                                          <Video className="h-4 w-4" />
                                        ) : (
                                          <PhoneCall className="h-4 w-4" />
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-black uppercase tracking-tight">
                                          {msg.callLogData.callType === 'video'
                                            ? 'Video Call'
                                            : 'Voice Call'}
                                        </p>
                                        <p className="text-[10px] font-bold opacity-85">
                                          {msg.callLogData.event === 'missed'
                                            ? 'Unanswered / Missed'
                                            : msg.callLogData.event === 'declined'
                                            ? 'Declined'
                                            : msg.callLogData.event === 'ended'
                                            ? `Duration ${formatCallDuration(
                                                msg.callLogData.durationSeconds || 0
                                              )}`
                                            : 'Call Started'}
                                        </p>
                                      </div>
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={isMe ? 'secondary' : 'outline'}
                                      onClick={() =>
                                        handleStartCall(msg.callLogData!.callType)
                                      }
                                      className="h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0"
                                    >
                                      Call Again
                                    </Button>
                                  </div>
                                )}

                                {/* Image or File Attachment */}
                                {msg.attachmentUrl && (
                                  <div className="pt-0.5">
                                    {msg.attachmentType === 'image' ? (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewImageUrl(msg.attachmentUrl!)}
                                        className="block rounded-xl overflow-hidden border border-white/20 max-w-[280px] cursor-pointer"
                                      >
                                        <img
                                          src={msg.attachmentUrl}
                                          alt={msg.attachmentName || 'Attachment'}
                                          className="max-h-56 w-auto object-cover hover:scale-[1.02] transition-transform"
                                        />
                                      </button>
                                    ) : (
                                      <a
                                        href={msg.attachmentUrl}
                                        download={msg.attachmentName || 'attachment'}
                                        className={cn(
                                          'flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-bold',
                                          isMe
                                            ? 'bg-white/15 border-white/25 text-white hover:bg-white/20'
                                            : 'bg-muted/60 border-border text-foreground hover:bg-muted'
                                        )}
                                      >
                                        <FileText className="h-4 w-4 shrink-0" />
                                        <span className="truncate max-w-[180px]">
                                          {msg.attachmentName || 'Document'}
                                        </span>
                                        <Download className="h-3.5 w-3.5 ml-auto shrink-0" />
                                      </a>
                                    )}
                                  </div>
                                )}

                                {/* Message Text */}
                                {msg.text && !msg.isCallLog && (
                                  <p className="leading-relaxed break-words whitespace-pre-wrap">
                                    {msg.text}
                                  </p>
                                )}
                              </div>

                              {/* Outgoing Read Receipt Indicator (Sent vs Seen) */}
                              {isMe && (
                                <div
                                  className="flex items-center gap-1 mt-1 pr-1"
                                  title={
                                    seenInfo.isSeen
                                      ? `Seen by ${seenInfo.seenByNames.join(', ')}`
                                      : 'Sent'
                                  }
                                >
                                  {seenInfo.isSeen ? (
                                    <>
                                      <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                                      <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                                        Seen
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <Check className="h-3 w-3 text-muted-foreground/60" />
                                      <span className="text-[9px] font-medium text-muted-foreground/60">
                                        Sent
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>

                {/* Composer Area with Reply / Edit / Attachment / RID / Voice Note Previews */}
                <div className="p-3.5 bg-card border-t border-border space-y-2.5">
                  {/* Live Typing Banner above Composer */}
                  {activeTypingNames.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 animate-pulse">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span>
                        {activeTypingNames.join(', ')}{' '}
                        {activeTypingNames.length === 1 ? 'is' : 'are'} typing...
                      </span>
                    </div>
                  )}

                  {/* Active Reply or Edit Banner */}
                  {(replyingTo || editingMessage) && (
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-primary/10 border border-primary/20 text-xs animate-in slide-in-from-bottom-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {editingMessage ? (
                          <SquarePen className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                          <Reply className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-wider text-primary block">
                            {editingMessage
                              ? 'Editing Message'
                              : `Replying to ${replyingTo?.senderName}`}
                          </span>
                          <span className="text-xs text-muted-foreground truncate block">
                            {editingMessage ? editingMessage.text : replyingTo?.text}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(null);
                          if (editingMessage) {
                            setEditingMessage(null);
                            setInputText('');
                          }
                        }}
                        className="p-1 rounded-lg hover:bg-primary/15 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Pending Voice Note Preview */}
                  {pendingAudio && (
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Volume2 className="h-4 w-4 text-amber-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                            Voice Note Ready ({formatCallDuration(pendingAudio.duration)})
                          </span>
                          <audio
                            src={pendingAudio.url}
                            controls
                            className="h-7 w-full max-w-[240px] mt-1"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingAudio(null)}
                        className="p-1 rounded-lg hover:bg-amber-500/15 text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Discard voice note"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Active Voice Recording Bar */}
                  {isRecordingAudio && (
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs animate-pulse">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-ping" />
                        <span className="font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                          Recording Voice Note • {formatCallDuration(recordingSeconds)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStopVoiceRecording(true)}
                          className="h-7 px-2.5 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-rose-600"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleStopVoiceRecording(false)}
                          className="h-7 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-wider"
                        >
                          <Square className="h-3 w-3 mr-1" /> Done
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Pending Shared Registration RID Preview */}
                  {pendingSharedReg && (
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileDigit className="h-4 w-4 text-indigo-500 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                            Sharing Registration Record ({pendingSharedReg.status})
                          </span>
                          <span className="text-xs font-bold text-foreground truncate block">
                            {pendingSharedReg.applicantName} • {pendingSharedReg.id}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingSharedReg(null)}
                        className="p-1 rounded-lg hover:bg-indigo-500/15 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Pending File / Image Attachment Preview */}
                  {pendingAttachment && (
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {pendingAttachment.type === 'image' ? (
                          <img
                            src={pendingAttachment.url}
                            alt="Preview"
                            className="h-9 w-9 rounded-lg object-cover border border-emerald-500/30"
                          />
                        ) : (
                          <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                            Ready to Attach ({pendingAttachment.type})
                          </span>
                          <span className="text-xs font-bold text-foreground truncate block">
                            {pendingAttachment.name}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingAttachment(null)}
                        className="p-1 rounded-lg hover:bg-emerald-500/15 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Input Form */}
                  <form onSubmit={handleSendMessage} className="flex gap-1.5 sm:gap-2 items-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.pdf,.xlsx,.xls,.csv,.txt"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-11 w-11 rounded-2xl shrink-0 text-muted-foreground hover:text-primary"
                      title="Attach image or document"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setIsRidPickerOpen(true)}
                      className="h-11 w-11 rounded-2xl shrink-0 text-muted-foreground hover:text-primary"
                      title="Share a 29-Digit Registration Record (RID)"
                    >
                      <FileDigit className="h-4 w-4" />
                    </Button>

                    <Button
                      type="button"
                      variant={isRecordingAudio ? 'destructive' : 'outline'}
                      size="icon"
                      onClick={() =>
                        isRecordingAudio
                          ? handleStopVoiceRecording(false)
                          : handleStartVoiceRecording()
                      }
                      className="h-11 w-11 rounded-2xl shrink-0 text-muted-foreground hover:text-primary"
                      title={
                        isRecordingAudio ? 'Stop recording voice note' : 'Record a voice note'
                      }
                    >
                      {isRecordingAudio ? (
                        <Square className="h-4 w-4 text-white" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                    </Button>

                    <Input
                      placeholder={
                        editingMessage
                          ? 'Update your message...'
                          : replyingTo
                          ? `Reply to ${replyingTo.senderName}...`
                          : 'Secure transmission payload...'
                      }
                      value={inputText}
                      onChange={(e) => handleInputTyping(e.target.value)}
                      className="flex-1 h-11 border-border bg-muted/30 rounded-2xl text-sm font-medium"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={
                        !inputText.trim() &&
                        !pendingAttachment &&
                        !pendingSharedReg &&
                        !pendingAudio
                      }
                      className="h-11 w-11 bg-primary text-white rounded-2xl shrink-0 shadow-xl shadow-primary/20 transition-transform active:scale-95"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </CardContent>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-6 p-12 text-center">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/5 rounded-full blur-3xl opacity-50" />
                <div className="p-10 bg-muted/50 rounded-full border-2 border-dashed border-border/40 relative z-10">
                  <MessageSquare className="h-16 w-16 opacity-10" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-black uppercase tracking-[0.3em] text-foreground">
                  Ready for Transmission
                </p>
                <p className="text-xs font-medium opacity-60 max-w-xs mx-auto leading-relaxed">
                  Select a coordination channel or browse the bureau directory to initialize a new secure transmission link.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Share Registration Record (29-Digit RID) Picker Modal */}
      <Dialog open={isRidPickerOpen} onOpenChange={setIsRidPickerOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-3xl p-0 overflow-hidden">
          <DialogHeader className="p-6 border-b bg-muted/20">
            <DialogTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2">
              <FileDigit className="h-5 w-5 text-primary" />
              Share Registration Record (RID)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select a registered citizen or institution record to embed in this conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="p-5 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by applicant name, 29-digit RID, phone, or institution..."
                value={ridSearchTerm}
                onChange={(e) => setRidSearchTerm(e.target.value)}
                className="pl-9 h-10 rounded-xl text-xs"
              />
            </div>
            <ScrollArea className="h-[300px] border border-border rounded-2xl p-2">
              <div className="space-y-1.5">
                {filteredRegistrationsForPicker.length > 0 ? (
                  filteredRegistrationsForPicker.map((reg) => {
                    const inst = (reg.institutionName || reg.schoolName || '').trim();
                    return (
                      <button
                        key={reg.id}
                        type="button"
                        onClick={() => {
                          setPendingSharedReg({
                            id: reg.id,
                            applicantName: reg.applicantName,
                            status: reg.status,
                            phone: reg.phone,
                            location: reg.location,
                            institutionName: inst || undefined,
                            submissionDate: reg.submissionDate,
                          });
                          setIsRidPickerOpen(false);
                        }}
                        className="w-full p-3 rounded-xl hover:bg-muted/70 border border-transparent hover:border-border text-left transition-all flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground truncate">
                              {reg.applicantName}
                            </span>
                            {inst && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-semibold">
                                <Building2 className="h-2.5 w-2.5" />
                                {inst}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono text-muted-foreground truncate">
                            {reg.id}
                          </p>
                        </div>
                        <StatusBadge status={reg.status} />
                      </button>
                    );
                  })
                ) : (
                  <div className="py-16 text-center text-xs text-muted-foreground">
                    No matching registration records found.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Inspect Shared Registration Record Modal */}
      <Dialog
        open={Boolean(inspectedSharedReg)}
        onOpenChange={(o) => !o && setInspectedSharedReg(null)}
      >
        <DialogContent className="sm:max-w-[480px] rounded-3xl p-0 overflow-hidden">
          {inspectedSharedReg && (
            <>
              <DialogHeader className="p-6 border-b bg-muted/20">
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                    <FileDigit className="h-5 w-5 text-primary" />
                    Shared Registration Record
                  </DialogTitle>
                  <StatusBadge status={inspectedSharedReg.status} />
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  Shared directly inside Coordination Portal
                </DialogDescription>
              </DialogHeader>
              <div className="p-6 space-y-4">
                <div className="rounded-2xl bg-muted/30 border border-border p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      Applicant Name
                    </span>
                    <span className="font-bold text-foreground">
                      {inspectedSharedReg.applicantName}
                    </span>
                  </div>
                  {inspectedSharedReg.institutionName && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Institution Name
                      </span>
                      <span className="font-bold text-primary flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {inspectedSharedReg.institutionName}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      29-Digit RID
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(inspectedSharedReg.id, '29-Digit RID')}
                      className="font-mono font-bold text-foreground hover:text-primary flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>{inspectedSharedReg.id}</span>
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  {inspectedSharedReg.phone && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Phone
                      </span>
                      <span className="font-mono font-semibold">{inspectedSharedReg.phone}</span>
                    </div>
                  )}
                  {inspectedSharedReg.location && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Location
                      </span>
                      <span className="font-semibold">{inspectedSharedReg.location}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  {inspectedSharedReg.institutionName ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInspectedSharedReg(null);
                        router.push('/schools-students');
                      }}
                      className="rounded-xl text-xs font-bold"
                    >
                      <Building2 className="mr-1.5 h-3.5 w-3.5" /> Open in Institutions
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInspectedSharedReg(null);
                        router.push('/registrations');
                      }}
                      className="rounded-xl text-xs font-bold"
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open in Records
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => setInspectedSharedReg(null)}
                    className="rounded-xl text-xs font-bold"
                  >
                    Done
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Channel Info & Group Management Modal */}
      <Dialog open={isManageChannelOpen} onOpenChange={setIsManageChannelOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl p-0 overflow-hidden max-h-[88vh] flex flex-col">
          {activeConv && (
            <>
              <DialogHeader className="p-6 border-b bg-muted/20">
                <DialogTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                  {activeConv.type === 'group' ? (
                    <>
                      <Users className="h-5 w-5 text-primary" />
                      Group Channel Management
                    </>
                  ) : (
                    <>
                      <User className="h-5 w-5 text-primary" />
                      Direct Channel Intelligence
                    </>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {activeConv.type === 'group'
                    ? 'Update group designation, inspect members, or add/remove personnel.'
                    : 'Direct encrypted link between bureau personnel.'}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 p-6">
                {activeConv.type === 'group' ? (
                  <div className="space-y-6">
                    {/* Rename Group */}
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Group Designation & Purpose
                      </Label>
                      <div className="space-y-2">
                        <Input
                          value={editGroupName}
                          onChange={(e) => setEditGroupName(e.target.value)}
                          placeholder="Group Name"
                          className="h-10 rounded-xl text-xs font-bold"
                        />
                        <Input
                          value={editGroupDescription}
                          onChange={(e) => setEditGroupDescription(e.target.value)}
                          placeholder="Channel description..."
                          className="h-9 rounded-xl text-xs"
                        />
                        <Button
                          size="sm"
                          onClick={handleSaveGroupDetails}
                          className="h-9 rounded-xl text-xs font-bold"
                        >
                          Save Group Info
                        </Button>
                      </div>
                    </div>

                    {/* Current Group Members */}
                    <div className="space-y-2.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Current Members ({activeConv.members?.length || 0})
                      </Label>
                      <div className="space-y-1.5 border border-border rounded-2xl p-2 bg-muted/10">
                        {(activeConv.members || []).map((memberId) => {
                          const memberProfile = allUsers?.find((u) => u.id === memberId);
                          const isCreator = activeConv.createdBy === memberId;
                          const canRemove =
                            memberId !== user?.uid &&
                            (isAdmin || activeConv.createdBy === user?.uid);

                          return (
                            <div
                              key={memberId}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-background"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Avatar className="h-8 w-8 border border-border">
                                  <AvatarImage src={memberProfile?.profilePhoto} />
                                  <AvatarFallback className="text-[10px] font-bold">
                                    {(memberProfile?.fullName || 'OF')
                                      .substring(0, 2)
                                      .toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-foreground truncate flex items-center gap-1.5">
                                    {memberProfile?.fullName ||
                                      (memberId === user?.uid ? 'You' : 'Bureau Official')}
                                    {isCreator && (
                                      <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-primary/10 text-primary">
                                        Creator
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground uppercase">
                                    {memberProfile?.role || 'Official'} •{' '}
                                    {memberProfile?.region || 'HQ'}
                                  </p>
                                </div>
                              </div>
                              {canRemove && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() =>
                                    handleRemoveMemberFromGroup(
                                      memberId,
                                      memberProfile?.fullName || 'Official'
                                    )
                                  }
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg"
                                  title="Remove from group"
                                >
                                  <UserMinus className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Add Personnel to Group */}
                    <div className="space-y-2.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Add Personnel to Group
                      </Label>
                      <Input
                        placeholder="Filter available personnel..."
                        value={addMemberSearch}
                        onChange={(e) => setAddMemberSearch(e.target.value)}
                        className="h-9 rounded-xl text-xs"
                      />
                      <div className="space-y-1 max-h-40 overflow-y-auto border border-border rounded-2xl p-2 bg-muted/10">
                        {(allUsers || [])
                          .filter(
                            (u) =>
                              !activeConv.members?.includes(u.id) &&
                              ((u.fullName || '')
                                .toLowerCase()
                                .includes(addMemberSearch.toLowerCase()) ||
                                (u.region || '')
                                  .toLowerCase()
                                  .includes(addMemberSearch.toLowerCase()))
                          )
                          .map((u) => (
                            <div
                              key={u.id}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-background"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground truncate">
                                  {u.fullName}
                                </p>
                                <p className="text-[10px] text-muted-foreground uppercase">
                                  {u.role} • {u.region || 'HQ'}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAddMemberToGroup(u.id, u.fullName)}
                                className="h-7 px-2.5 rounded-lg text-[10px] font-bold"
                              >
                                <UserPlus className="h-3 w-3 mr-1" /> Add
                              </Button>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Leave or Delete Group */}
                    <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLeaveGroup}
                        className="rounded-xl text-xs font-bold text-rose-600 border-rose-500/20 hover:bg-rose-500/10"
                      >
                        <LogOut className="h-3.5 w-3.5 mr-1.5" /> Leave Group
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleDeleteConversation}
                          className="rounded-xl text-xs font-bold"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Group
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Direct Message Officer Info */
                  <div className="space-y-5">
                    {(() => {
                      const other = getOtherUser(activeConv);
                      return (
                        <div className="p-4 rounded-2xl bg-muted/30 border border-border space-y-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12 border border-border">
                              <AvatarImage src={other?.profilePhoto} />
                              <AvatarFallback className="font-black text-xs">
                                {getConvName(activeConv).substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-black uppercase">
                                {other?.fullName || getConvName(activeConv)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {other?.email || 'Bureau Terminal'}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-xs">
                            <div>
                              <span className="text-[10px] font-black uppercase text-muted-foreground block">
                                Role
                              </span>
                              <span className="font-bold uppercase">
                                {other?.role || 'Official'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] font-black uppercase text-muted-foreground block">
                                Duty Status
                              </span>
                              <span className="font-bold">
                                {other?.isDutyActive ? 'Active Duty (Online)' : 'Offline'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {isAdmin && (
                      <div className="flex justify-end">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleDeleteConversation}
                          className="rounded-xl text-xs font-bold"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Channel
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Fullscreen Image Lightbox Modal */}
      <Dialog open={Boolean(previewImageUrl)} onOpenChange={(o) => !o && setPreviewImageUrl(null)}>
        <DialogContent className="sm:max-w-[720px] p-2 rounded-3xl overflow-hidden bg-black/90 border-white/10">
          <DialogHeader className="sr-only">
            <DialogTitle>Attachment Preview</DialogTitle>
          </DialogHeader>
          {previewImageUrl && (
            <div className="flex flex-col items-center justify-center p-2">
              <img
                src={previewImageUrl}
                alt="Full attachment"
                className="max-h-[75vh] w-auto rounded-2xl object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Message Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[32px] border-none shadow-2xl bg-popover max-w-sm mx-4">
          <AlertDialogHeader className="p-6 text-center">
            <AlertDialogTitle className="text-xl font-black uppercase tracking-tight">
              Purge Transmission?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-medium text-muted-foreground mt-2">
              {msgToDelete?.senderId === user?.uid || isAdmin
                ? 'Permanently delete this message for everyone in the channel.'
                : 'Remove this message from your local terminal viewport.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="p-6 pt-0 bg-muted/30 flex flex-col gap-3">
            <Button
              variant="destructive"
              className="w-full h-11 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-destructive/10"
              onClick={handleConfirmDeleteMessage}
            >
              Purge Record
            </Button>
            <AlertDialogCancel className="w-full h-11 rounded-2xl font-bold uppercase text-[10px] tracking-widest border-none bg-transparent">
              Abort
            </AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Live WebRTC Voice, Video & Screen-Share Call Overlay */}
      {user && (
        <LiveCallOverlay
          currentUserId={user.uid}
          currentUserName={
            currentUserProfile?.fullName || user.email?.split('@')[0] || 'Official'
          }
          currentUserPhoto={currentUserProfile?.profilePhoto}
          currentUserRole={currentUserProfile?.role}
          conversations={conversations}
          allUsers={allUsers || []}
          onAcceptIncomingCall={handleAcceptIncomingCall}
          onDeclineIncomingCall={handleDeclineIncomingCall}
          onUpdateParticipantState={handleUpdateParticipantState}
          onEndOrLeaveCall={handleEndOrLeaveCall}
        />
      )}
    </div>
  );
}

function DirectoryRow({
  user,
  onOpen,
}: {
  user: UserProfile;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(user.id)}
      className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-muted/50 transition-all text-left group cursor-pointer"
    >
      <div className="relative">
        <Avatar className="h-11 w-11 border-2 border-background shadow-sm">
          <AvatarImage src={user.profilePhoto} />
          <AvatarFallback
            className={cn(
              'text-[10px] font-black',
              user.role === 'admin' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            )}
          >
            {(user.fullName || 'OF').substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            'absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-background',
            user.isDutyActive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black uppercase tracking-tight text-foreground truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
            {user.fullName}
            {user.role === 'admin' && <Shield className="h-2.5 w-2.5 text-primary" />}
          </p>
          {user.role === 'admin' && (
            <span className="text-[7px] font-black bg-primary text-primary-foreground px-1.5 py-0.5 rounded tracking-widest uppercase">
              Command
            </span>
          )}
        </div>
        <p className="text-[9px] text-muted-foreground font-bold uppercase truncate">
          {user.role} • {user.region || 'HQ'}
        </p>
      </div>
    </button>
  );
}
