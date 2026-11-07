'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  MonitorOff,
  Minimize2,
  Maximize2,
  Volume2,
  VolumeX,
  Radio,
  SwitchCamera,
  RefreshCw,
  Camera,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CallSession, CallParticipantState, Conversation, UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';

interface LiveCallOverlayProps {
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto?: string;
  currentUserRole?: string;
  conversations: Conversation[];
  allUsers?: UserProfile[];
  onAcceptIncomingCall: (conv: Conversation, withVideo: boolean) => void;
  onDeclineIncomingCall: (conv: Conversation) => void;
  onUpdateParticipantState: (
    convId: string,
    call: CallSession,
    updates: Partial<CallParticipantState>,
    extraCallUpdates?: Partial<CallSession>
  ) => void;
  onEndOrLeaveCall: (
    conv: Conversation,
    durationSeconds: number,
    reason?: 'ended' | 'missed'
  ) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Waits until ICE gathering completes (or up to timeoutMs) so that pc.localDescription
 * includes all gathered STUN ICE candidates in a single atomic SDP payload.
 */
function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 1800): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      resolve();
    };
    const onStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };
    pc.addEventListener('icegatheringstatechange', onStateChange);
    setTimeout(finish, timeoutMs);
  });
}

export function LiveCallOverlay({
  currentUserId,
  currentUserName,
  currentUserPhoto,
  currentUserRole,
  conversations,
  allUsers,
  onAcceptIncomingCall,
  onDeclineIncomingCall,
  onUpdateParticipantState,
  onEndOrLeaveCall,
}: LiveCallOverlayProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRingtoneMuted, setIsRingtoneMuted] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user');
  const [videoDeviceIds, setVideoDeviceIds] = useState<string[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState<number>(0);

  const [callElapsedSeconds, setCallElapsedSeconds] = useState(0);
  const [ringingElapsedSeconds, setRingingElapsedSeconds] = useState(0);
  const [declinedCallIds, setDeclinedCallIds] = useState<Set<string>>(new Set());
  const [callStatusBanner, setCallStatusBanner] = useState<string | null>(null);
  const [cameraPermissionNote, setCameraPermissionNote] = useState<string | null>(null);

  // Reactive flags so React immediately mounts <video> and <audio> when hardware streams arrive
  const [localMediaReady, setLocalMediaReady] = useState(false);
  const [hasLocalVideoTrack, setHasLocalVideoTrack] = useState(false);
  const [hasLocalAudioTrack, setHasLocalAudioTrack] = useState(false);
  const [hasRemoteVideoTrack, setHasRemoteVideoTrack] = useState(false);
  const [hasRemoteAudioTrack, setHasRemoteAudioTrack] = useState(false);
  const [localMediaTick, setLocalMediaTick] = useState(0);
  const [remoteMediaTick, setRemoteMediaTick] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [rtcConnected, setRtcConnected] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appliedOfferVersionRef = useRef<number>(0);
  const appliedAnswerVersionRef = useRef<number>(0);
  const prevCallIdRef = useRef<string | null>(null);

  // Callback refs ensure immediate attachment as soon as DOM elements mount on phone/tablet/desktop
  const setLocalVideoEl = useCallback(
    (el: HTMLVideoElement | null) => {
      localVideoRef.current = el;
      if (el && localStreamRef.current) {
        el.setAttribute('playsinline', 'true');
        el.setAttribute('webkit-playsinline', 'true');
        el.muted = true;
        if (el.srcObject !== localStreamRef.current) {
          el.srcObject = localStreamRef.current;
        }
        el.play().catch(() => {});
      }
    },
    [localMediaTick]
  );

  const setRemoteVideoEl = useCallback(
    (el: HTMLVideoElement | null) => {
      remoteVideoRef.current = el;
      if (el && remoteStreamRef.current) {
        el.setAttribute('playsinline', 'true');
        el.setAttribute('webkit-playsinline', 'true');
        if (el.srcObject !== remoteStreamRef.current) {
          el.srcObject = remoteStreamRef.current;
        }
        el.play().catch(() => {});
      }
    },
    [remoteMediaTick]
  );

  const setRemoteAudioEl = useCallback(
    (el: HTMLAudioElement | null) => {
      remoteAudioRef.current = el;
      if (el && remoteStreamRef.current) {
        if (el.srcObject !== remoteStreamRef.current) {
          el.srcObject = remoteStreamRef.current;
        }
        el.play().catch(() => {});
      }
    },
    [remoteMediaTick]
  );

  const setScreenVideoEl = useCallback(
    (el: HTMLVideoElement | null) => {
      screenVideoRef.current = el;
      if (el && screenStreamRef.current) {
        el.setAttribute('playsinline', 'true');
        if (el.srcObject !== screenStreamRef.current) {
          el.srcObject = screenStreamRef.current;
        }
        el.play().catch(() => {});
      }
    },
    [isScreenSharing]
  );

  // Find if current user is in a call (or if the call they started was just declined)
  const activeCallConv = useMemo(() => {
    return conversations.find((c) => {
      const call = c.activeCall;
      if (!call) return false;
      if (call.status === 'ended') return false;
      if (call.status === 'declined') {
        // Let caller see "Call Declined" briefly if it was their outgoing call
        return call.callerId === currentUserId && call.id === prevCallIdRef.current;
      }
      return Boolean(call.activeParticipantIds?.includes(currentUserId));
    });
  }, [conversations, currentUserId]);

  const activeCall = activeCallConv?.activeCall || null;

  // Determine whether the call has ACTUALLY been answered by at least one other participant
  const isAnsweredAndConnected = useMemo(() => {
    if (!activeCall) return false;
    if (activeCall.status !== 'active') return false;
    const activeIds = activeCall.activeParticipantIds || [];
    // A call is only truly connected once a second person has answered and joined activeParticipantIds
    return activeIds.length >= 2 || Boolean(activeCall.connectedAt && activeIds.length >= 2);
  }, [activeCall]);

  // Find if there is an incoming ringing/active call for current user that they haven't joined or declined yet
  const incomingCallConv = useMemo(() => {
    if (activeCallConv) return null;
    return conversations.find((c) => {
      const call = c.activeCall;
      if (!call) return false;
      if (call.status !== 'ringing' && call.status !== 'active') return false;
      if (call.callerId === currentUserId) return false;
      if (call.activeParticipantIds?.includes(currentUserId)) return false;
      if (declinedCallIds.has(call.id)) return false;
      return true;
    });
  }, [conversations, activeCallConv, currentUserId, declinedCallIds]);

  const incomingCall = incomingCallConv?.activeCall || null;

  // Play synthesized telephone ringback tone (for Caller waiting for answer) or incoming ringtone (for Recipient)
  useEffect(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }

    const shouldPlayOutgoingRingback =
      Boolean(activeCall) &&
      activeCall?.status === 'ringing' &&
      !isAnsweredAndConnected &&
      !isRingtoneMuted;

    const shouldPlayIncomingRingtone = Boolean(incomingCall) && !isRingtoneMuted;

    if (!shouldPlayOutgoingRingback && !shouldPlayIncomingRingtone) {
      return;
    }

    const playToneBurst = (type: 'outgoing' | 'incoming') => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const gain = ctx.createGain();
        gain.gain.value = 0.08;
        gain.connect(ctx.destination);

        if (type === 'outgoing') {
          // Standard North American / European 440Hz + 480Hz ringback tone
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          osc1.frequency.value = 440;
          osc2.frequency.value = 480;
          osc1.connect(gain);
          osc2.connect(gain);
          osc1.start();
          osc2.start();
          setTimeout(() => {
            osc1.stop();
            osc2.stop();
            ctx.close().catch(() => {});
          }, 900);
        } else {
          // Pleasant Telegram-style dual-note incoming call chime
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
          osc.frequency.setValueAtTime(880, ctx.currentTime + 0.22); // A5
          osc.connect(gain);
          osc.start();
          setTimeout(() => {
            osc.stop();
            ctx.close().catch(() => {});
          }, 480);
        }
      } catch {
        // Ignore autoplay restriction before user interaction
      }
    };

    const mode = shouldPlayOutgoingRingback ? 'outgoing' : 'incoming';
    playToneBurst(mode);
    ringtoneIntervalRef.current = setInterval(
      () => playToneBurst(mode),
      mode === 'outgoing' ? 3000 : 1800
    );

    return () => {
      if (ringtoneIntervalRef.current) {
        clearInterval(ringtoneIntervalRef.current);
        ringtoneIntervalRef.current = null;
      }
    };
  }, [activeCall?.id, activeCall?.status, isAnsweredAndConnected, incomingCall?.id, isRingtoneMuted]);

  // Handle "Call Declined" feedback when recipient declines
  useEffect(() => {
    if (activeCall?.id && activeCall.status !== 'declined') {
      prevCallIdRef.current = activeCall.id;
      setCallStatusBanner(null);
    }
    if (activeCall?.status === 'declined') {
      setCallStatusBanner('Call Declined by Recipient');
      const timer = setTimeout(() => {
        prevCallIdRef.current = null;
        setCallStatusBanner(null);
        stopAllMediaStreams();
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [activeCall?.id, activeCall?.status]);

  // Connected Call Duration Timer — ONLY runs AFTER the other person answers!
  useEffect(() => {
    if (!activeCall || !isAnsweredAndConnected) {
      setCallElapsedSeconds(0);
      return;
    }
    const startMs = new Date(activeCall.connectedAt || new Date().toISOString()).getTime();
    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setCallElapsedSeconds(diff);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeCall?.id, activeCall?.connectedAt, isAnsweredAndConnected]);

  // Outgoing Ringing Timeout (60 seconds — just like Telegram/WhatsApp "No Answer")
  useEffect(() => {
    if (!activeCall || !activeCallConv || isAnsweredAndConnected || activeCall.status === 'declined') {
      setRingingElapsedSeconds(0);
      return;
    }
    const startMs = new Date(activeCall.startedAt).getTime();
    const interval = setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setRingingElapsedSeconds(elapsed);
      if (elapsed >= 60 && activeCall.callerId === currentUserId) {
        clearInterval(interval);
        setCallStatusBanner('No Answer');
        setTimeout(() => {
          stopAllMediaStreams();
          onEndOrLeaveCall(activeCallConv, 0, 'missed');
        }, 1500);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall?.id, activeCall?.startedAt, isAnsweredAndConnected, activeCall?.status]);

  // Start Web Audio microphone level meter so user sees real voice activity
  const startMicAnalyzer = (stream: MediaStream) => {
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
        const avg = sum / dataArray.length;
        setMicLevel(Math.min(100, Math.round(avg * 1.8)));
      }, 120);
    } catch {
      // Ignore AudioContext restriction
    }
  };

  // Initialize media when joining or starting a call
  useEffect(() => {
    if (!activeCall || !activeCallConv || activeCall.status === 'declined') {
      stopAllMediaStreams();
      return;
    }

    appliedOfferVersionRef.current = 0;
    appliedAnswerVersionRef.current = 0;

    const myState = activeCall.participants?.[currentUserId];
    const shouldStartVideo = myState ? myState.isCameraOn : activeCall.callType === 'video';
    const initialMuted = myState?.isMuted ?? false;
    setIsCameraOn(shouldStartVideo);
    setIsMuted(initialMuted);

    startLocalMedia(shouldStartVideo, initialMuted, cameraFacingMode);

    return () => {
      stopAllMediaStreams();
    };
  }, [activeCall?.id]);

  // Re-attach streams whenever minimized/camera state changes
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.setAttribute('playsinline', 'true');
      localVideoRef.current.setAttribute('webkit-playsinline', 'true');
      localVideoRef.current.muted = true;
      if (localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      localVideoRef.current.play().catch(() => {});
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.setAttribute('playsinline', 'true');
      remoteVideoRef.current.setAttribute('webkit-playsinline', 'true');
      if (remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
      remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      if (remoteAudioRef.current.srcObject !== remoteStreamRef.current) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
      }
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [isCameraOn, isMinimized, isAnsweredAndConnected, localMediaTick, remoteMediaTick, activeCall?.id]);

  // WebRTC PeerConnection & Full ICE-bundled SDP signaling synchronization via Firestore
  useEffect(() => {
    if (!activeCall || !activeCallConv || !localMediaReady || activeCall.status === 'declined') {
      return;
    }

    const ensurePeerConnection = () => {
      if (peerConnectionRef.current) return peerConnectionRef.current;
      if (typeof window === 'undefined' || !window.RTCPeerConnection) return null;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      const inboundStream = new MediaStream();
      remoteStreamRef.current = inboundStream;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          event.streams[0].getTracks().forEach((t) => {
            if (!inboundStream.getTracks().some((existing) => existing.id === t.id)) {
              inboundStream.addTrack(t);
            }
          });
        } else if (event.track) {
          if (!inboundStream.getTracks().some((existing) => existing.id === event.track.id)) {
            inboundStream.addTrack(event.track);
          }
        }

        remoteStreamRef.current = inboundStream;
        setHasRemoteVideoTrack(inboundStream.getVideoTracks().length > 0);
        setHasRemoteAudioTrack(inboundStream.getAudioTracks().length > 0);
        setRemoteMediaTick((t) => t + 1);

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = inboundStream;
          remoteVideoRef.current.play().catch(() => {});
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = inboundStream;
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        setRtcConnected(pc.connectionState === 'connected');
      };

      return pc;
    };

    const syncWebRtcSignaling = async () => {
      try {
        const pc = ensurePeerConnection();
        if (!pc) return;

        const currentVersion = activeCall.sdpVersion || 1;

        // 1. Caller creates initial Offer SDP (with bundled ICE candidates)
        if (activeCall.callerId === currentUserId && !activeCall.offerSdp) {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await pc.setLocalDescription(offer);
          await waitForIceGathering(pc, 1800);

          const finalOffer = pc.localDescription || offer;
          appliedOfferVersionRef.current = currentVersion;

          onUpdateParticipantState(
            activeCallConv.id,
            activeCall,
            {},
            {
              offerSdp: JSON.stringify(finalOffer),
              sdpVersion: currentVersion,
            }
          );
          return;
        }

        // 2. Callee receives Offer SDP and creates Answer SDP once they have accepted the call
        if (
          activeCall.callerId !== currentUserId &&
          activeCall.offerSdp &&
          appliedOfferVersionRef.current < currentVersion
        ) {
          appliedOfferVersionRef.current = currentVersion;
          const offerDesc = JSON.parse(activeCall.offerSdp);
          await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await waitForIceGathering(pc, 1800);

          const finalAnswer = pc.localDescription || answer;
          onUpdateParticipantState(
            activeCallConv.id,
            activeCall,
            {},
            {
              answerSdp: JSON.stringify(finalAnswer),
              sdpVersion: currentVersion,
              status: 'active',
              connectedAt: activeCall.connectedAt || new Date().toISOString(),
            }
          );
          return;
        }

        // 3. Caller applies Answer SDP from Callee
        if (
          activeCall.callerId === currentUserId &&
          activeCall.answerSdp &&
          appliedAnswerVersionRef.current < currentVersion &&
          pc.signalingState === 'have-local-offer'
        ) {
          appliedAnswerVersionRef.current = currentVersion;
          const answerDesc = JSON.parse(activeCall.answerSdp);
          await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
        }
      } catch {
        // Non-fatal WebRTC negotiation state transition
      }
    };

    syncWebRtcSignaling();
  }, [
    localMediaReady,
    activeCall?.id,
    activeCall?.offerSdp,
    activeCall?.answerSdp,
    activeCall?.sdpVersion,
    activeCall?.status,
  ]);

  /**
   * Acquires Phone / Tablet / Desktop Camera and Microphone tracks INDEPENDENTLY
   * so that an audio permission issue never blocks the phone camera, and vice versa.
   */
  const startLocalMedia = async (
    wantVideo: boolean,
    wantMuted: boolean,
    facing: 'user' | 'environment' = 'user',
    specificDeviceId?: string
  ) => {
    setCameraPermissionNote(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setLocalMediaReady(true);
      setCameraPermissionNote(
        'Camera/Mic requires a secure HTTPS connection or opening the app directly in your phone browser tab.'
      );
      return;
    }

    const combinedStream = new MediaStream();
    let videoErrorName = '';
    let audioErrorName = '';

    // 1. Acquire Real Camera Video Track (if wantVideo is true)
    if (wantVideo) {
      const videoAttempts: MediaStreamConstraints['video'][] = specificDeviceId
        ? [{ deviceId: { exact: specificDeviceId } }, { facingMode: facing }, true]
        : [
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
          videoErrorName = '';
          break;
        } catch (err: any) {
          videoErrorName = err?.name || err?.message || 'CameraError';
        }
      }

      // Enumerate available cameras on phone/tablet (front/back lenses)
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === 'videoinput' && d.deviceId);
        setVideoDeviceIds(cams.map((c) => c.deviceId));
      } catch {
        // Ignore enumeration errors
      }
    }

    // 2. Acquire Real Microphone Audio Track independently
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
        const fallbackAudio = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        fallbackAudio.getAudioTracks().forEach((t) => {
          t.enabled = !wantMuted;
          combinedStream.addTrack(t);
        });
      } catch (err: any) {
        audioErrorName = err?.name || err?.message || 'MicError';
      }
    }

    // Stop previous tracks before replacing
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
      setLocalMediaReady(true);

      if (localVideoRef.current && hasVid) {
        localVideoRef.current.setAttribute('playsinline', 'true');
        localVideoRef.current.setAttribute('webkit-playsinline', 'true');
        localVideoRef.current.muted = true;
        localVideoRef.current.srcObject = combinedStream;
        localVideoRef.current.play().catch(() => {});
      }

      if (hasAud) {
        startMicAnalyzer(combinedStream);
      }

      if (wantVideo && !hasVid) {
        setCameraPermissionNote(
          `Phone camera blocked (${videoErrorName}). Tap "Enable Camera" below and allow browser camera access.`
        );
      } else if (!hasAud) {
        setCameraPermissionNote(
          `Microphone blocked (${audioErrorName}). Tap "Enable Camera/Mic" below to allow voice.`
        );
      } else {
        setCameraPermissionNote(null);
      }

      // Update active RTCPeerConnection senders
      if (peerConnectionRef.current) {
        const pc = peerConnectionRef.current;
        const senders = pc.getSenders();
        combinedStream.getTracks().forEach((track) => {
          const existingSender = senders.find((s) => s.track?.kind === track.kind);
          if (existingSender) {
            existingSender.replaceTrack(track).catch(() => {});
          } else {
            pc.addTrack(track, combinedStream);
          }
        });
      }
    } else {
      setHasLocalVideoTrack(false);
      setHasLocalAudioTrack(false);
      setLocalMediaReady(true);
      setCameraPermissionNote(
        `Browser blocked Camera/Mic (${
          videoErrorName || audioErrorName || 'Permission Denied'
        }). Tap "Allow Camera & Mic" below or open the app URL directly in your phone browser.`
      );
    }
  };

  const stopAllMediaStreams = () => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
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
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    remoteStreamRef.current = null;
    setHasLocalVideoTrack(false);
    setHasLocalAudioTrack(false);
    setHasRemoteVideoTrack(false);
    setHasRemoteAudioTrack(false);
    setLocalMediaReady(false);
    setRtcConnected(false);
    setMicLevel(0);
    setIsScreenSharing(false);
  };

  const renegotiateIfCaller = async () => {
    if (!activeCallConv || !activeCall || !peerConnectionRef.current) return;
    const pc = peerConnectionRef.current;
    if (activeCall.callerId !== currentUserId) return;
    try {
      const nextVersion = (activeCall.sdpVersion || 1) + 1;
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc, 1500);
      appliedOfferVersionRef.current = nextVersion;
      onUpdateParticipantState(
        activeCallConv.id,
        activeCall,
        {},
        {
          offerSdp: JSON.stringify(pc.localDescription || offer),
          answerSdp: '',
          sdpVersion: nextVersion,
        }
      );
    } catch {
      // Ignore renegotiation race
    }
  };

  const handleToggleMute = async () => {
    if (!activeCallConv || !activeCall) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (
      !nextMuted &&
      (!localStreamRef.current || localStreamRef.current.getAudioTracks().length === 0)
    ) {
      await startLocalMedia(isCameraOn, false, cameraFacingMode);
    } else if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
    }

    onUpdateParticipantState(activeCallConv.id, activeCall, {
      isMuted: nextMuted,
    });
  };

  const handleToggleCamera = async () => {
    if (!activeCallConv || !activeCall) return;
    const nextCamera = !isCameraOn;

    if (nextCamera) {
      await startLocalMedia(true, isMuted, cameraFacingMode);
      await renegotiateIfCaller();
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => {
          t.stop();
          localStreamRef.current?.removeTrack(t);
        });
      }
      setHasLocalVideoTrack(false);
      setIsCameraOn(false);
      setLocalMediaTick((t) => t + 1);
    }

    onUpdateParticipantState(activeCallConv.id, activeCall, {
      isCameraOn: nextCamera,
    });
  };

  // Switch between Front ('user') and Back ('environment') camera on mobile/tablet
  const handleFlipCamera = async () => {
    if (!activeCallConv || !activeCall) return;
    const nextFacing = cameraFacingMode === 'user' ? 'environment' : 'user';
    setCameraFacingMode(nextFacing);

    if (videoDeviceIds.length > 1) {
      const nextIdx = (currentDeviceIndex + 1) % videoDeviceIds.length;
      setCurrentDeviceIndex(nextIdx);
      await startLocalMedia(true, isMuted, nextFacing, videoDeviceIds[nextIdx]);
    } else {
      await startLocalMedia(true, isMuted, nextFacing);
    }
    await renegotiateIfCaller();
  };

  const handleToggleScreenShare = async () => {
    if (!activeCallConv || !activeCall) return;

    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
      onUpdateParticipantState(
        activeCallConv.id,
        activeCall,
        { isScreenSharing: false },
        {
          screenSharerId:
            activeCall.screenSharerId === currentUserId ? '' : activeCall.screenSharerId,
          screenSharerName:
            activeCall.screenSharerId === currentUserId ? '' : activeCall.screenSharerName,
        }
      );
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia) {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        screenStreamRef.current = displayStream;
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = displayStream;
          screenVideoRef.current.play().catch(() => {});
        }

        displayStream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          screenStreamRef.current = null;
          onUpdateParticipantState(
            activeCallConv.id,
            activeCall,
            { isScreenSharing: false },
            { screenSharerId: '', screenSharerName: '' }
          );
        };
      }
      setIsScreenSharing(true);
      onUpdateParticipantState(
        activeCallConv.id,
        activeCall,
        { isScreenSharing: true },
        {
          screenSharerId: currentUserId,
          screenSharerName: currentUserName,
        }
      );
    } catch {
      setIsScreenSharing(true);
      onUpdateParticipantState(
        activeCallConv.id,
        activeCall,
        { isScreenSharing: true },
        {
          screenSharerId: currentUserId,
          screenSharerName: currentUserName,
        }
      );
    }
  };

  const handleHangUp = () => {
    if (!activeCallConv) return;
    const reason = isAnsweredAndConnected ? 'ended' : 'missed';
    stopAllMediaStreams();
    onEndOrLeaveCall(activeCallConv, isAnsweredAndConnected ? callElapsedSeconds : 0, reason);
  };

  // ============================================================================
  // 1. INCOMING CALL SCREEN (Telegram / WhatsApp Style for Recipient)
  // ============================================================================
  if (incomingCall && incomingCallConv) {
    const callerProfile = allUsers?.find((u) => u.id === incomingCall.callerId);
    return (
      <div className="fixed inset-0 z-[75] bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="w-full max-w-sm rounded-[36px] bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 text-white border border-emerald-500/30 shadow-[0_24px_80px_rgba(16,185,129,0.25)] p-6 sm:p-8 flex flex-col items-center text-center space-y-6">
          <div className="flex items-center justify-between w-full">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-widest">
              <Radio className="h-3 w-3 animate-pulse" />
              Incoming {incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call
            </span>
            <button
              type="button"
              onClick={() => setIsRingtoneMuted((m) => !m)}
              className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300"
              title={isRingtoneMuted ? 'Unmute Ringtone' : 'Silence Ringtone'}
            >
              {isRingtoneMuted ? (
                <VolumeX className="h-4 w-4 text-rose-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-emerald-400" />
              )}
            </button>
          </div>

          {/* Pulsing Caller Avatar */}
          <div className="relative my-2">
            <span className="absolute -inset-4 rounded-full bg-emerald-500/20 animate-ping" />
            <span className="absolute -inset-2 rounded-full bg-emerald-500/30 animate-pulse" />
            <Avatar className="h-24 w-24 sm:h-28 sm:w-28 border-4 border-emerald-500/60 shadow-2xl relative z-10">
              <AvatarImage src={callerProfile?.profilePhoto} />
              <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-700 text-white text-2xl sm:text-3xl font-black">
                {(incomingCall.callerName || 'OF').substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              {incomingCall.callerName}
            </h2>
            <p className="text-xs font-semibold text-emerald-400 animate-pulse">
              {incomingCall.conversationType === 'group'
                ? `Calling in ${incomingCall.conversationName}...`
                : `Ringing • Waiting for you to answer...`}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 w-full pt-4 border-t border-white/10">
            <Button
              type="button"
              onClick={() => onAcceptIncomingCall(incomingCallConv, true)}
              className="h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1 shadow-lg shadow-emerald-500/30"
            >
              <Video className="h-5 w-5" />
              <span>Answer Video</span>
            </Button>
            <Button
              type="button"
              onClick={() => onAcceptIncomingCall(incomingCallConv, false)}
              className="h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1 shadow-lg shadow-blue-600/30"
            >
              <PhoneCall className="h-5 w-5" />
              <span>Answer Voice</span>
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setDeclinedCallIds((prev) => new Set(prev).add(incomingCall.id));
                onDeclineIncomingCall(incomingCallConv);
              }}
              className="h-14 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1 shadow-lg shadow-rose-600/30"
            >
              <PhoneOff className="h-5 w-5" />
              <span>Decline</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeCall || !activeCallConv) return null;

  const participantsList: CallParticipantState[] = Object.values(
    activeCall.participants || {}
  ).filter((p) => activeCall.activeParticipantIds?.includes(p.uid));

  if (!participantsList.some((p) => p.uid === currentUserId)) {
    participantsList.unshift({
      uid: currentUserId,
      name: currentUserName,
      role: currentUserRole,
      photoUrl: currentUserPhoto,
      isMuted,
      isCameraOn,
      isScreenSharing,
      joinedAt: new Date().toISOString(),
    });
  }

  // Find target recipient profile for 1-on-1 DM outgoing ringing screen
  const otherTargetUid = (activeCall.targetMemberIds || []).find((id) => id !== currentUserId);
  const targetRecipientProfile =
    otherTargetUid && allUsers ? allUsers.find((u) => u.id === otherTargetUid) || null : null;

  // ============================================================================
  // 2. MINIMIZED FLOATING CALL BAR
  // ============================================================================
  if (isMinimized) {
    return (
      <div className="fixed bottom-24 lg:bottom-6 inset-x-3 sm:left-auto sm:right-6 z-[65] max-w-sm mx-auto sm:mx-0 animate-in fade-in duration-200">
        <audio ref={setRemoteAudioEl} autoPlay playsInline className="hidden" />
        <div className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-2xl bg-slate-950/95 text-white border border-white/15 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              {isCameraOn ? <Video className="h-4 w-4" /> : <PhoneCall className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-tight truncate max-w-[140px]">
                {activeCall.conversationName}
              </p>
              <p className="text-[10px] font-mono text-emerald-400 font-bold truncate">
                {!isAnsweredAndConnected
                  ? 'Ringing • Waiting for answer...'
                  : `${formatCallDuration(callElapsedSeconds)} • Connected`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleMute}
              className={cn(
                'h-8 w-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
                isMuted
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-white/10 text-white hover:bg-white/20'
              )}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Expand Call Console"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleHangUp}
              className="h-8 w-8 rounded-lg bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center transition-colors cursor-pointer"
              title="End Call"
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 3. TELEGRAM-STYLE OUTGOING CALL / RINGING SCREEN (Waits until recipient answers!)
  // ============================================================================
  if (!isAnsweredAndConnected) {
    return (
      <div className="fixed inset-0 z-[70] h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-slate-950 text-white flex flex-col justify-between p-4 sm:p-6 animate-in fade-in duration-300">
        {/* Background Live Camera Preview if Video Call is active while ringing */}
        {isCameraOn && hasLocalVideoTrack && (
          <video
            key={`ringing-local-vid-${localMediaTick}`}
            ref={setLocalVideoEl}
            autoPlay
            playsInline
            muted
            className={cn(
              'absolute inset-0 w-full h-full object-cover opacity-45',
              cameraFacingMode === 'user' && '-scale-x-100'
            )}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/60 to-slate-950/90 pointer-events-none" />

        {/* Top Bar */}
        <div className="relative z-10 flex items-center justify-between max-w-2xl w-full mx-auto">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[10px] sm:text-xs font-black uppercase tracking-widest text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            {callStatusBanner
              ? callStatusBanner
              : ringingElapsedSeconds < 3
              ? 'Calling...'
              : 'Ringing • Waiting for answer...'}
          </span>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsRingtoneMuted((m) => !m)}
              className="h-9 rounded-xl bg-white/10 border-white/15 text-white hover:bg-white/20 text-xs font-bold px-3"
              title={isRingtoneMuted ? 'Unmute Ringback Tone' : 'Mute Ringback Tone'}
            >
              {isRingtoneMuted ? (
                <VolumeX className="h-4 w-4 text-rose-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-emerald-400" />
              )}
            </Button>
            {isCameraOn && hasLocalVideoTrack && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleFlipCamera}
                className="h-9 rounded-xl bg-white/10 border-white/15 text-white hover:bg-white/20 text-xs font-bold px-3"
              >
                <SwitchCamera className="h-4 w-4 mr-1.5" /> Flip Cam
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsMinimized(true)}
              className="h-9 rounded-xl bg-white/10 border-white/15 text-white hover:bg-white/20 text-xs font-bold px-3"
            >
              <Minimize2 className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Minimize</span>
            </Button>
          </div>
        </div>

        {/* Center Recipient Avatar & Ringing Status (Telegram / WhatsApp Style) */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center my-auto space-y-5 px-4">
          <div className="relative">
            {!callStatusBanner && (
              <>
                <span className="absolute -inset-6 rounded-full border border-emerald-500/25 animate-ping" />
                <span className="absolute -inset-3 rounded-full border-2 border-emerald-400/40 animate-pulse" />
              </>
            )}
            <Avatar className="h-28 w-28 sm:h-36 sm:w-36 border-4 border-white/20 shadow-2xl relative z-10">
              <AvatarImage src={targetRecipientProfile?.profilePhoto} />
              <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-800 text-white text-3xl sm:text-4xl font-black">
                {(activeCall.conversationName || 'OF').substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {activeCall.conversationName}
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-emerald-400">
              {callStatusBanner
                ? callStatusBanner
                : `Ringing ${activeCall.conversationName} • Waiting for them to pick up...`}
            </p>
            <p className="text-[11px] text-slate-400">
              {hasLocalVideoTrack
                ? 'Your phone/device camera preview is live'
                : hasLocalAudioTrack
                ? 'Your microphone is ready'
                : 'Connecting your hardware camera & microphone...'}
            </p>
          </div>

          {/* Direct Tap Button if phone browser blocked automatic getUserMedia */}
          {cameraPermissionNote && (
            <div className="max-w-md w-full rounded-2xl bg-slate-900/90 border border-amber-500/40 p-3.5 space-y-2.5 text-center shadow-xl">
              <p className="text-xs text-amber-200 font-semibold leading-relaxed">
                {cameraPermissionNote}
              </p>
              <Button
                type="button"
                onClick={() => startLocalMedia(true, isMuted, cameraFacingMode)}
                className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider"
              >
                <Camera className="h-4 w-4 mr-1.5" /> Tap to Enable Phone Camera & Mic
              </Button>
            </div>
          )}
        </div>

        {/* Bottom Outgoing Call Control Dock */}
        <div className="relative z-10 max-w-md w-full mx-auto bg-slate-900/95 border border-white/15 rounded-3xl p-3 grid grid-cols-3 gap-2.5 shadow-2xl">
          <Button
            type="button"
            onClick={handleToggleMute}
            className={cn(
              'h-13 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-wider flex flex-col items-center justify-center gap-1',
              isMuted
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-white/10 hover:bg-white/20 text-white'
            )}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            <span>{isMuted ? 'Unmute' : 'Mute'}</span>
          </Button>

          <Button
            type="button"
            onClick={handleToggleCamera}
            className={cn(
              'h-13 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-wider flex flex-col items-center justify-center gap-1',
              isCameraOn
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-white/10 hover:bg-white/20 text-white'
            )}
          >
            {isCameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            <span>{isCameraOn ? 'Cam On' : 'Cam Off'}</span>
          </Button>

          <Button
            type="button"
            variant="destructive"
            onClick={handleHangUp}
            className="h-13 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] sm:text-xs uppercase tracking-wider flex flex-col items-center justify-center gap-1 shadow-xl shadow-rose-600/30"
          >
            <PhoneOff className="h-4 w-4" />
            <span>Cancel Call</span>
          </Button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 4. CONNECTED ACTIVE CALL CONSOLE (After Recipient Answers!)
  // ============================================================================
  return (
    <div className="fixed inset-0 z-[70] h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-slate-950/95 backdrop-blur-xl flex flex-col justify-between p-2.5 sm:p-5 animate-in fade-in duration-300">
      {/* Persistent Remote Voice Audio Output */}
      <audio ref={setRemoteAudioEl} autoPlay playsInline className="hidden" />

      {/* Top Call Status Header */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 max-w-6xl w-full mx-auto bg-slate-900/90 border border-white/10 rounded-2xl px-3.5 py-2.5 sm:px-5 sm:py-3.5 text-white shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            {isCameraOn || activeCall.callType === 'video' ? (
              <Video className="h-4 w-4 sm:h-5 sm:w-5" />
            ) : (
              <PhoneCall className="h-4 w-4 sm:h-5 sm:w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h3 className="text-xs sm:text-base font-black uppercase tracking-tight truncate max-w-[140px] sm:max-w-xs">
                {activeCall.conversationName}
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] sm:text-[10px] font-black uppercase tracking-widest shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {formatCallDuration(callElapsedSeconds)}
              </span>
              {hasLocalAudioTrack && !isMuted && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[9px] font-black uppercase tracking-widest">
                  Mic Live
                </span>
              )}
              {rtcConnected && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-black uppercase tracking-widest">
                  HD Linked
                </span>
              )}
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
              {participantsList.length}{' '}
              {participantsList.length === 1 ? 'Participant' : 'Participants'} Connected
              {activeCall.screenSharerName
                ? ` • ${activeCall.screenSharerName} sharing screen`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {isCameraOn && hasLocalVideoTrack && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFlipCamera}
              className="h-8 sm:h-9 rounded-xl bg-white/5 border-white/15 text-white hover:bg-white/15 text-[10px] sm:text-xs font-bold px-2.5"
              title="Switch Front / Rear Camera (Phone & Tablet)"
            >
              <SwitchCamera className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Flip Cam</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsMinimized(true)}
            className="h-8 sm:h-9 rounded-xl bg-white/5 border-white/15 text-white hover:bg-white/15 text-[10px] sm:text-xs font-bold px-2.5 sm:px-3"
          >
            <Minimize2 className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Minimize</span>
          </Button>
        </div>
      </div>

      {/* Center Stage: Screen Share Presentation + Participant Video/Avatar Grid */}
      <div className="flex-1 max-w-6xl w-full mx-auto my-2 sm:my-4 flex flex-col lg:flex-row gap-2.5 sm:gap-4 overflow-y-auto min-h-0">
        {/* Screen Share Stage (if active) */}
        {(isScreenSharing || activeCall.screenSharerId) && (
          <div className="flex-1 lg:flex-[2] min-h-[200px] sm:min-h-[260px] rounded-2xl sm:rounded-3xl bg-slate-900 border border-indigo-500/40 overflow-hidden relative flex flex-col justify-between p-3 sm:p-4 shadow-2xl shrink-0">
            <div className="flex items-center justify-between z-10 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 w-fit">
              <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider text-indigo-300">
                <MonitorUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-400 animate-pulse" />
                {isScreenSharing
                  ? 'You are sharing your screen'
                  : `${activeCall.screenSharerName || 'Official'}'s Shared Screen`}
              </span>
            </div>

            <div className="flex-1 flex items-center justify-center relative my-2 rounded-xl sm:rounded-2xl overflow-hidden bg-slate-950 border border-white/5 min-h-[140px]">
              {isScreenSharing && screenStreamRef.current ? (
                <video
                  ref={setScreenVideoEl}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="p-4 sm:p-8 text-center space-y-2 max-w-md">
                  <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto">
                    <MonitorUp className="h-6 w-6 sm:h-8 sm:w-8" />
                  </div>
                  <p className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                    Live Bureau Workspace Screen Stream
                  </p>
                  <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
                    {isScreenSharing
                      ? 'Your active Fayda Bureau workspace is being broadcast to all call participants.'
                      : `Viewing ${activeCall.screenSharerName || 'Official'}'s live screen presentation.`}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Participant Video / Avatar Tiles Grid */}
        <div
          className={cn(
            'flex-1 grid gap-2.5 sm:gap-4 overflow-y-auto p-0.5 min-h-0',
            participantsList.length <= 1
              ? 'grid-cols-1'
              : participantsList.length === 2
              ? 'grid-cols-1 sm:grid-cols-2'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          )}
        >
          {participantsList.map((participant) => {
            const isMe = participant.uid === currentUserId;
            const userProfile = allUsers?.find((u) => u.id === participant.uid);
            const showCamera = isMe ? isCameraOn : participant.isCameraOn;
            const mutedState = isMe ? isMuted : participant.isMuted;

            return (
              <div
                key={participant.uid}
                className="relative rounded-2xl sm:rounded-3xl bg-slate-900 border border-white/10 overflow-hidden flex flex-col items-center justify-center min-h-[180px] sm:min-h-[240px] shadow-xl group"
              >
                {showCamera ? (
                  isMe && hasLocalVideoTrack ? (
                    <video
                      key={`local-vid-${localMediaTick}`}
                      ref={setLocalVideoEl}
                      autoPlay
                      playsInline
                      muted
                      className={cn(
                        'absolute inset-0 w-full h-full object-cover',
                        cameraFacingMode === 'user' && '-scale-x-100'
                      )}
                    />
                  ) : !isMe && hasRemoteVideoTrack ? (
                    <video
                      key={`remote-vid-${remoteMediaTick}`}
                      ref={setRemoteVideoEl}
                      autoPlay
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950/70 to-slate-900 flex flex-col items-center justify-center p-4 text-center">
                      <Avatar className="h-16 w-16 sm:h-24 sm:w-24 border-2 border-primary/50 shadow-2xl">
                        <AvatarImage src={participant.photoUrl || userProfile?.profilePhoto} />
                        <AvatarFallback className="bg-primary text-white text-lg sm:text-2xl font-black">
                          {(participant.name || 'OF').substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {isMe ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => startLocalMedia(true, isMuted, cameraFacingMode)}
                          className="mt-3 h-8 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider"
                        >
                          <Camera className="h-3.5 w-3.5 mr-1.5" /> Tap to Enable Phone Camera
                        </Button>
                      ) : (
                        <span className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] sm:text-[10px] font-bold">
                          Connecting Remote Video...
                        </span>
                      )}
                    </div>
                  )
                ) : (
                  /* Voice Mode Avatar Tile with Live Voice Level Ring */
                  <div className="flex flex-col items-center justify-center gap-2 sm:gap-3 p-4 sm:p-6">
                    <div className="relative">
                      {!mutedState && (
                        <span
                          className="absolute -inset-2.5 rounded-full border-2 border-emerald-400/60 transition-transform duration-100"
                          style={{
                            transform: isMe
                              ? `scale(${1 + Math.min(0.35, micLevel / 220)})`
                              : undefined,
                          }}
                        />
                      )}
                      <Avatar className="h-16 w-16 sm:h-24 sm:w-24 border-2 border-white/20 shadow-2xl">
                        <AvatarImage src={participant.photoUrl || userProfile?.profilePhoto} />
                        <AvatarFallback className="bg-slate-800 text-white text-lg sm:text-2xl font-black">
                          {(participant.name || 'OF').substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-300 font-semibold">
                      <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>
                        {mutedState
                          ? 'Microphone Muted'
                          : isMe && hasLocalAudioTrack
                          ? 'Real Voice Mic Active'
                          : !isMe && hasRemoteAudioTrack
                          ? 'Live Remote Voice'
                          : 'Voice Channel Connected'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Bottom Overlay Participant Badge + Live Voice Meter */}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur-md border border-white/10 text-white">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] sm:text-xs font-black truncate">
                      {participant.name} {isMe ? '(You)' : ''}
                    </span>
                    {participant.isScreenSharing && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 text-[8px] sm:text-[9px] font-black uppercase shrink-0">
                        Screen
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isMe && !mutedState && hasLocalAudioTrack && (
                      <div
                        className="flex items-end gap-0.5 h-3.5"
                        title="Live Microphone Voice Level"
                      >
                        {[15, 35, 60, 80].map((thresh, i) => (
                          <span
                            key={i}
                            className={cn(
                              'w-1 rounded-full transition-all duration-75',
                              micLevel >= thresh ? 'bg-emerald-400' : 'bg-white/20'
                            )}
                            style={{ height: `${(i + 1) * 25}%` }}
                          />
                        ))}
                      </div>
                    )}
                    {mutedState ? (
                      <span className="h-5 w-5 sm:h-6 sm:w-6 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                        <MicOff className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      </span>
                    ) : (
                      <span className="h-5 w-5 sm:h-6 sm:w-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <Mic className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Camera / Permission Notice + Direct User-Gesture Enable Button */}
      {cameraPermissionNote && (
        <div className="max-w-xl mx-auto mb-1.5 px-3 py-1.5 rounded-2xl bg-slate-900 border border-amber-500/40 text-amber-200 text-[10px] sm:text-[11px] font-semibold flex flex-wrap items-center justify-center gap-2 shrink-0">
          <span className="text-center">{cameraPermissionNote}</span>
          <Button
            type="button"
            size="sm"
            onClick={() => startLocalMedia(true, isMuted, cameraFacingMode)}
            className="h-7 px-2.5 text-[10px] font-black uppercase tracking-wider rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shrink-0"
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Allow Camera & Mic
          </Button>
        </div>
      )}

      {/* Bottom Call Control Dock — Responsive on Mobile, Tablet & Desktop */}
      <div className="max-w-xl w-full mx-auto bg-slate-900/95 border border-white/15 rounded-2xl sm:rounded-3xl p-2 sm:px-6 sm:py-4 grid grid-cols-4 sm:flex sm:items-center sm:justify-center gap-2 sm:gap-3.5 shadow-2xl shrink-0">
        <Button
          type="button"
          onClick={handleToggleMute}
          className={cn(
            'h-12 sm:h-12 px-2 sm:px-5 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-wider flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all',
            isMuted
              ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
              : 'bg-white/10 hover:bg-white/20 text-white'
          )}
        >
          {isMuted ? <MicOff className="h-4 w-4 shrink-0" /> : <Mic className="h-4 w-4 shrink-0" />}
          <span className="truncate">{isMuted ? 'Unmute' : 'Mute'}</span>
        </Button>

        <Button
          type="button"
          onClick={handleToggleCamera}
          className={cn(
            'h-12 sm:h-12 px-2 sm:px-5 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-wider flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all',
            isCameraOn
              ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30'
              : 'bg-white/10 hover:bg-white/20 text-white'
          )}
        >
          {isCameraOn ? (
            <Video className="h-4 w-4 shrink-0" />
          ) : (
            <VideoOff className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate">{isCameraOn ? 'Cam On' : 'Cam Off'}</span>
        </Button>

        <Button
          type="button"
          onClick={handleToggleScreenShare}
          className={cn(
            'h-12 sm:h-12 px-2 sm:px-5 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-wider flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all',
            isScreenSharing
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-white/10 hover:bg-white/20 text-white'
          )}
        >
          {isScreenSharing ? (
            <MonitorOff className="h-4 w-4 shrink-0" />
          ) : (
            <MonitorUp className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate">{isScreenSharing ? 'Stop' : 'Screen'}</span>
        </Button>

        <Button
          type="button"
          variant="destructive"
          onClick={handleHangUp}
          className="h-12 sm:h-12 px-2 sm:px-6 rounded-xl sm:rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] sm:text-xs uppercase tracking-wider flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 shadow-xl shadow-rose-600/30"
        >
          <PhoneOff className="h-4 w-4 shrink-0" />
          <span className="truncate">End Call</span>
        </Button>
      </div>
    </div>
  );
}
