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

  // Bulletproof HTML5 Canvas Standee Export (Modern & Stylish Gym Wall Poster, NO Phone Numbers)
  const handleDownloadImage = async () => {
    if (!qrImageUrl || isDownloading) return;
    setIsDownloading(true);
    showToast('Downloading High-Resolution QR Poster...');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 1280;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not get canvas 2D context');
      }

      // 1. Deep Dark Obsidian & Navy Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, '#060a14');
      bgGrad.addColorStop(0.5, '#0b1426');
      bgGrad.addColorStop(1, '#060a14');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Radial top glow
      const radialGlow = ctx.createRadialGradient(450, 160, 20, 450, 160, 420);
      radialGlow.addColorStop(0, 'rgba(14, 165, 233, 0.18)');
      radialGlow.addColorStop(1, 'rgba(14, 165, 233, 0)');
      ctx.fillStyle = radialGlow;
      ctx.fillRect(0, 0, canvas.width, 500);

      // Outer Decorative Border
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(35, 35, canvas.width - 70, canvas.height - 70, 28);
      ctx.stroke();

      // Inner subtle border
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(45, 45, canvas.width - 90, canvas.height - 90, 22);
      ctx.stroke();

      // 2. Header Badge Pill
      ctx.fillStyle = 'rgba(2, 132, 199, 0.18)';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(canvas.width / 2 - 170, 65, 340, 36, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ OFFICIAL GYM GATE ATTENDANCE', canvas.width / 2, 88);

      // 3. Gym Logo
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.src = '/gym-logo-v2.png?v=20261025_2';
        await new Promise((resolve) => {
          logoImg.onload = resolve;
          logoImg.onerror = resolve; // gracefully continue if missing
        });
        if (logoImg.complete && logoImg.naturalWidth !== 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(canvas.width / 2, 165, 42, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(logoImg, canvas.width / 2 - 42, 123, 84, 84);
          ctx.restore();
          // Logo ring
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(canvas.width / 2, 165, 43, 0, Math.PI * 2);
          ctx.stroke();
        }
      } catch {}

      // 4. Brand Title & Tagline
      ctx.textAlign = 'center';
      ctx.font = '900 42px system-ui, sans-serif';
      // "TORRENT" in white, "FITNESS" in electric blue
      ctx.fillStyle = '#ffffff';
      ctx.fillText('TORRENT ', canvas.width / 2 - 80, 260);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('FITNESS', canvas.width / 2 + 85, 260);

      // Tagline: BE MORE DO MORE
      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.letterSpacing = '3px';
      ctx.fillText('BE MORE DO MORE', canvas.width / 2, 290);

      // 5. "SCAN TO CHECK IN" Badge
      ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(canvas.width / 2 - 130, 318, 260, 34, 17);
      ctx.fill();
      ctx.stroke();

      // Green active dot
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(canvas.width / 2 - 95, 335, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ecfdf5';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('SCAN TO CHECK IN', canvas.width / 2 + 10, 340);

      // 6. Central QR Scanner Box with Sleek Geometric Corner Brackets
      const qrBoxSize = 440;
      const qrBoxX = canvas.width / 2 - qrBoxSize / 2;
      const qrBoxY = 370;

      // Dark scanner frame background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 28);
      ctx.fill();
      ctx.stroke();

      // Neon Electric Blue Geometric Corner Brackets
      const bracketLen = 42;
      const bracketThickness = 6;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = bracketThickness;
      ctx.lineCap = 'round';

      // Top-Left bracket
      ctx.beginPath();
      ctx.moveTo(qrBoxX + 16, qrBoxY + 16 + bracketLen);
      ctx.lineTo(qrBoxX + 16, qrBoxY + 16);
      ctx.lineTo(qrBoxX + 16 + bracketLen, qrBoxY + 16);
      ctx.stroke();

      // Top-Right bracket
      ctx.beginPath();
      ctx.moveTo(qrBoxX + qrBoxSize - 16 - bracketLen, qrBoxY + 16);
      ctx.lineTo(qrBoxX + qrBoxSize - 16, qrBoxY + 16);
      ctx.lineTo(qrBoxX + qrBoxSize - 16, qrBoxY + 16 + bracketLen);
      ctx.stroke();

      // Bottom-Left bracket
      ctx.beginPath();
      ctx.moveTo(qrBoxX + 16, qrBoxY + qrBoxSize - 16 - bracketLen);
      ctx.lineTo(qrBoxX + 16, qrBoxY + qrBoxSize - 16);
      ctx.lineTo(qrBoxX + 16 + bracketLen, qrBoxY + qrBoxSize - 16);
      ctx.stroke();

      // Bottom-Right bracket
      ctx.beginPath();
      ctx.moveTo(qrBoxX + qrBoxSize - 16 - bracketLen, qrBoxY + qrBoxSize - 16);
      ctx.lineTo(qrBoxX + qrBoxSize - 16, qrBoxY + qrBoxSize - 16);
      ctx.lineTo(qrBoxX + qrBoxSize - 16, qrBoxY + qrBoxSize - 16 - bracketLen);
      ctx.stroke();

      // White QR code container inside
      const whiteTileSize = 350;
      const whiteTileX = canvas.width / 2 - whiteTileSize / 2;
      const whiteTileY = qrBoxY + (qrBoxSize - whiteTileSize) / 2;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(whiteTileX, whiteTileY, whiteTileSize, whiteTileSize, 20);
      ctx.fill();

      // Draw QR Image
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      qrImg.src = qrImageUrl;

      await new Promise((resolve, reject) => {
        qrImg.onload = resolve;
        qrImg.onerror = reject;
      });

      const qrPad = 15;
      ctx.drawImage(
        qrImg,
        whiteTileX + qrPad,
        whiteTileY + qrPad,
        whiteTileSize - (qrPad * 2),
        whiteTileSize - (qrPad * 2)
      );

      // 7. Clear 3-Step Visual Instructions Box
      const instructBoxY = 835;
      const instructBoxW = 760;
      const instructBoxH = 150;
      const instructBoxX = canvas.width / 2 - instructBoxW / 2;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(instructBoxX, instructBoxY, instructBoxW, instructBoxH, 20);
      ctx.fill();
      ctx.stroke();

      // Instruction heading
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('3 EASY STEPS TO CHECK IN', canvas.width / 2, instructBoxY + 32);

      // 3 Steps
      const stepY = instructBoxY + 75;
      const step1X = canvas.width / 2 - 250;
      const step2X = canvas.width / 2;
      const step3X = canvas.width / 2 + 250;

      // Step badges
      const drawStepBadge = (num: string, title: string, subtitle: string, xPos: number) => {
        // Circle number
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(xPos, stepY - 6, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(num, xPos, stepY - 1);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(title, xPos, stepY + 30);

        // Subtitle
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(subtitle, xPos, stepY + 48);
      };

      drawStepBadge('1', 'Open App', 'Torrent Fitness App', step1X);
      drawStepBadge('2', 'Tap Scan QR', 'On Client Home Screen', step2X);
      drawStepBadge('3', 'Start Session', 'Point Camera & Check In', step3X);

      // 8. Active Token & Access Details Box
      const tokenBoxY = 1005;
      const tokenBoxW = 760;
      const tokenBoxH = 80;
      const tokenBoxX = canvas.width / 2 - tokenBoxW / 2;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tokenBoxX, tokenBoxY, tokenBoxW, tokenBoxH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText('ACTIVE GATE TOKEN:', tokenBoxX + 24, tokenBoxY + 32);

      const tokenText = config?.activeToken || 'TORRENT-GATE-TOKEN';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(tokenText, tokenBoxX + 24, tokenBoxY + 56);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748b';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`Valid Gym Session: 2 Hours`, tokenBoxX + tokenBoxW - 24, tokenBoxY + 32);
      ctx.fillText(`Auto Session Reset on Checkout`, tokenBoxX + tokenBoxW - 24, tokenBoxY + 56);

      // 9. Modern Gym Address Footer (NO Phone Numbers)
      ctx.textAlign = 'center';
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('Sakri Rd, Opposite Sinchan Bhavan, Dhule, Maharashtra', canvas.width / 2, 1140);

      ctx.fillStyle = '#475569';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('Torrent Fitness Reception Access Control • Please do not tamper with or obstruct this QR poster', canvas.width / 2, 1170);

      // Export as PNG
      const imageUri = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = imageUri;
      const cleanDateStr = new Date().toISOString().split('T')[0];
      a.download = `TorrentFitness_Gate_QR_Poster_${cleanDateStr}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('QR Poster downloaded successfully!');
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

  // Bulletproof Hidden Iframe Print Method (A4 Modern Gym Wall Poster, NO Phone Numbers)
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
          <title>Torrent Fitness - Gate Attendance Poster</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              text-align: center;
              background: #060a14;
              color: #ffffff;
              margin: 0;
              padding: 0;
              width: 210mm;
              min-height: 297mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }
            .poster-card {
              width: 186mm;
              border: 3px solid #0284c7;
              border-radius: 28px;
              background: linear-gradient(180deg, #0b1426 0%, #060a14 100%);
              padding: 28px 24px;
              margin: auto;
              box-shadow: 0 0 50px rgba(2, 132, 199, 0.25);
              position: relative;
              overflow: hidden;
            }
            .badge-top {
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              color: #38bdf8;
              background: rgba(2, 132, 199, 0.18);
              border: 1px solid #0284c7;
              padding: 6px 18px;
              border-radius: 9999px;
              display: inline-block;
              margin-bottom: 14px;
            }
            .logo-img {
              width: 82px;
              height: 82px;
              margin: 0 auto 10px;
              display: block;
              border-radius: 50%;
              object-fit: contain;
              border: 2px solid #38bdf8;
              box-shadow: 0 0 20px rgba(56, 189, 248, 0.35);
            }
            h1 {
              font-size: 34px;
              font-weight: 900;
              margin: 0 0 4px 0;
              color: #ffffff;
              letter-spacing: -0.5px;
            }
            h1 span {
              color: #38bdf8;
            }
            .tagline {
              font-size: 13px;
              font-weight: 800;
              letter-spacing: 3px;
              text-transform: uppercase;
              color: #818cf8;
              margin-bottom: 12px;
            }
            .checkin-pill {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              background: rgba(16, 185, 129, 0.15);
              border: 1px solid #10b981;
              color: #ecfdf5;
              font-size: 12px;
              font-weight: 800;
              padding: 6px 16px;
              border-radius: 9999px;
              margin-bottom: 16px;
            }
            .dot-green {
              width: 8px;
              height: 8px;
              background: #10b981;
              border-radius: 50%;
              display: inline-block;
            }
            /* Geometric Scanner Frame */
            .scanner-frame {
              position: relative;
              background: rgba(15, 23, 42, 0.9);
              border: 2px solid #1e3a5f;
              border-radius: 24px;
              padding: 24px;
              display: inline-block;
              margin: 0 auto 20px;
              box-shadow: inset 0 0 30px rgba(2, 132, 199, 0.15);
            }
            .corner {
              position: absolute;
              width: 28px;
              height: 28px;
              border-color: #38bdf8;
              border-style: solid;
            }
            .corner-tl { top: 8px; left: 8px; border-width: 4px 0 0 4px; border-radius: 6px 0 0 0; }
            .corner-tr { top: 8px; right: 8px; border-width: 4px 4px 0 0; border-radius: 0 6px 0 0; }
            .corner-bl { bottom: 8px; left: 8px; border-width: 0 0 4px 4px; border-radius: 0 0 0 6px; }
            .corner-br { bottom: 8px; right: 8px; border-width: 0 4px 4px 0; border-radius: 0 0 6px 0; }
            .qr-white-tile {
              background: #ffffff;
              border-radius: 18px;
              padding: 14px;
              display: block;
              margin: 0 auto;
            }
            .qr-white-tile img {
              width: 250px;
              height: 250px;
              object-fit: contain;
              display: block;
            }
            /* 3-Step Instructions Box */
            .instructions-box {
              background: rgba(15, 23, 42, 0.75);
              border: 1px solid #1e3a5f;
              border-radius: 18px;
              padding: 14px 20px;
              margin: 0 auto 16px;
              max-width: 95%;
            }
            .instructions-title {
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              color: #38bdf8;
              margin-bottom: 12px;
            }
            .steps-row {
              display: flex;
              align-items: center;
              justify-content: space-around;
              gap: 12px;
            }
            .step-col {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
            }
            .step-circle {
              width: 26px;
              height: 26px;
              border-radius: 50%;
              background: #0284c7;
              color: #ffffff;
              font-size: 13px;
              font-weight: 900;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 6px;
            }
            .step-text {
              font-size: 12px;
              font-weight: 700;
              color: #ffffff;
            }
            .step-sub {
              font-size: 10px;
              color: #94a3b8;
              margin-top: 2px;
            }
            /* Token Details */
            .token-box {
              background: rgba(15, 23, 42, 0.6);
              border: 1px solid #1e293b;
              border-radius: 14px;
              padding: 10px 18px;
              margin: 0 auto 16px;
              max-width: 95%;
              display: flex;
              align-items: center;
              justify-content: space-between;
              text-align: left;
            }
            .token-label {
              font-size: 10px;
              color: #64748b;
              font-weight: 800;
              text-transform: uppercase;
            }
            .token-val {
              font-family: monospace;
              font-size: 13px;
              font-weight: bold;
              color: #e2e8f0;
            }
            .session-note {
              font-size: 10px;
              color: #94a3b8;
              text-align: right;
            }
            /* Gym Address Footer */
            .footer-address {
              font-size: 12px;
              font-weight: 700;
              color: #94a3b8;
              margin-bottom: 4px;
            }
            .footer-disclaimer {
              font-size: 10px;
              color: #475569;
            }
          </style>
        </head>
        <body>
          <div class="poster-card">
            <div class="badge-top">⚡ OFFICIAL GYM GATE ATTENDANCE</div>
            <img src="/gym-logo-v2.png?v=20261025_2" class="logo-img" alt="Torrent Fitness Logo" />
            <h1>TORRENT <span>FITNESS</span></h1>
            <div class="tagline">BE MORE DO MORE</div>
            <div>
              <div class="checkin-pill">
                <span class="dot-green"></span>
                <span>SCAN TO CHECK IN</span>
              </div>
            </div>

            <div class="scanner-frame">
              <div class="corner corner-tl"></div>
              <div class="corner corner-tr"></div>
              <div class="corner corner-bl"></div>
              <div class="corner corner-br"></div>
              <div class="qr-white-tile">
                <img src="${qrImageUrl}" alt="Gate Attendance QR" />
              </div>
            </div>

            <div class="instructions-box">
              <div class="instructions-title">3 Easy Steps to Check In</div>
              <div class="steps-row">
                <div class="step-col">
                  <div class="step-circle">1</div>
                  <div class="step-text">Open App</div>
                  <div class="step-sub">Torrent Fitness</div>
                </div>
                <div class="step-col">
                  <div class="step-circle">2</div>
                  <div class="step-text">Tap Scan QR</div>
                  <div class="step-sub">On Home Screen</div>
                </div>
                <div class="step-col">
                  <div class="step-circle">3</div>
                  <div class="step-text">Start Session</div>
                  <div class="step-sub">Point & Check In</div>
                </div>
              </div>
            </div>

            <div class="token-box">
              <div>
                <div class="token-label">ACTIVE GATE TOKEN</div>
                <div class="token-val">${config?.activeToken || 'N/A'}</div>
              </div>
              <div class="session-note">
                Valid Session: 2 Hours<br />
                Single Active Session Lock
              </div>
            </div>

            <div class="footer-address">
              Sakri Rd, Opposite Sinchan Bhavan, Dhule, Maharashtra
            </div>
            <div class="footer-disclaimer">
              Torrent Fitness Reception Desk • Please do not tamper with or cover this standee
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
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200">
          <ShieldCheck className="w-3.5 h-3.5 text-sky-600 font-bold" />
          <span>Official Gym Gate Standee</span>
        </div>
        <h3 className="text-xl font-black text-slate-800 tracking-tight">
          TORRENT <span className="bg-gradient-to-r from-sky-600 to-indigo-600 bg-clip-text text-transparent font-black">FITNESS</span>
        </h3>
        <div className="text-[11px] font-black tracking-widest uppercase text-indigo-600">
          BE MORE DO MORE
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>SCAN TO CHECK IN</span>
        </div>
        <p className="text-xs text-slate-500 pt-0.5">
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

      {/* 3-Step Quick Instruction Preview */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 text-[11px] text-slate-600">
        <div className="font-bold text-sky-700 uppercase tracking-wider text-[10px] mb-1">
          Quick Check-In Steps
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium px-1">
          <span>1. Open App</span>
          <span>•</span>
          <span>2. Tap Scan QR</span>
          <span>•</span>
          <span>3. Start Session</span>
        </div>
      </div>

      {/* Gym Address Footer (NO Phone Numbers) */}
      <div className="text-[10px] text-slate-400 font-medium leading-tight">
        📍 Sakri Rd, Opposite Sinchan Bhavan, Dhule, Maharashtra
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
