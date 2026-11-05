import React, { useState, useEffect, useRef } from 'react';
import { GymQrConfig } from '../../types';
import {
  generateQrDataUrl,
  getActiveGymQrConfig,
  regenerateGymQrConfig
} from '../../services/qrService';
import { INITIAL_GYM_CONFIG } from '../../services/db';
import { copyToClipboard } from '../../utils/clipboard';
import {
  QrCode,
  Download,
  Printer,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  Clock,
  Sparkles
} from 'lucide-react';

interface GymDeskQrDisplayProps {
  isAdmin?: boolean;
  onTokenRegenerated?: (config: GymQrConfig) => void;
}

export const GymDeskQrDisplay: React.FC<GymDeskQrDisplayProps> = ({
  isAdmin = false,
  onTokenRegenerated
}) => {
  const [config, setConfig] = useState<GymQrConfig | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string>('');
  const [showConfirmRegenerate, setShowConfirmRegenerate] = useState<boolean>(false);

  const standeeRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  // Load and render active QR
  const loadAndRenderQr = async () => {
    setIsLoading(true);
    try {
      const activeConf = await getActiveGymQrConfig();
      setConfig(activeConf);

      const targetToken = activeConf?.activeToken || INITIAL_GYM_CONFIG.activeToken;
      const dataUrl = await generateQrDataUrl(targetToken, {
        width: 340,
        darkColor: '#0f2744',
        lightColor: '#ffffff'
      });
      setQrImageUrl(dataUrl);
    } catch (err) {
      console.warn('QR code display notice (using offline fallback):', err);
      try {
        setConfig(INITIAL_GYM_CONFIG);
        const dataUrl = await generateQrDataUrl(INITIAL_GYM_CONFIG.activeToken, {
          width: 340,
          darkColor: '#0f2744',
          lightColor: '#ffffff'
        });
        setQrImageUrl(dataUrl);
      } catch (fallbackErr) {
        console.error('Fatal QR display failure:', fallbackErr);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAndRenderQr();
  }, []);

  const handleRegenerate = async () => {
    if (!isAdmin) return;
    setIsRegenerating(true);
    try {
      const newConf = await regenerateGymQrConfig();
      setConfig(newConf);
      const dataUrl = await generateQrDataUrl(newConf.activeToken, {
        width: 340,
        darkColor: '#0f2744',
        lightColor: '#ffffff'
      });
      setQrImageUrl(dataUrl);
      if (onTokenRegenerated) onTokenRegenerated(newConf);
      showToast('QR Token successfully regenerated!');
    } catch (err: any) {
      console.error('QR Regeneration Error:', err);
      alert('Error regenerating QR: ' + err.message);
    } finally {
      setIsRegenerating(false);
    }
  };

  // Bulletproof HTML5 Canvas Standee Export
  const handleDownloadImage = async () => {
    if (!qrImageUrl || isDownloading) return;
    setIsDownloading(true);
    showToast('Downloading QR Image...');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 1050;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not get canvas 2D context');
      }

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Card border & rounded look
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 4;
      ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

      // Header Badge pill
      ctx.fillStyle = '#f0f9ff';
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(canvas.width / 2 - 160, 80, 320, 40, 20);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0369a1';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🛡️ OFFICIAL GYM GATE STANDEE', canvas.width / 2, 105);

      // Title: TORRENT FITNESS
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 36px system-ui, sans-serif';
      ctx.fillText('TORRENT FITNESS', canvas.width / 2, 175);

      // Subtitle instructions
      ctx.fillStyle = '#64748b';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('Scan with your phone to start your 2-hour gym session.', canvas.width / 2, 210);

      // QR Code Box Background
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(canvas.width / 2 - 210, 240, 420, 420, 30);
      ctx.fill();
      ctx.stroke();

      // Draw QR Image inside box
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      qrImg.src = qrImageUrl;

      await new Promise((resolve, reject) => {
        qrImg.onload = resolve;
        qrImg.onerror = reject;
      });

      ctx.drawImage(qrImg, canvas.width / 2 - 180, 270, 360, 360);

      // Token info container
      ctx.fillStyle = '#f1f5f9';
      ctx.strokeStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.roundRect(80, 690, canvas.width - 160, 160, 20);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('ACTIVE TOKEN ID:', 120, 730);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 16px monospace';
      const tokenText = config?.activeToken || 'TORRENT-GATE-TOKEN';
      ctx.fillText(tokenText, 120, 770);

      const timeStr = `Generated: ${new Date().toLocaleString()}`;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(timeStr, 120, 815);

      // Footer brand note
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Torrent Fitness Access Control • Please do not cover or tamper with this standee', canvas.width / 2, 920);

      // Export as PNG
      const imageUri = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = imageUri;
      const cleanDateStr = new Date().toISOString().split('T')[0];
      a.download = `TorrentFitness_Gate_QR_Standee_${cleanDateStr}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('QR Standee downloaded successfully!');
    } catch (err: any) {
      console.error('QR Export Error:', err);
      alert('Failed to download QR image: ' + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyToken = () => {
    if (!config?.activeToken) return;
    copyToClipboard(config.activeToken);
    setCopied(true);
    showToast('Token copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Bulletproof Hidden Iframe Print Method
  const handlePrintStandee = () => {
    setIsPrinting(true);
    showToast('Opening Print Preview...');

    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        throw new Error('Could not access iframe document');
      }

      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Torrent Fitness - Official QR Standee</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              text-align: center;
              background: #ffffff;
              color: #0f172a;
              margin: 0;
              padding: 40px;
            }
            .print-card {
              border: 3px solid #0284c7;
              border-radius: 32px;
              padding: 40px;
              max-width: 480px;
              margin: 0 auto;
              background: #ffffff;
              box-shadow: 0 10px 30px rgba(0,0,0,0.05);
            }
            .badge {
              font-size: 12px;
              font-weight: 800;
              text-transform: uppercase;
              color: #0369a1;
              background: #f0f9ff;
              border: 1px solid #bae6fd;
              padding: 8px 20px;
              border-radius: 9999px;
              display: inline-block;
              margin-bottom: 16px;
            }
            h1 {
              font-size: 32px;
              font-weight: 900;
              margin: 0 0 8px 0;
              color: #0f172a;
              letter-spacing: -0.5px;
            }
            h1 span {
              color: #0284c7;
            }
            p {
              font-size: 15px;
              color: #64748b;
              margin: 0 0 32px 0;
            }
            .qr-wrapper {
              background: #f8fafc;
              border: 2px solid #e2e8f0;
              border-radius: 24px;
              padding: 24px;
              display: inline-block;
              margin-bottom: 32px;
            }
            .qr-wrapper img {
              width: 260px;
              height: 260px;
              object-fit: contain;
              display: block;
            }
            .token-box {
              background: #f1f5f9;
              border: 1px solid #cbd5e1;
              border-radius: 16px;
              padding: 16px;
              text-align: left;
            }
            .token-label {
              font-size: 12px;
              color: #64748b;
              font-weight: 700;
              margin-bottom: 4px;
            }
            .token-val {
              font-family: monospace;
              font-size: 14px;
              font-weight: bold;
              color: #0f172a;
              word-break: break-all;
            }
            .footer-note {
              margin-top: 24px;
              font-size: 12px;
              color: #94a3b8;
              font-weight: 600;
            }
            @media print {
              body { padding: 0; }
              .print-card { border: 2px solid #000; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="print-card">
            <img src="/gym-logo-v2.png?v=20261025_2" style="width: 92px; height: 92px; margin: 0 auto 10px; display: block; border-radius: 50%; object-fit: contain;" alt="Torrent Fitness Logo" />
            <div class="badge">Official Gym Gate Standee</div>
            <h1>TORRENT <span>FITNESS</span></h1>
            <div style="font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #4f46e5; margin-bottom: 6px;">BE MORE DO MORE</div>
            <p>Scan with your phone to start your 2-hour gym session.</p>
            <div class="qr-wrapper">
              <img src="${qrImageUrl}" alt="Gate QR" />
            </div>
            <div class="token-box">
              <div class="token-label">ACTIVE TOKEN ID:</div>
              <div class="token-val">${config?.activeToken || 'N/A'}</div>
            </div>
            <div class="footer-note">
              Torrent Fitness Access Control • Reception Desk Standee
            </div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.focus();
                window.print();
              }, 500);
            };
          </script>
        </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        setIsPrinting(false);
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 2000);
      }, 1000);
    } catch (err: any) {
      console.error('QR Print Error:', err);
      alert('Failed to open print preview: ' + err.message);
      setIsPrinting(false);
    }
  };

  return (
    <div
      ref={standeeRef}
      className="print-standee-container clay-surface rounded-3xl p-6 border border-white/90 shadow-2xl text-slate-800 max-w-sm mx-auto text-center space-y-4 relative overflow-hidden"
    >
      {/* Decorative background glow */}
      <div className="absolute -top-16 -right-16 w-32 h-32 bg-sky-400/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />

      {/* Toast Feedback */}
      {feedbackMsg && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-slate-900 text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-lg animate-fade-in flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-sky-400 animate-spin" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Standee Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 font-bold" />
          <span>Official Gym Gate Standee</span>
        </div>
        <h3 className="text-xl font-black text-slate-800 tracking-tight">
          TORRENT <span className="bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent font-black">FITNESS</span>
        </h3>
        <p className="text-xs text-slate-500">
          Scan with your phone to start your 2-hour gym session.
        </p>
      </div>

      {/* Real High-Resolution Scannable QR Code */}
      <div className="relative mx-auto w-64 h-64 bg-gradient-to-tr from-indigo-500 via-purple-500 to-sky-400 shadow-[0_12px_28px_rgba(99,102,241,0.25),inset_0_1px_2px_rgba(255,255,255,0.7)] p-2.5 rounded-3xl shadow-lg flex items-center justify-center">
        <div className="w-full h-full bg-white rounded-2xl flex items-center justify-center p-3 overflow-hidden shadow-inner relative">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 text-indigo-600 font-bold animate-pulse">
              <QrCode className="w-12 h-12" />
              <span className="text-xs font-bold">Generating QR Code...</span>
            </div>
          ) : qrImageUrl ? (
            <img
              src={qrImageUrl}
              alt="Torrent Fitness Official Reception QR"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-rose-500 text-xs">Failed to load QR code.</div>
          )}
        </div>
      </div>

      {/* Token Details */}
      <div className="vision-inset rounded-2xl p-3.5 space-y-1 text-left">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>Active Token ID:</span>
          <button
            onClick={handleCopyToken}
            className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <div className="font-mono text-xs font-bold text-slate-800 break-all select-all">
          {config?.activeToken || 'Loading token...'}
        </div>
        {config?.generatedAt && (
          <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-1 border-t border-slate-200/60">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Updated: {new Date(config.generatedAt).toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={handleDownloadImage}
          disabled={!qrImageUrl || isDownloading}
          className="py-2.5 px-3 vision-btn-aurora text-white text-xs font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Download className={`w-3.5 h-3.5 ${isDownloading ? 'animate-bounce' : ''}`} />
          <span>{isDownloading ? 'Downloading...' : 'Download QR Poster'}</span>
        </button>

        <button
          onClick={handlePrintStandee}
          disabled={isPrinting || !qrImageUrl}
          className="py-2.5 px-3 vision-btn-neutral text-slate-700 font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Printer className={`w-3.5 h-3.5 ${isPrinting ? 'animate-pulse' : ''}`} />
          <span>{isPrinting ? 'Preparing...' : 'Print Poster / Standee'}</span>
        </button>
      </div>

      {/* Admin 2-Step Regeneration Button */}
      {isAdmin && (
        <div className="pt-2 border-t border-slate-200/60">
          <button
            type="button"
            onClick={() => setShowConfirmRegenerate(true)}
            disabled={isRegenerating}
            className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-rose-600" />
            <span>Regenerate Gym QR Code (2-Step Invalidation)</span>
          </button>
          <p className="text-[10px] text-slate-500 mt-1">
            Regenerating invalidates all previous QR printouts immediately with zero downtime.
          </p>
        </div>
      )}

      {/* 2-Step Confirmation Modal for Admin QR Regeneration */}
      {showConfirmRegenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-rose-500/40 rounded-3xl p-5 text-white shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-black text-white">Regenerate Gym QR Code?</h4>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                This will immediately invalidate the current reception QR code. Any member scanning an older QR code will be rejected with an <strong>"Invalid or Expired QR"</strong> error. You must print/display this new QR poster at the desk.
              </p>
            </div>
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={async () => {
                  await handleRegenerate();
                  setShowConfirmRegenerate(false);
                }}
                disabled={isRegenerating}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-xs rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50"
              >
                {isRegenerating ? 'Invalidating & Generating...' : 'Yes, Invalidate & Generate New QR'}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmRegenerate(false)}
                disabled={isRegenerating}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
