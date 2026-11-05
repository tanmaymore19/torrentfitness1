import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '../../firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { AttendanceRecord, GymQrConfig } from '../../types';
import { getActiveGymQrConfig } from '../../services/qrService';
import {
  getActiveClientSession,
  closeAttendanceSession,
  isSessionExpired,
  getSessionRemainingMs,
  formatSessionRemainingTime
} from '../../services/attendanceService';
import confetti from 'canvas-confetti';
import {
  QrCode,
  X,
  Camera,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  Flashlight,
  SwitchCamera
} from 'lucide-react';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  clientPhotoUrl: string;
  onScanSuccess: (record: AttendanceRecord) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  clientId,
  clientName,
  clientPhotoUrl,
  onScanSuccess
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [dynamicGreeting, setDynamicGreeting] = useState<string>('');
  const [cameraStarted, setCameraStarted] = useState<boolean>(false);
  const [isStartingCamera, setIsStartingCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');
  const [cameraDevices, setCameraDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Fixed container ID for scanner viewport
  const scannerContainerId = useRef(
    'torrent-qr-view-' + Math.random().toString(36).substring(2, 8)
  ).current;

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);
  const hasScannedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const observerRef = useRef<MutationObserver | null>(null);

  // Strip throwing onabort / onerror handlers attached by html5-qrcode video surface
  const sanitizeVideo = (v: HTMLVideoElement) => {
    try {
      v.onabort = null;
      v.onerror = null;
      v.onemptied = null;
      v.style.width = '100%';
      v.style.height = '100%';
      v.style.objectFit = 'cover';
      v.style.borderRadius = '1rem';
      v.addEventListener(
        'abort',
        (e) => {
          e.stopImmediatePropagation();
          e.preventDefault();
        },
        true
      );
      v.addEventListener(
        'error',
        (e) => {
          e.stopImmediatePropagation();
          e.preventDefault();
        },
        true
      );
    } catch {}
  };

  // Web Audio API instant chime synthesizer
  const playSuccessChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Primary tone: D5 to A5 sweep
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain1.gain.setValueAtTime(0.28, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.28);

      // Harmonic chime: D6 bell ring
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1174.66, now + 0.08);
      gain2.gain.setValueAtTime(0.2, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.42);
    } catch (e) {
      console.warn('Audio chime note:', e);
    }
  };

  // Synchronously kill every video MediaStream track in the DOM and on device without triggering onabort
  const stopAllTracksImmediately = () => {
    try {
      const shutdownVideo = (v: HTMLVideoElement) => {
        try {
          sanitizeVideo(v);
          v.pause();
        } catch {}
        if (v.srcObject && 'getTracks' in (v.srcObject as MediaStream)) {
          try {
            (v.srcObject as MediaStream).getTracks().forEach((t) => {
              try {
                t.stop();
                t.enabled = false;
              } catch {}
            });
          } catch {}
        }
        try {
          v.srcObject = null;
        } catch {}
      };

      const container = document.getElementById(scannerContainerId);
      if (container) {
        container.querySelectorAll('video').forEach(shutdownVideo);
      }
      document.querySelectorAll('video').forEach(shutdownVideo);
    } catch (e) {
      console.warn('Track stop note:', e);
    }
  };

  const stopCamera = async () => {
    isCancelledRef.current = true;
    hasScannedRef.current = false;
    isStartingRef.current = false;
    setIsStartingCamera(false);
    setCameraStarted(false);

    // Disconnect mutation observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    // Sanitize any video elements FIRST so their onabort/onerror can never fire
    const container = document.getElementById(scannerContainerId);
    if (container) {
      container.querySelectorAll('video').forEach(sanitizeVideo);
    }

    const scanner = html5QrCodeRef.current;
    html5QrCodeRef.current = null;

    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch (e) {
        // Safe to ignore if already stopped or transitioning
      }
      try {
        scanner.clear();
      } catch (e) {}
    }

    // Terminate and power down tracks cleanly
    stopAllTracksImmediately();
  };

  // Toggle hardware flashlight/torch if supported by active video stream track
  const toggleTorch = async () => {
    try {
      const container = document.getElementById(scannerContainerId);
      const videoElem = container?.querySelector('video') as HTMLVideoElement | null;
      if (videoElem && videoElem.srcObject) {
        const stream = videoElem.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          const cap = (track.getCapabilities && track.getCapabilities()) as any;
          if (cap && cap.torch) {
            await (track as any).applyConstraints({
              advanced: [{ torch: !isTorchOn }]
            });
            setIsTorchOn(!isTorchOn);
            return;
          }
        }
      }
      setIsTorchOn(!isTorchOn);
    } catch (e) {
      console.warn('Torch toggle note:', e);
      setIsTorchOn(!isTorchOn);
    }
  };

  // Flip camera between environment (rear) and user (front)
  const handleFlipCamera = async () => {
    try {
      const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
      setFacingMode(nextFacing);
      await stopCamera();
      if (cameraDevices.length > 1) {
        const currentIdx = cameraDevices.findIndex((d) => d.id === selectedCameraId);
        const nextDevice = cameraDevices[(currentIdx + 1) % cameraDevices.length];
        await startCamera(nextDevice.id);
      } else {
        await startCamera(undefined, nextFacing);
      }
    } catch (e) {
      console.warn('Camera flip note:', e);
    }
  };

  const startCamera = async (preferCameraId?: string, forceFacing?: 'environment' | 'user') => {
    if (!isOpen) return;

    // Reset flags
    isCancelledRef.current = false;
    setCameraError('');
    setIsStartingCamera(true);

    // Brief delay to ensure DOM container is attached and styled with real clientWidth
    await new Promise((r) => setTimeout(r, 60));

    if (isCancelledRef.current || !isOpen || !isMountedRef.current) {
      setIsStartingCamera(false);
      return;
    }

    const element = document.getElementById(scannerContainerId);
    if (!element) {
      setIsStartingCamera(false);
      return;
    }

    // Hardware support guard: prevent crash on older mobile browsers, WebViews or HTTP
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setIsStartingCamera(false);
      setCameraError('Camera access is not supported on this browser or requires a secure connection (HTTPS).');
      return;
    }

    // Observe container to sanitize any video element the moment html5-qrcode creates it
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    const observer = new MutationObserver(() => {
      const vids = element.querySelectorAll('video');
      vids.forEach(sanitizeVideo);
    });
    observer.observe(element, { childList: true, subtree: true });
    observerRef.current = observer;

    try {
      // Clear any prior scanner instance
      if (html5QrCodeRef.current) {
        element.querySelectorAll('video').forEach(sanitizeVideo);
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop();
          }
          html5QrCodeRef.current.clear();
        } catch {}
        html5QrCodeRef.current = null;
      }

      // Check available cameras if supported
      let devices: Array<{ id: string; label: string }> = [];
      try {
        devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setCameraDevices(devices);
        }
      } catch {
        // Safe fallback
      }

      // Decide camera target:
      // 1. Specified preferCameraId
      // 2. Rear / back camera if found in device labels
      // 3. First device ID if single webcam (desktop/laptop)
      // 4. Default to environment facingMode
      let targetCamera: any = preferCameraId;
      if (!targetCamera) {
        if (forceFacing) {
          targetCamera = { facingMode: forceFacing };
        } else if (devices.length > 0) {
          const rear = devices.find((d) =>
            /back|rear|environment|posterior|outward/i.test(d.label)
          );
          if (rear) {
            targetCamera = rear.id;
          } else if (devices.length === 1) {
            targetCamera = devices[0].id;
          } else {
            targetCamera = { facingMode: 'environment' };
          }
        } else {
          targetCamera = { facingMode: 'environment' };
        }
      }

      isStartingRef.current = true;
      const scanner = new Html5Qrcode(scannerContainerId);
      html5QrCodeRef.current = scanner;

      // PhonePe / Google Pay-grade high-frequency scan config: 20 fps, 82% scan window, 1080p/720p constraints & continuous autofocus
      const scanConfig = {
        fps: 20,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const edge = Math.max(180, Math.floor(minEdge * 0.82));
          return { width: edge, height: edge };
        },
        aspectRatio: 1.0,
        videoConstraints: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          advanced: [{ focusMode: 'continuous' }] as any
        }
      };

      const handleSuccess = (decodedText: string) => {
        // STRICT ABORT GUARD: If modal is closed, cancelled, unmounted, or payload is empty
        if (
          !isOpen ||
          isCancelledRef.current ||
          !isMountedRef.current ||
          !decodedText ||
          typeof decodedText !== 'string' ||
          decodedText.trim().length === 0 ||
          isScanning ||
          isSuccess
        ) {
          return;
        }

        // INSTANT HARDWARE STOP: Release camera video tracks immediately to free CPU & prevent thread lock
        stopAllTracksImmediately();
        handleProcessScan(decodedText);
      };

      const handleError = () => {
        // High-speed scan tick with no barcode detected in current frame
      };

      // Try chosen camera, with automatic fallback chain for desktop/laptop webcams
      try {
        await scanner.start(targetCamera, scanConfig, handleSuccess, handleError);
      } catch (firstErr: any) {
        console.warn('First camera attempt failed, trying fallback:', firstErr);
        // Fallback 1: user facing mode
        try {
          await scanner.start({ facingMode: 'user' }, scanConfig, handleSuccess, handleError);
          targetCamera = { facingMode: 'user' };
        } catch (secondErr: any) {
          // Fallback 2: first available camera device id
          if (devices.length > 0 && devices[0].id !== targetCamera) {
            await scanner.start(devices[0].id, scanConfig, handleSuccess, handleError);
            targetCamera = devices[0].id;
          } else {
            throw secondErr;
          }
        }
      }

      if (typeof targetCamera === 'string') {
        setSelectedCameraId(targetCamera);
      }

      // Immediately sanitize video after start succeeds
      element.querySelectorAll('video').forEach(sanitizeVideo);

      isStartingRef.current = false;
      setIsStartingCamera(false);

      // Check if user closed modal during camera startup
      if (isCancelledRef.current || !isOpen || !isMountedRef.current) {
        element.querySelectorAll('video').forEach(sanitizeVideo);
        try {
          await scanner.stop();
        } catch {}
        try {
          scanner.clear();
        } catch {}
        stopAllTracksImmediately();
        html5QrCodeRef.current = null;
        setCameraStarted(false);
        return;
      }

      setCameraStarted(true);
      setCameraError('');
    } catch (err: any) {
      isStartingRef.current = false;
      setIsStartingCamera(false);
      if (element) {
        element.querySelectorAll('video').forEach(sanitizeVideo);
      }
      if (isMountedRef.current && isOpen && !isCancelledRef.current) {
        console.warn('Camera initiation note:', err);
        setCameraStarted(false);
        const errMsg = String(err?.message || err || '');
        if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission')) {
          setCameraError(
            'Camera permission was blocked. Please allow camera access in your browser.'
          );
        } else if (errMsg.includes('NotFoundError') || errMsg.includes('DevicesNotFoundError')) {
          setCameraError('No camera detected on this device. Camera access is required for attendance.');
        } else {
          setCameraError(
            'Camera could not be started. Please grant camera permissions and try again.'
          );
        }
      }
      stopAllTracksImmediately();
    }
  };

  // Safe close handler: guaranteed zero database writes, strictly cleans up camera and dismisses
  const handleClose = async () => {
    hasScannedRef.current = false;
    isCancelledRef.current = true;
    setIsScanning(false);
    stopAllTracksImmediately();
    await stopCamera();
    onClose();
  };

  // Safe retry handler to restart camera if an error or invalid QR occurred
  const handleRetryScan = async () => {
    hasScannedRef.current = false;
    isCancelledRef.current = false;
    setErrorMessage('');
    setStatusMessage('');
    setIsSuccess(false);
    setIsScanning(false);
    await stopCamera();
    startCamera();
  };

  // Camera lifecycle: Camera ONLY opens automatically when scanner modal is launched.
  // When scanner is not open / closed, camera is strictly powered OFF.
  // Absolutely ZERO database writes or attendance logging can occur on unmount/close.
  useEffect(() => {
    isMountedRef.current = true;

    if (isOpen) {
      hasScannedRef.current = false;
      isCancelledRef.current = false;
      setIsScanning(false);
      setErrorMessage('');
      setStatusMessage('');
      setIsSuccess(false);
      setIsStartingCamera(true);
      setCameraStarted(false);
      setCameraError('');
      startCamera();
    } else {
      hasScannedRef.current = false;
      isCancelledRef.current = true;
      setIsScanning(false);
      stopAllTracksImmediately();
      stopCamera();
    }

    return () => {
      isMountedRef.current = false;
      hasScannedRef.current = false;
      isCancelledRef.current = true;
      setIsScanning(false);
      stopAllTracksImmediately();
      stopCamera();
    };
  }, [isOpen]);

  // Turn off camera if page is hidden (e.g. app sent to background / switched apps)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && isOpen) {
        hasScannedRef.current = false;
        isCancelledRef.current = true;
        setIsScanning(false);
        stopAllTracksImmediately();
        stopCamera();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isOpen]);

  // Close scanner on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  // Process and validate scanned payload against backend Firestore.
  // Attendance is strictly written ONLY if a valid QR payload was decoded from live camera.
  const handleProcessScan = async (scannedPayload: string) => {
    // 1. Strict guard: If cancelled, closed, unmounted, or payload is empty/missing
    if (
      !isOpen ||
      isCancelledRef.current ||
      !isMountedRef.current ||
      isScanning ||
      isSuccess ||
      !scannedPayload ||
      typeof scannedPayload !== 'string' ||
      scannedPayload.trim().length === 0
    ) {
      return;
    }

    // Reset scan guard
    hasScannedRef.current = false;
    setIsScanning(true);
    setErrorMessage('');
    setStatusMessage('Validating QR token with Torrent Fitness gateway...');

    // Stop video tracks immediately to free hardware
    stopAllTracksImmediately();
    if (html5QrCodeRef.current?.isScanning) {
      html5QrCodeRef.current.stop().catch(() => {});
    }

    try {
      // 1. Fetch current active QR configuration from Firestore
      const activeConfig = await getActiveGymQrConfig();

      // Check if user dismissed modal during Firestore read
      if (!isOpen || isCancelledRef.current || !isMountedRef.current) {
        return;
      }

      const currentToken = activeConfig.activeToken?.trim();

      if (!activeConfig.active) {
        throw new Error(
          'Reception desk QR check-in is currently paused by gym administration.'
        );
      }

      if (!currentToken || currentToken.length < 5) {
        throw new Error(
          'Reception QR configuration is not ready. Please try again.'
        );
      }

      const trimmed = scannedPayload.trim();

      // Support raw token or JSON-encoded token
      let tokenToVerify = trimmed;
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.activeToken) tokenToVerify = String(parsed.activeToken).trim();
          else if (parsed.token) tokenToVerify = String(parsed.token).trim();
        } catch {}
      }

      if (!tokenToVerify || tokenToVerify.length === 0) {
        throw new Error('⚠️ Invalid QR Code! No readable token found.');
      }

      // Check if scanned token matches any older, invalidated token
      const isExpiredPreviousToken = Boolean(
        activeConfig.previousTokens &&
          (activeConfig.previousTokens.includes(tokenToVerify) ||
            activeConfig.previousTokens.includes(trimmed))
      );

      if (isExpiredPreviousToken) {
        throw new Error(
          '⚠️ Invalid or Expired QR Code! Please scan the latest QR at reception.'
        );
      }

      // Strict validation: Must match current active reception token
      const isStrictMatch = Boolean(
        currentToken &&
        (tokenToVerify === currentToken || tokenToVerify.includes(currentToken))
      );

      if (!isStrictMatch) {
        throw new Error(
          '⚠️ Invalid or Expired QR Code! Please scan the latest QR at reception.'
        );
      }

      // Token is strictly verified! Mark the guard as true.
      hasScannedRef.current = true;

      // Check again if cancelled before querying membership
      if (!hasScannedRef.current || isCancelledRef.current || !isOpen || !isMountedRef.current) {
        return;
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const nowTimeStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      const nowIso = new Date().toISOString();

      // 2. Validate Membership: Must have an ACTIVE membership plan (or active Aerobics batch)
      let isAero = false;
      let aeroBatchName: string | undefined;
      let clientPlanName = 'General Membership';

      if (clientId) {
        try {
          const cSnap = await getDoc(doc(db, 'clientProfiles', clientId));
          if (cSnap.exists()) {
            const cData = cSnap.data();
            const memStatus = String(cData.membershipStatus || '').toLowerCase();
            clientPlanName =
              cData.membershipPlanName ||
              cData.membershipPlan ||
              cData.planName ||
              'General Membership';

            const memEnd = cData.membershipEndDate;
            let isExpiredDate = false;
            if (memEnd) {
              const expTime = new Date(`${memEnd}T23:59:59`).getTime();
              if (!isNaN(expTime) && expTime < Date.now()) {
                isExpiredDate = true;
              }
            }

            const isFem = String(cData.gender || '').toLowerCase() === 'female';
            if (isFem && String(cData.aerobicsStatus || '').toLowerCase() === 'active') {
              isAero = true;
              aeroBatchName = cData.aerobicsBatchName || undefined;
            }

            // If inactive or expired, show explicit error requirement
            if ((memStatus !== 'active' || isExpiredDate) && !isAero) {
              if (cData.offlineRequestStatus === 'pending') {
                throw new Error(
                  'Turnstile Locked: Your Offline Cash payment request is currently pending Admin verification at the reception desk.'
                );
              }
              throw new Error('Membership Expired / Inactive. Please renew to check in.');
            }
          }
        } catch (cErr: any) {
          if (cErr.message && cErr.message.includes('Turnstile Locked')) {
            throw cErr;
          }
          if (cErr.message && cErr.message.includes('Membership Expired')) {
            throw cErr;
          }
          console.warn('Client profile read note:', cErr);
        }
      }

      // CRITICAL GUARD BEFORE DATABASE WRITES:
      // Verify that hasScannedRef.current is strictly true, modal is still open, and not cancelled!
      if (!hasScannedRef.current || isCancelledRef.current || !isOpen || !isMountedRef.current) {
        return;
      }

      // 3. Dual-Sync & Real-Time Logging: Write simultaneously to 'attendance_logs' and 'attendance'
      const recordId = `att_${Date.now()}_${clientId || 'guest'}`;
      const record: AttendanceRecord = {
        id: recordId,
        clientId: clientId || 'guest',
        clientName: clientName || 'Member',
        clientPhotoUrl: clientPhotoUrl || '',
        entryDate: todayStr,
        entryTime: nowTimeStr,
        sessionStatus: 'active',
        sessionDurationMinutes: 120,
        qrValidationToken: currentToken,
        ...(isAero ? { isAerobicsMember: true, aerobicsBatchName: aeroBatchName } : {}),
        createdAt: nowIso
      };

      try {
        // Write to 'attendance'
        await setDoc(doc(db, 'attendance', recordId), {
          ...record,
          clientId: clientId || 'guest',
          clientName: clientName || 'Member',
          memberName: clientName || 'Member',
          timestamp: nowIso,
          date: todayStr,
          time: nowTimeStr,
          checkInTime: nowTimeStr,
          status: 'PRESENT',
          planName: clientPlanName,
          membershipPlan: clientPlanName,
          isAerobics: isAero,
          isAerobicsMember: isAero,
          aerobicsBatchName: aeroBatchName || null,
          badge: isAero ? 'AEROBICS' : 'STANDARD',
          updatedAt: nowIso
        });

        // Write simultaneously to 'attendance_logs'
        await setDoc(doc(db, 'attendance_logs', recordId), {
          id: recordId,
          clientId: clientId || 'guest',
          clientName: clientName || 'Member',
          memberName: clientName || 'Member',
          clientPhotoUrl: clientPhotoUrl || '',
          timestamp: nowIso,
          date: todayStr,
          time: nowTimeStr,
          checkInTime: nowTimeStr,
          status: 'PRESENT',
          planName: clientPlanName,
          membershipPlan: clientPlanName,
          isAerobics: isAero,
          isAerobicsMember: isAero,
          aerobicsBatchName: aeroBatchName || null,
          badge: isAero ? 'AEROBICS' : 'STANDARD',
          sessionStatus: 'active',
          createdAt: nowIso
        });
      } catch (writeErr: any) {
        console.error('Attendance Firestore write error:', writeErr);
        const errMsg = String(writeErr?.message || '').toLowerCase();
        if (writeErr?.code === 'permission-denied' || errMsg.includes('permission')) {
          throw new Error('Database permission notice: Unable to record attendance log. Please ensure your account has active client access.');
        }
        throw writeErr;
      }

      // Check once more after writes before celebration & callbacks
      if (isCancelledRef.current || !isMountedRef.current) {
        return;
      }

      // 4. Instant Celebration Feedback
      playSuccessChime();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([100, 50, 100]);
        } catch {}
      }

      try {
        confetti({
          particleCount: 120,
          spread: 85,
          origin: { y: 0.6 }
        });
      } catch {}

      const celebrationGreeting = `Welcome, ${clientName || 'Member'}! Session Started.`;
      setDynamicGreeting(celebrationGreeting);
      setIsSuccess(true);
      setStatusMessage(celebrationGreeting);
      onScanSuccess(record);

      // Auto-close smoothly after 2.0 seconds
      setTimeout(() => {
        if (isMountedRef.current) {
          setIsSuccess(false);
          onClose();
        }
      }, 2000);
    } catch (err: any) {
      hasScannedRef.current = false;
      if (isMountedRef.current && !isCancelledRef.current) {
        setErrorMessage(err.message || 'Verification failed. Please try again.');
      }
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-2xl animate-fade-in"
    >
      <div className="relative w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-[0_0_50px_rgba(6,182,212,0.22)] border border-cyan-500/30 bg-slate-950/95 text-slate-100 overflow-hidden text-center max-h-[92vh] overflow-y-auto no-scrollbar">
        {/* Soft Ambient Cyberpunk Glow */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* 1. TOP CONTROLS BAR: Close (Top-Left), Title (Center), Flashlight & Flip (Top-Right) */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 relative z-10">
          {/* Close Button Top-Left */}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close Scanner"
            className="p-2 text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800 rounded-xl transition-all border border-slate-800 active:scale-95"
            title="Dismiss Scanner"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Futuristic Scanner Badge */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Access Scanner
            </span>
            <span className="text-[11px] font-bold text-slate-300">Torrent Fitness</span>
          </div>

          {/* Camera Controls: Flip & Flashlight */}
          <div className="flex items-center gap-1.5">
            {/* Flip Camera Button */}
            <button
              type="button"
              onClick={handleFlipCamera}
              disabled={isStartingCamera}
              className="p-2 text-slate-300 hover:text-cyan-300 bg-slate-900/80 hover:bg-slate-800 rounded-xl transition-all border border-slate-800 active:scale-95 disabled:opacity-50"
              title="Flip Camera (Front/Rear)"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>

            {/* Flashlight / Torch Toggle */}
            <button
              type="button"
              onClick={toggleTorch}
              disabled={!cameraStarted}
              className={`p-2 rounded-xl transition-all border active:scale-95 disabled:opacity-40 ${
                isTorchOn
                  ? 'bg-amber-500/25 text-amber-300 border-amber-400/60 shadow-[0_0_15px_rgba(251,191,36,0.5)]'
                  : 'text-slate-300 hover:text-amber-300 bg-slate-900/80 hover:bg-slate-800 border border-slate-800'
              }`}
              title={isTorchOn ? 'Torch On' : 'Torch Off'}
            >
              <Flashlight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Camera State Indicator */}
        {/* Live Camera State Indicator */}
        <div className="flex items-center justify-center gap-2 mt-3 mb-1">
          {isStartingCamera ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              Sensor Starting...
            </span>
          ) : cameraStarted ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Cyber Scanner Live
            </span>
          ) : null}
        </div>

        {/* Success Screen: Sleek Apple / Cyberpunk Pop-Up Card */}
        {isSuccess ? (
          <div className="my-5 p-6 bg-gradient-to-b from-emerald-950/80 via-slate-900/90 to-slate-950 border border-emerald-400/50 rounded-3xl text-emerald-100 space-y-4 animate-scale-up text-center shadow-[0_0_40px_rgba(16,185,129,0.35)] relative overflow-hidden">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center ring-4 ring-emerald-500/30 shadow-[0_0_20px_#10b981] animate-bounce">
              <CheckCircle className="w-9 h-9 text-emerald-300" />
            </div>

            <div className="space-y-1.5">
              <span className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Attendance Confirmed
              </span>
              <h4 className="text-base font-black text-white tracking-wide">
                {dynamicGreeting || `Welcome, ${clientName || 'Member'}! Session Started.`}
              </h4>
              <p className="text-xs text-emerald-200/90 font-medium">
                Live attendance synchronized in real time with Torrent Fitness gateway.
              </p>
            </div>

            <div className="p-3 bg-black/40 rounded-2xl border border-emerald-500/20 text-[11px] text-slate-300 space-y-1">
              <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider">
                Torrent Fitness Reception Access Point
              </span>
              <p className="font-semibold text-slate-300">
                Torrent Fitness, Sakri Rd, near ramesh bakery, opposite Sinchan Bhavan, Mahindale, Kumar Nagar, Dhule, Maharashtra 424001
              </p>
            </div>

            <div className="text-[10px] text-emerald-400/80 animate-pulse font-medium">
              Closing scanner automatically...
            </div>
          </div>
        ) : (
          <>
            {/* 2. MODERN TRENDING CYBERPUNK / GLASSMORPHIC VIEWFINDER */}
            <div className="relative mx-auto w-64 h-64 sm:w-68 sm:h-68 bg-slate-900/90 rounded-2xl overflow-hidden border border-cyan-500/40 shadow-[0_0_30px_rgba(6,182,212,0.2)] flex flex-col items-center justify-center ring-1 ring-cyan-400/20 my-3">
              {/* html5-qrcode video element mounts inside here */}
              <div
                id={scannerContainerId}
                className="w-full h-full object-cover overflow-hidden"
              />

              {/* Seamless Opening Camera Spinner Overlay */}
              {isStartingCamera && (
                <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-4 z-30 pointer-events-none">
                  <div className="w-9 h-9 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-2 shadow-[0_0_15px_#22d3ee]" />
                  <span className="text-xs font-black text-cyan-300 tracking-wider uppercase">Initializing Sensor</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Starting live camera feed</span>
                </div>
              )}

              {/* Viewfinder Reticle & Continuous Laser Line */}
              {cameraStarted && !isStartingCamera && (
                <>
                  {/* Smooth Vertical Animated Scan Laser Line */}
                  <div className="absolute inset-x-2 h-0.75 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee,0_0_25px_#06b6d4] animate-laser-sweep pointer-events-none z-20 rounded-full" />

                  {/* High-Tech Glowing Reticle Corners (Cyan top, Emerald bottom) */}
                  <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-cyan-400 rounded-tl-lg shadow-[0_0_10px_#22d3ee] pointer-events-none z-20" />
                  <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-cyan-400 rounded-tr-lg shadow-[0_0_10px_#22d3ee] pointer-events-none z-20" />
                  <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-emerald-400 rounded-bl-lg shadow-[0_0_10px_#34d399] pointer-events-none z-20" />
                  <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-emerald-400 rounded-br-lg shadow-[0_0_10px_#34d399] pointer-events-none z-20" />
                </>
              )}

              {/* Camera Error Overlay (only when camera encountered an error) */}
              {!cameraStarted && !isStartingCamera && cameraError && (
                <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-4 text-center z-20">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-2 border border-amber-500/30">
                    <Camera className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-white block">Camera Sensor Notice</span>
                  <p className="text-[11px] text-slate-300 max-w-[200px] mt-1">
                    {cameraError}
                  </p>
                  <button
                    type="button"
                    onClick={handleRetryScan}
                    className="mt-3 py-1.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold"
                  >
                    Retry Sensor
                  </button>
                </div>
              )}
            </div>

            {/* 3. HELPER INSTRUCTIONS SUBTITLE */}
            <p className="text-xs text-slate-400 font-medium px-2 mt-1">
              Align Gym Reception QR inside the frame to check in
            </p>

            {/* Status Feedback */}
            {statusMessage && !errorMessage && !isSuccess && (
              <div className="mt-2.5 p-2 bg-cyan-950/50 border border-cyan-500/40 rounded-xl text-xs text-cyan-200 flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400 animate-spin" />
                <span>{statusMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="mt-2.5 p-3 bg-rose-950/80 border border-rose-500/60 rounded-2xl text-xs text-rose-200 space-y-2 text-left animate-fade-in shadow-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span className="font-semibold leading-relaxed">{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRetryScan}
                  className="w-full py-2 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Restart Camera & Scan Again</span>
                </button>
              </div>
            )}
          </>
        )}

        <p className="mt-3 text-[10px] text-slate-500">
          Sensor powers off automatically when scanner is dismissed.
        </p>
      </div>
    </div>
  );
};

