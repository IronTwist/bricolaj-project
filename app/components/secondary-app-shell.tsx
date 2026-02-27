"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Camera,
  Download,
  HardDrive,
  History,
  Home,
  Monitor,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  StopCircle,
  Trash2,
  Wifi,
  WifiOff,
  X,
  ZoomIn,
} from "lucide-react";
import type { FirebaseOptions } from "firebase/app";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  arrayUnion,
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCustomToken,
  type Auth,
} from "firebase/auth";

interface SecondaryAppShellProps {
  isDarkMode?: boolean;
}

type AppView = "home" | "camera" | "monitor" | "history";
type ConnStatus = "DISCONNECTED" | "NEGOTIATING" | "LIVE";

interface LocalRecording {
  id: string;
  timestamp: number;
  data: Blob;
  size: string;
}

interface RemoteRecording {
  id: string;
  timestamp: number;
  size: string;
}

interface PlayingVideo {
  id: string;
  url: string;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};

const secamAppId =
  process.env.NEXT_PUBLIC_SECAM_APP_ID || "moto-cam-enterprise-v2";
const initialAuthToken = process.env.NEXT_PUBLIC_SECAM_INITIAL_AUTH_TOKEN;

function buildFirebaseConfig(): FirebaseOptions | null {
  if (process.env.NEXT_PUBLIC_FIREBASE_CONFIG_JSON) {
    try {
      return JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG_JSON);
    } catch {
      return null;
    }
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId =
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) return null;

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

const firebaseConfig = buildFirebaseConfig();

export function SecondaryAppShell({
  isDarkMode = false,
}: SecondaryAppShellProps) {
  const [view, setView] = useState<AppView>("home");
  const [sessionId, setSessionId] = useState("security-cam123");
  const [isAuthLoading, setIsAuthLoading] = useState(Boolean(firebaseConfig));

  const [connStatus, setConnStatus] = useState<ConnStatus>("DISCONNECTED");
  const [statusMsg, setStatusMsg] = useState("Sistem pregatit");
  const [recordings, setRecordings] = useState<LocalRecording[]>([]);
  const [remoteRecordings, setRemoteRecordings] = useState<RemoteRecording[]>(
    [],
  );
  const [zoom, setZoom] = useState(1);
  const [playingVideo, setPlayingVideo] = useState<PlayingVideo | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const idbRef = useRef<IDBDatabase | null>(null);
  const authRef = useRef<Auth | null>(null);
  const dbRef = useRef<Firestore | null>(null);

  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalingUnsubRef = useRef<(() => void) | null>(null);
  const metadataUnsubRef = useRef<(() => void) | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttemptsRef = useRef<number>(5);
  const remoteMediaRecorderRef = useRef<MediaRecorder | null>(null);

  const rtcProcessed = useRef<{
    offerId: number | null;
    answerId: number | null;
  }>({
    offerId: null,
    answerId: null,
  });
  const processedOfferCandidatesRef = useRef<Set<string>>(new Set());
  const processedAnswerCandidatesRef = useRef<Set<string>>(new Set());

  function getSessionDoc(id: string) {
    if (!dbRef.current) return null;
    return doc(
      dbRef.current,
      "artifacts",
      secamAppId,
      "public",
      "data",
      "sessions",
      id,
    );
  }

  async function publishMetadata(recs: LocalRecording[]) {
    if (!dbRef.current || !authRef.current?.currentUser) return;
    const metadataDoc = doc(
      dbRef.current,
      "artifacts",
      secamAppId,
      "public",
      "data",
      "sessions",
      `${sessionId}_metadata`,
    );

    const clips = recs.map((record) => ({
      id: record.id,
      timestamp: record.timestamp,
      size: record.size,
    }));

    await setDoc(
      metadataDoc,
      { clips, lastPulse: Date.now(), active: true },
      { merge: true },
    ).catch(() => {});
  }

  function syncLocalHistory() {
    if (!idbRef.current) return;
    const tx = idbRef.current.transaction("videos", "readonly");
    const store = tx.objectStore("videos");
    const req = store.getAll();
    req.onsuccess = () => {
      const sorted = (req.result as LocalRecording[]).sort(
        (a, b) => b.timestamp - a.timestamp,
      );
      setRecordings(sorted);
      if (view === "camera") {
        void publishMetadata(sorted);
      }
    };
  }

  function cleanupSignaling() {
    if (signalingUnsubRef.current) {
      signalingUnsubRef.current();
      signalingUnsubRef.current = null;
    }
    if (metadataUnsubRef.current) {
      metadataUnsubRef.current();
      metadataUnsubRef.current = null;
    }
  }

  async function terminateAll() {
    cleanupSignaling();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      // Flush remaining data before stopping
      mediaRecorderRef.current.requestData();
      await new Promise((resolve) => {
        const tempRef = mediaRecorderRef.current;
        if (tempRef) {
          const handler = () => {
            tempRef.removeEventListener("stop", handler);
            resolve(null);
          };
          tempRef.addEventListener("stop", handler);
          tempRef.stop();
        } else {
          resolve(null);
        }
      });
    }
    
    // Clean up remote recorder
    if (
      remoteMediaRecorderRef.current &&
      remoteMediaRecorderRef.current.state !== "inactive"
    ) {
      remoteMediaRecorderRef.current.requestData();
      remoteMediaRecorderRef.current.stop();
    }
    remoteMediaRecorderRef.current = null;
    
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (dbRef.current && authRef.current?.currentUser) {
      const metadataDoc = doc(
        dbRef.current,
        "artifacts",
        secamAppId,
        "public",
        "data",
        "sessions",
        `${sessionId}_metadata`,
      );
      const sessionDoc = getSessionDoc(sessionId);
      await updateDoc(metadataDoc, { active: false, lastPulse: 0 }).catch(
        () => {},
      );
      if (sessionDoc) {
        const updates: Record<string, unknown> = { status: "DISCONNECTED" };
        if (view === "monitor") {
          // clear remote answer so camera can renegotiate
          updates.answer = null;
          updates.answerId = null;
        } else if (view === "camera") {
          updates.offer = null;
          updates.offerId = null;
        }
        await updateDoc(sessionDoc, updates).catch(() => {});
      }
    }

    localStreamRef.current = null;
    remoteStreamRef.current = null;
    processedOfferCandidatesRef.current.clear();
    processedAnswerCandidatesRef.current.clear();
    setConnStatus("DISCONNECTED");
    setStatusMsg("Sistem pregatit");
    setView("home");
  }

  const applyZoom = useCallback(async (value: string) => {
    const zoomLevel = Number(value);
    setZoom(zoomLevel);

    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;

    const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
      zoom?: { min: number; max: number };
    };

    if (capabilities.zoom) {
      try {
        await track.applyConstraints({
          advanced: [{ zoom: zoomLevel }],
        } as unknown as {
          advanced: MediaTrackConstraintSet[];
        });
      } catch {
        // fallback silent
      }
    }
  }, []);

  const startCameraNode = async () => {
    if (!dbRef.current || !authRef.current?.currentUser) {
      setStatusMsg("Firebase/Auth nu sunt configurate");
      return;
    }

    setStatusMsg("Activare senzori Motorola...");
    setConnStatus("NEGOTIATING");
    rtcProcessed.current = { offerId: null, answerId: null };
    processedAnswerCandidatesRef.current.clear();
    cleanupSignaling();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const sessionDoc = getSessionDoc(sessionId);
      if (!sessionDoc) return;

      await setDoc(sessionDoc, {
        offer: null,
        answer: null,
        offerCandidates: [],
        answerCandidates: [],
        status: "PENDING",
        version: Date.now(),
      });

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate && authRef.current?.currentUser) {
          updateDoc(sessionDoc, {
            offerCandidates: arrayUnion(event.candidate.toJSON()),
          }).catch(() => {});
        }
      };

      // if connection drops, generate new offer so monitors can reconnect
      pc.onconnectionstatechange = async () => {
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed"
        ) {
          try {
            const newOffer = await pc.createOffer();
            await pc.setLocalDescription(newOffer);
            await updateDoc(sessionDoc, {
              offer: { sdp: newOffer.sdp, type: newOffer.type },
              offerId: Date.now(),
              status: "OFFERED",
            });
            // reset processed ids so monitor can answer again
            rtcProcessed.current.offerId = null;
            rtcProcessed.current.answerId = null;
          } catch {
            // ignore
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await updateDoc(sessionDoc, {
        offer: { sdp: offer.sdp, type: offer.type },
        offerId: Date.now(),
        status: "OFFERED",
      });

      signalingUnsubRef.current = onSnapshot(sessionDoc, (snapshot) => {
        const data = snapshot.data();
        if (!data || !pcRef.current) return;

        if (
          data.answer &&
          pc.signalingState === "have-local-offer" &&
          rtcProcessed.current.answerId !== data.answerId
        ) {
          rtcProcessed.current.answerId = data.answerId as number;
          pc.setRemoteDescription(new RTCSessionDescription(data.answer))
            .then(() => setConnStatus("LIVE"))
            .catch(() => {});
        }

        if (data.answerCandidates && pc.remoteDescription) {
          (data.answerCandidates as RTCIceCandidateInit[]).forEach(
            (candidate) => {
              const key = JSON.stringify(candidate);
              if (processedAnswerCandidatesRef.current.has(key)) return;
              processedAnswerCandidatesRef.current.add(key);
              pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(
                () => {},
              );
            },
          );
        }
      });

      heartbeatTimerRef.current = setInterval(() => {
        if (!dbRef.current) return;
        const metadataDoc = doc(
          dbRef.current,
          "artifacts",
          secamAppId,
          "public",
          "data",
          "sessions",
          `${sessionId}_metadata`,
        );
        updateDoc(metadataDoc, { lastPulse: Date.now(), active: true }).catch(
          () => {},
        );
      }, 5000);

      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8",
      });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        // Save all chunks, not just > 50KB - prevents data loss
        if (event.data.size > 10_000 && idbRef.current) {
          const now = Date.now();
          const tx = idbRef.current.transaction("videos", "readwrite");
          tx.objectStore("videos").add({
            id: `rec_${now}_${Math.random()}`,
            timestamp: now,
            data: event.data,
            size: `${(event.data.size / 1048576).toFixed(2)} MB`,
          });
          tx.oncomplete = syncLocalHistory;
        }
      };
      // Record in smaller chunks (30 seconds instead of 60) to prevent data loss
      recorder.start(30_000);

      setView("camera");
      setStatusMsg("Transmisie Securizata");
    } catch {
      setStatusMsg("Eroare hardware camera");
      setConnStatus("DISCONNECTED");
    }
  };

  const startMonitorNode = async () => {
    if (!dbRef.current || !authRef.current?.currentUser) {
      setStatusMsg("Firebase/Auth nu sunt configurate");
      return;
    }

    setStatusMsg("Sincronizare cu sursa...");
    setConnStatus("NEGOTIATING");
    rtcProcessed.current = { offerId: null, answerId: null };
    processedOfferCandidatesRef.current.clear();
    cleanupSignaling();
    reconnectAttemptsRef.current = 0;

    try {
      await navigator.mediaDevices
        .getUserMedia({ audio: true })
        .catch(() => {});

      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current)
        remoteVideoRef.current.srcObject = remoteStream;

      // Setup recording for remote stream
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
          const exists = remoteStream
            .getTracks()
            .some((t) => t.id === track.id);
          if (!exists) remoteStream.addTrack(track);
        });
        
        // Start recording remote stream when we get the track
        if (!remoteMediaRecorderRef.current && remoteStream.getTracks().length > 0) {
          try {
            remoteMediaRecorderRef.current = new MediaRecorder(remoteStream, {
              mimeType: "video/webm;codecs=vp8",
            });
            remoteMediaRecorderRef.current.ondataavailable = (dataEvent) => {
              // Save all chunks to prevent data loss
              if (dataEvent.data.size > 10_000 && idbRef.current) {
                const now = Date.now();
                const tx = idbRef.current.transaction("videos", "readwrite");
                tx.objectStore("videos").add({
                  id: `rec_remote_${now}_${Math.random()}`,
                  timestamp: now,
                  data: dataEvent.data,
                  size: `${(dataEvent.data.size / 1048576).toFixed(2)} MB`,
                });
                tx.oncomplete = syncLocalHistory;
              }
            };
            remoteMediaRecorderRef.current.start(30_000);
          } catch {
            console.error("Failed to start remote recording");
          }
        }
        
        reconnectAttemptsRef.current = 0;
        setConnStatus("LIVE");
        setStatusMsg("Live Feed Motorola");
      };

      const sessionDoc = getSessionDoc(sessionId);
      if (!sessionDoc || !dbRef.current) return;
      const metadataDoc = doc(
        dbRef.current,
        "artifacts",
        secamAppId,
        "public",
        "data",
        "sessions",
        `${sessionId}_metadata`,
      );

      pc.onicecandidate = (event) => {
        if (event.candidate && authRef.current?.currentUser) {
          updateDoc(sessionDoc, {
            answerCandidates: arrayUnion(event.candidate.toJSON()),
          }).catch(() => {});
        }
      };

      signalingUnsubRef.current = onSnapshot(sessionDoc, async (snapshot) => {
        const data = snapshot.data();
        if (!data || !pcRef.current) return;

        if (
          data.offer &&
          data.status === "OFFERED" &&
          pc.signalingState === "stable" &&
          rtcProcessed.current.offerId !== data.offerId
        ) {
          rtcProcessed.current.offerId = data.offerId as number;
          try {
            await pc.setRemoteDescription(
              new RTCSessionDescription(data.offer),
            );
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await updateDoc(sessionDoc, {
              answer: { sdp: answer.sdp, type: answer.type },
              answerId: Date.now(),
              status: "ANSWERED",
            });
          } catch {
            rtcProcessed.current.offerId = null;
          }
        }

        if (data.offerCandidates && pc.remoteDescription) {
          (data.offerCandidates as RTCIceCandidateInit[]).forEach(
            (candidate) => {
              const key = JSON.stringify(candidate);
              if (processedOfferCandidatesRef.current.has(key)) return;
              processedOfferCandidatesRef.current.add(key);
              pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(
                () => {},
              );
            },
          );
        }
      });

      metadataUnsubRef.current = onSnapshot(metadataDoc, (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        setRemoteRecordings((data.clips as RemoteRecording[]) || []);
        const isAlive = Date.now() - Number(data.lastPulse || 0) < 15_000;
        if (!isAlive) {
          setConnStatus("DISCONNECTED");
          setStatusMsg("Sursa Offline - Reconectare...");
          // Attempt automatic reconnection
          void attemptReconnect();
        }
      });

      setView("monitor");
    } catch {
      setStatusMsg("Eroare initializare monitor");
      setConnStatus("DISCONNECTED");
    }
  };

  const attemptReconnect = () => {
    if (reconnectAttemptsRef.current >= maxReconnectAttemptsRef.current) {
      setStatusMsg("Reconexiune esuata - verifica sursa");
      return;
    }

    reconnectAttemptsRef.current += 1;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
    
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    
    reconnectTimerRef.current = setTimeout(() => {
      if (view === "monitor") {
        setStatusMsg(`Reconectare in curs (${reconnectAttemptsRef.current}/${maxReconnectAttemptsRef.current})...`);
        void startMonitorNode();
      }
    }, delay);
  };

  const clearStorage = () => {
    if (!idbRef.current) return;
    const tx = idbRef.current.transaction("videos", "readwrite");
    tx.objectStore("videos").clear();
    tx.oncomplete = syncLocalHistory;
  };

  const deleteRecording = (id: string) => {
    if (!idbRef.current) return;
    const tx = idbRef.current.transaction("videos", "readwrite");
    tx.objectStore("videos").delete(id);
    tx.oncomplete = syncLocalHistory;
  };

  const playRecording = (recording: LocalRecording) => {
    const url = URL.createObjectURL(recording.data);
    objectUrlsRef.current.push(url);
    setPlayingVideo({ id: recording.id, url });
  };

  const closePlayer = () => {
    if (!playingVideo) return;
    URL.revokeObjectURL(playingVideo.url);
    objectUrlsRef.current = objectUrlsRef.current.filter(
      (url) => url !== playingVideo.url,
    );
    setPlayingVideo(null);
  };

  useEffect(() => {
    let authUnsub: (() => void) | null = null;

    const request = indexedDB.open("EnterpriseStorageV2", 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("videos")) {
        db.createObjectStore("videos", { keyPath: "id" });
      }
    };
    request.onsuccess = (event) => {
      idbRef.current = (event.target as IDBOpenDBRequest).result;
      syncLocalHistory();
    };

    const bootstrap = async () => {
      if (!firebaseConfig) {
        setStatusMsg("Mode local activ (configureaza Firebase pentru cloud)");
        setIsAuthLoading(false);
        return;
      }

      try {
        const app = getApps().some(
          (existingApp) => existingApp.name === "secam",
        )
          ? getApp("secam")
          : initializeApp(firebaseConfig, "secam");

        const auth = getAuth(app);
        const db = getFirestore(app);
        authRef.current = auth;
        dbRef.current = db;

        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }

        authUnsub = onAuthStateChanged(auth, () => {
          setIsAuthLoading(false);
        });
      } catch {
        setStatusMsg("Eroare Autentificare Securizata");
        setIsAuthLoading(false);
      }
    };

    void bootstrap();

    return () => {
      if (authUnsub) authUnsub();
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
      void terminateAll();
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const recoverStream = () => {
      if (
        view === "camera" &&
        localStreamRef.current &&
        localVideoRef.current
      ) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      if (
        view === "monitor" &&
        remoteStreamRef.current &&
        remoteVideoRef.current
      ) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    };

    const timer = setTimeout(recoverStream, 100);
    return () => clearTimeout(timer);
  }, [view, connStatus]);

  if (isAuthLoading) {
    return (
      <div className="min-h-[85vh] rounded-3xl bg-slate-950 flex flex-col items-center justify-center gap-6 border border-white/5">
        <div className="relative">
          <div className="w-20 h-20 border-[3px] border-blue-500/10 border-t-blue-500 rounded-full animate-spin" />
          <ShieldCheck
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-500"
            size={32}
          />
        </div>
        <div className="text-center space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
            Encrypted Handshake
          </p>
          <p className="text-[8px] text-slate-700 font-bold uppercase">
            Enterprise Security V2
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-[85vh] rounded-3xl text-slate-100 flex flex-col select-none overflow-hidden border ${
        isDarkMode
          ? "bg-slate-950 border-white/5"
          : "bg-slate-950 border-slate-800"
      }`}
    >
      <header className="p-4 border-b border-white/5 flex justify-between items-center bg-slate-900/80 backdrop-blur-2xl sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-2xl shadow-2xl transition-all duration-700 ${
              connStatus === "LIVE"
                ? "bg-red-600 scale-110 shadow-red-900/40"
                : "bg-slate-800 shadow-black"
            }`}
          >
            <Activity
              className={
                connStatus === "LIVE"
                  ? "animate-pulse text-white"
                  : "text-slate-600"
              }
              size={20}
            />
          </div>
          <div>
            <h2 className="text-base font-black italic tracking-tighter leading-none uppercase text-white">
              SeCam <span className="text-blue-500">Ultra</span>
            </h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  connStatus === "LIVE"
                    ? "bg-green-500 shadow-[0_0_10px_#22c55e]"
                    : "bg-slate-700"
                }`}
              />
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                {statusMsg}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-slate-950/50 px-3 py-1 rounded-lg border border-white/5">
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
            ID: {sessionId}
          </span>
        </div>
      </header>

      {!firebaseConfig && (
        <div className="mx-4 mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
          <ShieldAlert size={14} />
          Firebase neconfigurat. Completeaza variabilele NEXT_PUBLIC_FIREBASE_*.
        </div>
      )}

      <main className="grow p-4 pb-24 overflow-y-auto no-scrollbar">
        {view === "home" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="bg-linear-to-br from-slate-900 via-slate-950 to-black p-8 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden ring-1 ring-white/5">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.15),transparent)] opacity-50" />
              <ShieldCheck className="absolute -right-12 -bottom-12 w-56 h-56 opacity-5 rotate-12" />
              <h3 className="text-3xl font-black mb-3 leading-tight uppercase tracking-tighter italic">
                Security Camera Enterprise
                <br />
              </h3>
              <p className="text-slate-400 text-xs opacity-90 leading-relaxed font-medium">
                Protocol P2P criptat pentru monitorizare in timp real si
                arhivare locala pe dispozitiv.
              </p>
            </div>

            <div className="bg-slate-900/40 border border-white/5 p-8 rounded-[3rem] space-y-8 backdrop-blur-md shadow-2xl ring-1 ring-white/5">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-3">
                  Identificator Terminal
                </label>
                <input
                  type="text"
                  value={sessionId}
                  onChange={(event) => setSessionId(event.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-6 py-5 font-mono text-white text-center text-2xl outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-inner"
                />
              </div>
              <div className="grid gap-4">
                <button
                  onClick={startCameraNode}
                  className="bg-white text-slate-950 p-6 rounded-2xl font-black flex items-center justify-between active:scale-95 transition-all shadow-xl hover:bg-slate-100 uppercase text-xs tracking-widest"
                >
                  Activeaza Sursa (MOTO)
                  <Camera size={24} />
                </button>
                <button
                  onClick={startMonitorNode}
                  className="bg-slate-800 p-6 rounded-2xl font-black flex items-center justify-between active:scale-95 transition-all border border-white/10 shadow-xl uppercase text-xs tracking-widest"
                >
                  Conectare Monitor
                  <Monitor size={24} className="text-blue-500" />
                </button>
              </div>
            </div>
          </div>
        )}

        {view === "camera" && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500">
            <div className="relative rounded-[3rem] overflow-hidden bg-black shadow-2xl aspect-video border border-white/5 ring-1 ring-white/10">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute top-6 left-6 flex gap-3">
                <div className="bg-red-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black flex items-center gap-2 shadow-2xl border border-white/20">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  REC LIVE
                </div>
              </div>
              <div className="absolute bottom-6 right-6 bg-black/70 px-4 py-2 rounded-2xl text-[10px] font-mono border border-white/10 shadow-2xl">
                ZOOM: {zoom.toFixed(1)}x
              </div>
            </div>

            <div className="bg-slate-900/60 p-8 rounded-[3rem] space-y-8 border border-white/5 shadow-2xl backdrop-blur-sm">
              <div className="space-y-5">
                <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                  <span className="flex items-center gap-2 text-blue-500">
                    <ZoomIn size={14} />
                    Hardware Optic/Digital
                  </span>
                  <span className="text-white font-bold">
                    {zoom.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="0.1"
                  value={zoom}
                  onChange={(event) => applyZoom(event.target.value)}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none accent-blue-600 shadow-inner"
                />
              </div>
              <button
                onClick={() => {
                  void terminateAll();
                }}
                className="w-full bg-slate-800 text-red-500 p-6 rounded-2xl font-black flex items-center justify-center gap-3 border border-red-500/10 active:scale-95 transition-all text-xs tracking-widest uppercase"
              >
                <StopCircle size={22} />
                Opreste Transmisia
              </button>
            </div>
          </div>
        )}

        {view === "monitor" && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500">
            <div className="relative rounded-[3rem] overflow-hidden bg-black shadow-2xl aspect-video ring-4 ring-blue-500/5 border border-white/5">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {connStatus !== "LIVE" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 gap-6 transition-all">
                  <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center shadow-2xl ring-1 ring-white/10">
                    <RefreshCw
                      className="text-blue-500 animate-spin"
                      size={32}
                    />
                  </div>
                  <div className="text-center px-12 space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white">
                      Sincronizare...
                    </p>
                    <p className="text-[9px] text-slate-500 italic font-medium leading-relaxed">
                      Protocolul enterprise cauta oferta securizata emisa de
                      sursa Motorola.
                    </p>
                  </div>
                </div>
              )}
              {connStatus === "LIVE" && (
                <div className="absolute top-6 left-6 bg-blue-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black shadow-2xl flex items-center gap-2 border border-white/20">
                  <Wifi size={12} />
                  SECURE P2P LINK
                </div>
              )}
            </div>
            <div className="bg-slate-900/50 p-6 rounded-[2.5rem] border border-white/5 flex flex-col gap-4 shadow-2xl">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Stare Conexiune
                </span>
                <span
                  className={`text-[10px] font-black px-3 py-1 rounded-lg ${
                    connStatus === "LIVE"
                      ? "bg-green-500/10 text-green-500"
                      : "bg-orange-500/10 text-orange-500"
                  }`}
                >
                  {connStatus === "LIVE" ? "ENCRIPTATA" : "NEGOCIERE"}
                </span>
              </div>
              <div className="h-px bg-white/5" />
              <p className="text-[10px] text-slate-400 italic leading-snug">
                Monitorul utilizeaza decodare locala. Daca sursa nu raspunde,
                conexiunea este marcata offline.
              </p>
            </div>
            <button
              onClick={() => {
                void terminateAll();
              }}
              className="w-full bg-slate-900 p-6 rounded-2xl font-black active:scale-95 border border-white/5 text-[11px] tracking-widest uppercase shadow-xl"
            >
              Deconectare Securizata
            </button>
          </div>
        )}

        {view === "history" && (
          <div className="space-y-8 animate-in fade-in duration-500 pb-10">
            <div className="bg-slate-900/60 p-6 rounded-[3rem] flex items-center justify-between border border-white/5 shadow-2xl ring-1 ring-white/5">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-950 rounded-2xl text-blue-500 shadow-2xl border border-white/10">
                  <HardDrive size={22} />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-tighter text-white leading-none">
                    Storage Manager
                  </p>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                    Managementul Arhivei Locale
                  </p>
                </div>
              </div>
              <button
                onClick={clearStorage}
                className="bg-red-950/30 text-red-500 border border-red-500/30 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase active:bg-red-600 active:text-white transition-all shadow-xl"
              >
                Flush
              </button>
            </div>

            <div className="space-y-10">
              <div className="space-y-4 px-2">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                  <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em] italic">
                    Depozit Local Dispozitiv
                  </h3>
                </div>
                <div className="grid gap-4">
                  {recordings.length === 0 ? (
                    <div className="p-12 text-center border border-dashed border-white/5 rounded-[2.5rem] opacity-30 italic text-[11px] uppercase font-bold tracking-widest">
                      Nicio inregistrare pe disk
                    </div>
                  ) : (
                    recordings.map((record) => (
                      <div
                        key={record.id}
                        className="bg-slate-900/60 border border-white/5 p-5 rounded-4xl flex items-center justify-between group hover:bg-slate-900 transition-all shadow-xl ring-1 ring-white/5"
                      >
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-500 shadow-inner group-hover:scale-110 transition-transform">
                            <Play size={24} fill="currentColor" />
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-black text-white">
                              {new Date(record.timestamp).toLocaleString(
                                "ro-RO",
                              )}
                            </p>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1 italic">
                              {record.size}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => playRecording(record)}
                            className="p-3.5 bg-slate-800 rounded-2xl text-blue-400 active:scale-90 hover:bg-blue-600 hover:text-white transition-all shadow-2xl ring-1 ring-white/10"
                          >
                            <Play size={18} />
                          </button>
                          <button
                            onClick={() => deleteRecording(record.id)}
                            className="p-3.5 bg-slate-800 rounded-2xl text-red-500 active:scale-90 hover:bg-red-600 hover:text-white transition-all shadow-2xl ring-1 ring-white/10"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {remoteRecordings.length > 0 && (
                <div className="space-y-4 px-2 pt-8 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                    <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em] italic">
                      Index Arhiva Motorola (Remote)
                    </h3>
                  </div>
                  <div className="grid gap-4 opacity-70">
                    {remoteRecordings.map((record) => (
                      <div
                        key={record.id}
                        className="bg-slate-900/30 border border-emerald-900/10 p-5 rounded-4xl flex items-center justify-between shadow-inner"
                      >
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 bg-slate-800/50 rounded-2xl flex items-center justify-center text-slate-600 shadow-inner">
                            <Play size={24} />
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-black text-slate-300">
                              {new Date(record.timestamp).toLocaleString(
                                "ro-RO",
                              )}
                            </p>
                            <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-1">
                              {record.size}
                            </p>
                          </div>
                        </div>
                        <div className="px-4 py-2 bg-emerald-950/20 text-emerald-500 text-[9px] font-black uppercase border border-emerald-500/10 rounded-xl italic tracking-wider">
                          Source Only
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-6 bg-slate-900/40 rounded-4xl border border-white/5 flex gap-4">
                    <ShieldAlert
                      className="text-blue-500/50 shrink-0"
                      size={24}
                    />
                    <p className="text-[10px] text-slate-500 italic leading-relaxed font-medium">
                      Fisierele video raman locale pe device-ul sursa pentru a
                      minimiza riscul de exfiltrare cloud.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-3xl border-t border-white/5 h-20 px-8 flex justify-between items-center z-50 rounded-t-[3rem] shadow-[0_-20px_50px_rgba(0,0,0,0.7)]">
        <NavButton
          active={view === "home"}
          onClick={() => setView("home")}
          icon={<Home />}
          label="Hub"
        />
        <NavButton
          active={view === "camera"}
          onClick={() => setView("camera")}
          icon={<Camera />}
          label="Node"
        />
        <NavButton
          active={view === "monitor"}
          onClick={() => setView("monitor")}
          icon={connStatus === "LIVE" ? <Wifi /> : <WifiOff />}
          label="View"
        />
        <NavButton
          active={view === "history"}
          onClick={() => setView("history")}
          icon={<History />}
          label="Logs"
        />
      </nav>

      {playingVideo && (
        <div className="fixed inset-0 z-100 bg-black/95 flex flex-col p-6 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="flex justify-between items-center mb-10">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-blue-600/20 rounded-xl text-blue-500 border border-blue-500/20 shadow-2xl">
                <Play size={18} fill="currentColor" />
              </div>
              <div>
                <p className="text-[11px] font-black text-white uppercase tracking-[0.2em] italic leading-none">
                  Redare Securizata
                </p>
                <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-1.5">
                  Sector: Depozit Local
                </p>
              </div>
            </div>
            <button
              onClick={closePlayer}
              className="p-4 bg-slate-900 rounded-full text-white shadow-2xl h-12 w-12 flex items-center justify-center active:scale-90 ring-1 ring-white/10 hover:bg-slate-800 transition-all"
            >
              <X size={24} />
            </button>
          </div>
          <div className="grow flex items-center justify-center relative">
            <div className="absolute inset-0 bg-blue-500/5 blur-[100px] rounded-full" />
            <video
              src={playingVideo.url}
              controls
              autoPlay
              className="w-full rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.9)] border border-white/10 max-h-[60vh] object-contain ring-1 ring-white/5 relative z-10"
            />
          </div>
          <div className="mt-12 flex flex-col gap-6 relative z-10">
            <a
              href={playingVideo.url}
              download={`SeCam_${sessionId}_${playingVideo.id}.webm`}
              className="w-full bg-blue-600 p-6 rounded-4xl font-black text-center flex items-center justify-center gap-4 shadow-[0_20px_40px_rgba(37,99,235,0.3)] active:scale-95 transition-all text-xs uppercase text-white tracking-[0.3em]"
            >
              <Download size={24} />
              Export in Galerie
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactElement<{ size?: number; strokeWidth?: number }>;
  label: string;
}

function NavButton({ active, onClick, icon, label }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 transition-all duration-500 w-16 ${
        active
          ? "text-blue-500 scale-110 -translate-y-1.5"
          : "text-slate-600 opacity-40 hover:opacity-100"
      }`}
    >
      <div
        className={`p-2 rounded-2xl transition-all duration-500 ${
          active
            ? "bg-blue-600/10 shadow-[inset_0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/20"
            : ""
        }`}
      >
        {React.cloneElement(icon, { size: 24, strokeWidth: active ? 3 : 2.5 })}
      </div>
      <span className="text-[9px] font-black uppercase tracking-widest italic">
        {label}
      </span>
    </button>
  );
}
