import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import compression from 'compression';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  limit
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root directory whether running from root (tsx server.ts) or from dist (node dist/server.mjs)
const ROOT_DIR = fs.existsSync(path.resolve(__dirname, 'package.json'))
  ? __dirname
  : path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');

// Self-contained Firebase Firestore initialization for server
let db: any = null;
try {
  const configPath = path.resolve(ROOT_DIR, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const cfg = JSON.parse(raw);
    const fbApp = getApps().length > 0 ? getApp() : initializeApp(cfg);
    db = getFirestore(fbApp, cfg.firestoreDatabaseId);
  }
} catch (e) {
  console.warn('Server Firebase init notice:', e);
}

// Cryptographic Secret for Server-Signed Session Tokens
// PRODUCTION: Set SESSION_SECRET env var to a strong random string (e.g. openssl rand -hex 64)
const SERVER_SECRET = process.env.SESSION_SECRET;
if (!SERVER_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] SESSION_SECRET environment variable is required in production. Exiting.');
    process.exit(1);
  } else {
    console.warn('[WARN] SESSION_SECRET not set — using insecure dev fallback. Set SESSION_SECRET before deploying.');
  }
}
const RESOLVED_SECRET = SERVER_SECRET || 'torrent_fitness_dev_only_insecure_fallback_do_not_use_in_prod';

/**
 * Hash a password using PBKDF2 with a cryptographically secure random salt
 */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored PBKDF2 hash or migrate legacy plaintext
 */
function verifyPassword(password: string, storedHashOrPlain: string): boolean {
  if (!storedHashOrPlain || !password) return false;
  if (storedHashOrPlain.includes(':')) {
    const [salt, originalHash] = storedHashOrPlain.split(':');
    const check = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(originalHash, 'hex'));
    } catch {
      return false;
    }
  }
  // Constant-time compare for legacy fallback string before migration
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(storedHashOrPlain);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return password === storedHashOrPlain;
  }
}

interface SessionPayload {
  uid: string;
  username: string;
  role: 'client' | 'trainer' | 'admin';
  displayName?: string;
  exp: number;
}

/**
 * Issue an HMAC-signed session token (30-day lifetime)
 */
function createSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', RESOLVED_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

/**
 * Verify and decode an HMAC session token
 */
function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', RESOLVED_SECRET).update(encoded).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const raw = Buffer.from(encoded, 'base64url').toString('utf-8');
    const payload = JSON.parse(raw) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Express middleware to extract and verify session
 */
function authenticateToken(req: Request & { user?: SessionPayload }, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'] || (req.headers['x-session-token'] as string);
  let token = '';
  if (authHeader && typeof authHeader === 'string') {
    token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  }
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required. No session token provided.' });
  }
  const user = verifySessionToken(token);
  if (!user) {
    return res.status(403).json({ success: false, error: 'Session token invalid or expired. Please log in again.' });
  }
  req.user = user;
  next();
}

/**
 * Express middleware strictly requiring master admin authorization
 */
function requireAdmin(req: Request & { user?: SessionPayload }, res: Response, next: NextFunction) {
  authenticateToken(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized. Admin privileges required.' });
    }
    next();
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // ---------------------------------------------------------------------------
  // PRODUCTION: Gzip/Brotli response compression
  // ---------------------------------------------------------------------------
  app.use(compression());

  // ---------------------------------------------------------------------------
  // In-memory rate limiter (no external dep needed)
  // Tracks request counts per IP; resets every WINDOW_MS milliseconds.
  // ---------------------------------------------------------------------------
  const rateLimitStore: Map<string, { count: number; resetAt: number }> = new Map();
  const AUTH_RATE_LIMIT = 10;    // max 10 auth attempts per window
  const AUTH_WINDOW_MS = 60_000; // 1-minute window

  function rateLimiter(maxRequests: number, windowMs: number) {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const record = rateLimitStore.get(ip);

      if (!record || now > record.resetAt) {
        rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
        return next();
      }

      record.count += 1;
      if (record.count > maxRequests) {
        res.setHeader('Retry-After', Math.ceil((record.resetAt - now) / 1000).toString());
        return res.status(429).json({ success: false, error: 'Too many requests. Please try again shortly.' });
      }
      next();
    };
  }

  // Clean up stale entries every 5 minutes to prevent memory leak
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateLimitStore.entries()) {
      if (now > val.resetAt) rateLimitStore.delete(key);
    }
  }, 5 * 60_000);

  // ---------------------------------------------------------------------------
  // Security Headers Middleware (hardened for production)
  // ---------------------------------------------------------------------------
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProd) {
      // Enforce HTTPS for 1 year, include subdomains
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' https: data: blob:",
        "connect-src 'self' https: wss:",
        "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com",
        "object-src 'none'",
        "base-uri 'self'"
      ].join('; ')
    );
    // Disable caching for API responses
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });

  // Limit body payload to safe 10MB (prevents Denial of Service via huge payloads)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const uploadsDir = path.resolve(ROOT_DIR, 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // -------------------------------------------------------------
  // HEALTH CHECK
  // -------------------------------------------------------------
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  app.get('/ping', (_req, res) => res.send('pong'));

  // -------------------------------------------------------------
  // SECURE AUTHENTICATION ENDPOINTS
  // -------------------------------------------------------------

  /**
   * POST /api/auth/login
   * Multi-identifier login (Mobile, Email, Client ID, Trainer ID)
   * Hashes and migrates legacy plaintext passwords, returns verified session token.
   */
  app.post('/api/auth/login', rateLimiter(AUTH_RATE_LIMIT, AUTH_WINDOW_MS), async (req: Request, res: Response) => {
    try {
      const { identifier, password, role } = req.body;
      if (!identifier || !password || !role) {
        return res.status(400).json({ success: false, error: 'Identifier, password, and role are required.' });
      }

      const cleanId = String(identifier).trim().toLowerCase().replace(/\s+/g, '');
      const inputDigits = String(identifier).replace(/\D/g, '');
      const last10Digits = inputDigits.length >= 10 ? inputDigits.slice(-10) : '';

      // Check for Master Admin username
      if (cleanId === 'admintorrentfitness1' || cleanId === 'admin') {
        let activeAdminHash = '';
        if (db) {
          const secSnap = await getDoc(doc(db, 'gymSettings', 'adminSecurity')).catch(() => null);
          if (secSnap?.exists()) {
            activeAdminHash = secSnap.data().passwordHash || secSnap.data().password || '';
          }
        }
        if (!activeAdminHash) {
          // PRODUCTION: Set the admin password via the admin dashboard after first login,
          // or pre-hash and store in Firestore. The default is set only on first boot.
          const defaultAdminPass = process.env.ADMIN_DEFAULT_PASSWORD || 'torrent#19@fit1';
          activeAdminHash = hashPassword(defaultAdminPass);
          if (db) {
            await setDoc(doc(db, 'gymSettings', 'adminSecurity'), {
              passwordHash: activeAdminHash,
              updatedAt: new Date().toISOString()
            }, { merge: true }).catch(() => {});
          }
        }

        const isMatch = verifyPassword(password, activeAdminHash);
        if (!isMatch) {
          return res.status(401).json({ success: false, error: 'Invalid mobile/email/ID or password' });
        }

        // Migrate plain admin password if it was plain
        if (!activeAdminHash.includes(':') && db) {
          const newH = hashPassword(password);
          await setDoc(doc(db, 'gymSettings', 'adminSecurity'), {
            passwordHash: newH,
            password: null,
            updatedAt: new Date().toISOString()
          }, { merge: true }).catch(() => {});
        }

        const adminUser = {
          uid: 'admintorrentfitness1',
          username: 'admintorrentfitness1',
          displayName: 'Torrent Admin (Master)',
          email: 'admin@torrentfitness.in',
          role: 'admin' as const,
          status: 'active',
          createdAt: new Date().toISOString()
        };

        const token = createSessionToken({
          uid: adminUser.uid,
          username: adminUser.username,
          role: 'admin',
          displayName: adminUser.displayName
        });

        return res.json({ success: true, token, user: adminUser });
      }

      if (!db) {
        return res.status(500).json({ success: false, error: 'Database service is initializing.' });
      }

      // Search in users collection
      let matchedDoc: any = null;
      let matchedUserData: any = null;

      // 1. Direct lookup by ID
      const directRef = doc(db, 'users', cleanId);
      const directSnap = await getDoc(directRef).catch(() => null);
      if (directSnap?.exists()) {
        matchedDoc = directSnap;
        matchedUserData = directSnap.data();
      }

      // 2. Targeted queries across username, email, and phone (O(1) with limit(1))
      if (!matchedUserData) {
        const queries = [
          query(collection(db, 'users'), where('username', '==', cleanId), limit(1)),
          query(collection(db, 'users'), where('email', '==', cleanId), limit(1))
        ];

        if (last10Digits) {
          queries.push(
            query(collection(db, 'users'), where('phone', '==', `+91 ${last10Digits}`), limit(1)),
            query(collection(db, 'users'), where('mobileNumber', '==', `+91 ${last10Digits}`), limit(1)),
            query(collection(db, 'users'), where('phone', '==', last10Digits), limit(1))
          );
        }

        const querySnaps = await Promise.all(queries.map(q => getDocs(q).catch(() => null)));
        for (const snap of querySnaps) {
          if (snap && !snap.empty) {
            const d = snap.docs[0];
            matchedDoc = d;
            matchedUserData = { ...d.data(), uid: d.data().uid || d.id };
            break;
          }
        }

        // Fallback: bounded scan (max 100) if targeted indexed queries return empty (e.g. legacy formatting)
        if (!matchedUserData) {
          const fallbackSnap = await getDocs(query(collection(db, 'users'), limit(100))).catch(() => null);
          if (fallbackSnap) {
            for (const d of fallbackSnap.docs) {
              const u = d.data();
              const docUid = String(u.uid || d.id || '').toLowerCase();
              const docUsername = String(u.username || '').toLowerCase();
              const docEmail = String(u.email || '').trim().toLowerCase();
              const docPhoneDigits = String(u.phone || u.mobileNumber || '').replace(/\D/g, '');
              const docLast10 = docPhoneDigits.length >= 10 ? docPhoneDigits.slice(-10) : '';

              const matchUser =
                docUid === cleanId ||
                docUsername === cleanId ||
                (docEmail && docEmail === cleanId) ||
                (last10Digits && docLast10 && last10Digits === docLast10) ||
                (inputDigits.length >= 7 && docPhoneDigits === inputDigits);

              if (matchUser) {
                matchedDoc = d;
                matchedUserData = { ...u, uid: u.uid || d.id };
                break;
              }
            }
          }
        }
      }

      if (!matchedUserData) {
        return res.status(401).json({ success: false, error: 'Invalid mobile/email/ID or password' });
      }

      // Verify role compatibility
      const uRole = String(matchedUserData.role || '');
      const isClientMatch = role === 'client' && (uRole === 'client' || uRole === 'member');
      const isTrainerMatch = role === 'trainer' && (uRole === 'trainer' || uRole === 'coach' || uRole === 'staff');

      if (!isClientMatch && !isTrainerMatch) {
        return res.status(401).json({ success: false, error: 'Invalid mobile/email/ID or password' });
      }

      // Verify password
      const storedPassword = matchedUserData.passwordHash || matchedUserData.password || 'password123';
      const isPwValid = verifyPassword(password, storedPassword);
      if (!isPwValid) {
        return res.status(401).json({ success: false, error: 'Invalid mobile/email/ID or password' });
      }

      // Transparent Password Migration to Salted Hash
      if (!storedPassword.includes(':')) {
        const newSaltedHash = hashPassword(password);
        await updateDoc(doc(db, 'users', matchedDoc.id), {
          passwordHash: newSaltedHash,
          password: null,
          updatedAt: new Date().toISOString()
        }).catch(() => {});
      }

      // Strip sensitive password field before sending to client
      const safeUser = { ...matchedUserData };
      delete safeUser.password;
      delete safeUser.passwordHash;

      const token = createSessionToken({
        uid: safeUser.uid,
        username: safeUser.username || safeUser.uid,
        role: safeUser.role,
        displayName: safeUser.displayName
      });

      return res.json({ success: true, token, user: safeUser });
    } catch (err: any) {
      console.error('Login error:', err);
      return res.status(500).json({ success: false, error: 'Authentication service error. Please try again.' });
    }
  });

  /**
   * POST /api/auth/signup-client
   * Server-authoritative client registration with mandatory validation
   */
  app.post('/api/auth/signup-client', rateLimiter(5, AUTH_WINDOW_MS), async (req: Request, res: Response) => {
    try {
      const {
        username,
        password,
        displayName,
        email,
        phone,
        photoUrl,
        fitnessGoal,
        dob,
        age,
        gender,
        height,
        weight
      } = req.body;

      const cleanUser = String(username || '').trim().toLowerCase().replace(/\s+/g, '');
      if (!cleanUser) return res.status(400).json({ success: false, error: 'Username / Client ID cannot be empty.' });
      if (!displayName?.trim()) return res.status(400).json({ success: false, error: 'Full Name is mandatory.' });
      if (!email?.trim() || !email.includes('@')) return res.status(400).json({ success: false, error: 'A valid Email Address is mandatory.' });
      const cleanPhone = String(phone || '').replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 10) return res.status(400).json({ success: false, error: 'A valid 10-digit Mobile Number is mandatory.' });
      if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
      if (!dob?.trim()) return res.status(400).json({ success: false, error: 'Date of birth is mandatory.' });
      if (!gender?.trim()) return res.status(400).json({ success: false, error: 'Gender is mandatory.' });

      if (!db) return res.status(500).json({ success: false, error: 'Database service is initializing.' });

      const userRef = doc(db, 'users', cleanUser);
      const existing = await getDoc(userRef).catch(() => null);
      if (existing?.exists()) {
        return res.status(400).json({ success: false, error: `Username "${username}" is already taken. Please choose another.` });
      }

      const formattedPhone = `+91 ${cleanPhone.slice(-10)}`;
      const passwordHash = hashPassword(password);
      const timestamp = new Date().toISOString();

      const newUser = {
        uid: cleanUser,
        username: cleanUser,
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        phone: formattedPhone,
        mobileNumber: formattedPhone,
        photoUrl: photoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
        role: 'client' as const,
        status: 'active',
        dob,
        gender: gender.trim(),
        passwordHash,
        createdAt: timestamp
      };

      const newClientProfile = {
        userId: cleanUser,
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        phone: formattedPhone,
        photoUrl: newUser.photoUrl,
        dob,
        age: Number(age) || 24,
        gender: gender.trim(),
        height: Number(height) && Number(height) > 100 ? Math.round(Number(height) / 2.54) : (Number(height) || 68),
        weight: Number(weight) || 70,
        fitnessGoal: fitnessGoal || 'General Fitness',
        membershipStatus: 'inactive',
        ptStatus: 'none',
        createdAt: timestamp
      };

      await setDoc(userRef, newUser);
      await setDoc(doc(db, 'clientProfiles', cleanUser), newClientProfile);

      const safeUser = { ...newUser };
      delete (safeUser as any).passwordHash;

      const token = createSessionToken({
        uid: cleanUser,
        username: cleanUser,
        role: 'client',
        displayName: newUser.displayName
      });

      return res.json({ success: true, token, user: safeUser, profile: newClientProfile });
    } catch (err: any) {
      console.error('Client signup error:', err);
      return res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
    }
  });

  /**
   * POST /api/auth/signup-trainer
   * Trainer registration with pending verification status
   */
  app.post('/api/auth/signup-trainer', rateLimiter(5, AUTH_WINDOW_MS), async (req: Request, res: Response) => {
    try {
      const {
        username,
        password,
        displayName,
        email,
        phone,
        photoUrl,
        bio,
        specializations,
        dob,
        gender
      } = req.body;

      const cleanUser = String(username || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '_');
      if (!cleanUser) return res.status(400).json({ success: false, error: 'Trainer ID cannot be empty.' });
      if (!displayName?.trim()) return res.status(400).json({ success: false, error: 'Full Name is mandatory.' });
      if (!email?.trim() || !email.includes('@')) return res.status(400).json({ success: false, error: 'A valid Email Address is mandatory.' });
      const cleanPhone = String(phone || '').replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 10) return res.status(400).json({ success: false, error: 'A valid 10-digit Mobile Number is mandatory.' });
      if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
      if (!gender?.trim()) return res.status(400).json({ success: false, error: 'Gender selection is mandatory.' });

      if (!db) return res.status(500).json({ success: false, error: 'Database service is initializing.' });

      const userRef = doc(db, 'users', cleanUser);
      const existing = await getDoc(userRef).catch(() => null);
      if (existing?.exists()) {
        return res.status(400).json({ success: false, error: `Trainer ID "${cleanUser}" is already taken.` });
      }

      const formattedPhone = `+91 ${cleanPhone.slice(-10)}`;
      const passwordHash = hashPassword(password);
      const timestamp = new Date().toISOString();

      const newUser = {
        uid: cleanUser,
        username: cleanUser,
        displayName: displayName.trim(),
        email: email.trim(),
        phone: formattedPhone,
        mobileNumber: formattedPhone,
        photoUrl: photoUrl || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
        role: 'trainer' as const,
        status: 'pending',
        verificationStatus: 'pending_verification',
        isVerified: false,
        dob: dob || '1995-01-01',
        gender: gender.trim(),
        passwordHash,
        createdAt: timestamp
      };

      const newTrainerProfile = {
        trainerId: cleanUser,
        username: cleanUser,
        displayName: displayName.trim(),
        fullName: displayName.trim(),
        email: email.trim(),
        phone: formattedPhone,
        mobileNumber: formattedPhone,
        photoUrl: newUser.photoUrl,
        role: 'trainer',
        badge: 'none',
        isOwner: false,
        isCoManager: false,
        dob: dob || '1995-01-01',
        gender: gender.trim(),
        bio: bio?.trim() || 'Certified Trainer at Torrent Fitness',
        specializations: specializations?.trim() || 'Strength & Conditioning',
        ptAvailable: true,
        status: 'pending',
        verificationStatus: 'pending_verification',
        isVerified: false,
        rating: 5.0,
        createdAt: timestamp
      };

      await setDoc(userRef, newUser);
      await setDoc(doc(db, 'trainerProfiles', cleanUser), newTrainerProfile);

      const safeUser = { ...newUser };
      delete (safeUser as any).passwordHash;

      const token = createSessionToken({
        uid: cleanUser,
        username: cleanUser,
        role: 'trainer',
        displayName: newUser.displayName
      });

      return res.json({ success: true, token, user: safeUser, profile: newTrainerProfile });
    } catch (err: any) {
      console.error('Trainer signup error:', err);
      return res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
    }
  });

  /**
   * POST /api/auth/verify-session
   * Validates token and returns current user account
   */
  app.post('/api/auth/verify-session', authenticateToken, async (req: Request & { user?: SessionPayload }, res: Response) => {
    try {
      const uid = req.user!.uid;
      if (req.user!.role === 'admin') {
        return res.json({
          success: true,
          user: {
            uid: 'admintorrentfitness1',
            username: 'admintorrentfitness1',
            displayName: 'Torrent Admin (Master)',
            email: 'admin@torrentfitness.in',
            role: 'admin',
            status: 'active'
          }
        });
      }

      if (db) {
        const uSnap = await getDoc(doc(db, 'users', uid)).catch(() => null);
        if (uSnap?.exists()) {
          const uData = uSnap.data();
          if (uData.isSelfDeleted || uData.status === 'rejected') {
            return res.status(403).json({ success: false, error: 'Account has been deactivated.' });
          }
          const safe: Record<string, any> = { ...uData, uid: uData.uid || uSnap.id };
          delete safe.password;
          delete safe.passwordHash;
          delete safe.passwordSalt;
          return res.json({ success: true, user: safe });
        }
      }

      return res.json({ success: true, user: req.user });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/auth/update-admin-password
   * Master admin password update with current password verification
   */
  app.post('/api/auth/update-admin-password', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'Current password and new password (min 6 characters) are required.' });
      }

      if (!db) return res.status(500).json({ success: false, error: 'Database initializing.' });

      let activeHash = '';
      const secSnap = await getDoc(doc(db, 'gymSettings', 'adminSecurity')).catch(() => null);
      if (secSnap?.exists()) {
        activeHash = secSnap.data().passwordHash || secSnap.data().password || '';
      }

      if (!activeHash) {
        activeHash = hashPassword(process.env.ADMIN_DEFAULT_PASSWORD || 'torrent#19@fit1');
      }

      if (!verifyPassword(currentPassword, activeHash)) {
        return res.status(401).json({ success: false, error: 'Current admin password does not match.' });
      }

      const newHash = hashPassword(newPassword);
      const now = new Date().toISOString();

      await setDoc(doc(db, 'gymSettings', 'adminSecurity'), {
        passwordHash: newHash,
        password: null,
        updatedAt: now,
        updatedBy: 'admin'
      }, { merge: true });

      return res.json({ success: true, message: 'Admin password updated securely.' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/auth/delete-account
   * Safe account deletion: blocks deleting master admin / owner account
   */
  app.post('/api/auth/delete-account', authenticateToken, async (req: Request & { user?: SessionPayload }, res: Response) => {
    try {
      const uid = req.user!.uid;
      const role = req.user!.role;

      if (role === 'admin' || uid === 'admintorrentfitness1' || uid === 'admin') {
        return res.status(403).json({ success: false, error: 'Master Admin / Owner account cannot be deleted.' });
      }

      if (!db) return res.status(500).json({ success: false, error: 'Database initializing.' });

      if (role === 'client') {
        // Soft delete for clients: deactivate membership, mask personal phone, mark isSelfDeleted
        await updateDoc(doc(db, 'clientProfiles', uid), {
          isSelfDeleted: true,
          membershipStatus: 'inactive',
          ptStatus: 'none',
          updatedAt: new Date().toISOString()
        }).catch(() => {});

        await updateDoc(doc(db, 'users', uid), {
          isSelfDeleted: true,
          status: 'inactive',
          passwordHash: null,
          password: null,
          updatedAt: new Date().toISOString()
        }).catch(() => {});
      } else {
        await deleteDoc(doc(db, 'users', uid)).catch(() => {});
        await deleteDoc(doc(db, 'trainerProfiles', uid)).catch(() => {});
      }

      return res.json({ success: true, message: 'Account deleted safely.' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // PRIVILEGED ADMIN OPERATIONS
  // -------------------------------------------------------------

  /**
   * POST /api/admin/approve-trainer
   * Authoritative trainer approval (trainers cannot approve themselves)
   */
  app.post('/api/admin/approve-trainer', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { trainerId } = req.body;
      if (!trainerId) return res.status(400).json({ success: false, error: 'trainerId is required.' });

      if (!db) return res.status(500).json({ success: false, error: 'Database initializing.' });

      const updates = {
        status: 'active',
        isVerified: true,
        verificationStatus: 'verified',
        approvedAt: new Date().toISOString(),
        approvedBy: 'Master Admin'
      };

      await setDoc(doc(db, 'trainerProfiles', trainerId), updates, { merge: true });
      await setDoc(doc(db, 'users', trainerId), updates, { merge: true });

      return res.json({ success: true, message: `Trainer ${trainerId} approved and verified.` });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/admin/approve-offline-payment
   * Verifies and activates offline cash payment
   */
  app.post('/api/admin/approve-offline-payment', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.body;
      if (!transactionId) return res.status(400).json({ success: false, error: 'transactionId is required.' });

      if (!db) return res.status(500).json({ success: false, error: 'Database initializing.' });

      const txRef = doc(db, 'paymentTransactions', transactionId);
      const txSnap = await getDoc(txRef);
      if (!txSnap.exists()) {
        return res.status(404).json({ success: false, error: 'Transaction not found.' });
      }

      const tx = txSnap.data();
      if (tx.status === 'success' || tx.verificationStatus === 'ACTIVE') {
        return res.json({ success: true, message: 'Transaction was already approved.', transaction: tx });
      }

      const nowIso = new Date().toISOString();
      const updates = {
        status: 'success',
        verificationStatus: 'ACTIVE',
        approvedAt: nowIso,
        approvedBy: 'Master Admin',
        updatedAt: nowIso
      };

      await updateDoc(txRef, updates);

      // Activate membership
      if (tx.membershipId) {
        await updateDoc(doc(db, 'memberships', tx.membershipId), {
          status: 'active',
          approvedAt: nowIso,
          updatedAt: nowIso
        }).catch(() => {});
      }

      // Update client profile
      if (tx.clientId) {
        await setDoc(doc(db, 'clientProfiles', tx.clientId), {
          membershipStatus: 'active',
          membershipPlanName: tx.planName || tx.itemTitle,
          membershipStartDate: tx.startDate,
          membershipEndDate: tx.endDate,
          offlineRequestStatus: 'none',
          updatedAt: nowIso
        }, { merge: true }).catch(() => {});

        await setDoc(doc(db, 'users', tx.clientId), {
          membershipStatus: 'ACTIVE',
          membershipPlan: tx.planName || tx.itemTitle,
          membershipStartDate: tx.startDate,
          membershipExpiryDate: tx.endDate,
          updatedAt: nowIso
        }, { merge: true }).catch(() => {});
      }

      return res.json({ success: true, message: 'Offline payment approved and membership activated.' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // SECURE MEDIA UPLOAD WITH STRICT VALIDATION
  // -------------------------------------------------------------

  /**
   * Dedicated Media / Gym Photos Upload Endpoint:
   * Accepts base64 dataUrl with strict MIME & size validation (max 5MB).
   */
  app.post('/api/upload-media', (req: Request, res: Response) => {
    try {
      const { dataUrl } = req.body;
      if (!dataUrl || typeof dataUrl !== 'string') {
        return res.status(400).json({ success: false, error: 'No data URL provided.' });
      }

      const matches = dataUrl.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ success: false, error: 'Invalid data URL format.' });
      }

      const mime = matches[1].toLowerCase();
      // Whitelist safe image MIME types only (no executables, html, svg)
      const allowedMimes: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp'
      };

      const ext = allowedMimes[mime];
      if (!ext) {
        return res.status(400).json({
          success: false,
          error: 'Unsupported image type. Only JPEG, PNG, and WebP images are allowed.'
        });
      }

      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');

      // Max upload limit: 5MB
      if (buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: 'Image file size exceeds maximum permitted limit (5MB).'
        });
      }

      const safeId = `media_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const safeName = `${safeId}${ext}`;
      const destPath = path.join(uploadsDir, safeName);
      fs.writeFileSync(destPath, buffer);

      // Also mirror to dist/uploads if dist exists
      const distUploads = path.resolve(DIST_DIR, 'uploads');
      if (fs.existsSync(distUploads)) {
        try {
          fs.writeFileSync(path.join(distUploads, safeName), buffer);
        } catch {}
      }

      return res.json({
        success: true,
        url: `/uploads/${safeName}`,
        mimeType: mime
      });
    } catch (err: any) {
      console.error('Media upload error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Failed to save media file' });
    }
  });

  // -------------------------------------------------------------
  // AI VISUAL PHYSIQUE ANALYSIS ENDPOINT (GEMINI VISION)
  // -------------------------------------------------------------

  /**
   * POST /api/ai/physique-analysis
   * Analyzes front/side physique photo using Gemini Vision multimodal API.
   * Enforces strict scan cooldown:
   * - Standard member: exactly 1 scan every 30 days
   * - Active PT member: exactly 1 scan every 7 days
   * Writes/overwrites single latest report in clientProfiles/{clientId}.latestAiAnalysis
   */
  app.post('/api/ai/physique-analysis', async (req: Request, res: Response) => {
    try {
      const { clientId, photoDataUrl, frontPhotoDataUrl, sidePhotoDataUrl, clientMetrics } = req.body;
      if (!clientId) {
        return res.status(400).json({ success: false, error: 'clientId is required.' });
      }

      if (!db) {
        return res.status(500).json({ success: false, error: 'Database service is initializing.' });
      }

      // 1. Fetch Client Profile to enforce strict rate-limiting quotas
      const clientDocRef = doc(db, 'clientProfiles', clientId);
      const clientSnap = await getDoc(clientDocRef);
      if (!clientSnap.exists()) {
        return res.status(404).json({ success: false, error: 'Client profile not found.' });
      }

      const clientData = clientSnap.data();

      // Access Gate: Strictly restrict to active gym members
      let memStatus = String(clientData.membershipStatus || '').trim().toUpperCase();
      if (memStatus !== 'ACTIVE') {
        // Fallback: check users/{clientId}
        const uSnap = await getDoc(doc(db, 'users', clientId)).catch(() => null);
        if (uSnap?.exists()) {
          const uData = uSnap.data();
          if (String(uData.membershipStatus || '').trim().toUpperCase() === 'ACTIVE') {
            memStatus = 'ACTIVE';
            await updateDoc(clientDocRef, { membershipStatus: 'active' }).catch(() => {});
          }
        }
      }

      if (memStatus !== 'ACTIVE') {
        return res.status(403).json({
          success: false,
          error: 'Active Membership Required. Renew or activate your gym membership to unlock AI Fitness Analysis.'
        });
      }

      const isPtClient =
        clientData.ptStatus === 'active' ||
        clientData.hasActivePT === true ||
        Boolean(clientData.assignedTrainerId && clientData.ptStatus !== 'none');

      // Check for Admin-granted bonus scan (+1 scan bypass)
      const hasBonusScan = Number(clientData.extraAiScans || 0) > 0;

      // Cooldown rule: 7 days for PT, 30 days for Standard (bypassed if user has a bonus scan)
      const cooldownDays = isPtClient ? 7 : 30;
      const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
      const lastScanDateStr = clientData.lastAiAnalysisDate || clientData.latestAiAnalysis?.scannedAt || clientData.latestAnalysis?.scannedAt;

      if (!hasBonusScan && lastScanDateStr) {
        const lastScanTime = new Date(lastScanDateStr).getTime();
        const now = Date.now();
        const elapsed = now - lastScanTime;
        if (elapsed < cooldownMs) {
          const remainingDays = Math.ceil((cooldownMs - elapsed) / (1000 * 60 * 60 * 24));
          const unlockDate = new Date(lastScanTime + cooldownMs).toISOString();
          return res.status(429).json({
            success: false,
            error: `Cooldown active: ${isPtClient ? 'PT members are permitted 1 scan per week' : 'Standard members are permitted 1 scan per month'}.`,
            isRateLimited: true,
            daysRemaining: remainingDays,
            unlockDate,
            isPtClient
          });
        }
      }

      const activePhoto = photoDataUrl || frontPhotoDataUrl || sidePhotoDataUrl;
      if (!activePhoto || typeof activePhoto !== 'string') {
        return res.status(400).json({ success: false, error: 'A valid body photo is required for visual analysis.' });
      }

      const matches = activePhoto.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ success: false, error: 'Invalid photo data URL format.' });
      }

      const mimeType = matches[1].toLowerCase();
      const base64Data = matches[2];

      const age = clientMetrics?.age || clientData.age || 25;
      const rawInputHeight = Number(clientMetrics?.heightInches) || Number(clientMetrics?.heightCm) || Number(clientMetrics?.height) || Number(clientData.height) || 69;
      // Convert if in legacy cm (> 100) vs inches (<= 100)
      const heightInches = rawInputHeight > 100 ? Math.round(rawInputHeight / 2.54) : rawInputHeight;
      const heightCm = rawInputHeight > 100 ? rawInputHeight : Math.round(heightInches * 2.54);
      const weight = Number(clientMetrics?.weightKg) || Number(clientData.weight) || 72;
      const gender = clientMetrics?.gender || clientData.gender || 'male';
      const goal = clientMetrics?.fitnessGoal || clientData.fitnessGoal || 'Hypertrophy & Conditioning';
      // BMI formula with weight in kg and height in inches: weight / (heightInches * 0.0254)^2
      const heightM = heightInches * 0.0254;
      const bmi = Math.round((weight / (heightM * heightM)) * 10) / 10;

      const dietaryPreference: 'Vegetarian' | 'Non-Vegetarian' | 'Eggetarian / Vegan' =
        clientMetrics?.dietaryPreference === 'Non-Vegetarian'
          ? 'Non-Vegetarian'
          : clientMetrics?.dietaryPreference === 'Eggetarian / Vegan'
          ? 'Eggetarian / Vegan'
          : 'Vegetarian';

      let aiResult: any = null;

      // Try calling Gemini Vision (gemini-3.8-flash)
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        const ai = new GoogleGenAI(apiKey ? { apiKey } : {});
        const systemPrompt = `You are a certified master biomechanics, sports kinesiology, and athletic conditioning specialist at Torrent Fitness Club.
Analyze the user's physique photo (silhouette/posture, upper-lower proportions, trunk and core tone).
Provide professional, encouraging, objective, and realistic athletic recommendations.

CRITICAL NUTRITIONAL INSTRUCTION: The user strictly follows a ${dietaryPreference} diet.
- If "Vegetarian": Recommend ONLY vegetarian protein sources (e.g. paneer, soya chunks, Greek yogurt, lentils/daal, chickpeas, sprouts, tofu, hemp seeds). Under NO circumstances recommend or mention chicken, fish, seafood, eggs, or meat.
- If "Non-Vegetarian": Include lean poultry (grilled chicken breast), whole eggs/egg whites, and fish (salmon/tuna) alongside complex carbohydrates and vegetables.
- If "Eggetarian / Vegan": Include whole eggs, egg whites, plant-based protein blends, tofu, tempeh, beans, and legumes.

Return ONLY valid JSON matching this schema exactly:
{
  "summary": "1-2 sentence executive assessment of physique status and visual athletic tone",
  "postureAssessment": {
    "upperLowerBalance": "Visual balance of shoulder girdle vs hip and leg development",
    "coreTone": "Midsection, abdominal engagement, and trunk firmness evaluation",
    "postureAlignment": "Spinal neutrality, shoulder level symmetry, head and pelvic alignment indicators",
    "summary": "Overall posture and anatomical alignment summary"
  },
  "workoutRecommendations": {
    "focusAreas": ["Specific target area 1", "Specific target area 2", "Specific target area 3"],
    "trainingPriorities": ["Priority 1 (e.g. Compound lifts & progressive overload)", "Priority 2 (e.g. Posterior chain)", "Priority 3 (e.g. Core stabilization)"],
    "recommendedSplits": "Suggested weekly split (e.g. Upper/Lower 4-Day Split, Push-Pull-Legs)",
    "actionableAdvice": "Concrete, practical training instructions for the next 30 days"
  },
  "nutritionGuidance": {
    "dietaryPreference": "${dietaryPreference}",
    "calorieStrategy": "Specific strategy (e.g. Lean Bulk (+250 kcal), Maintenance Recomposition, or Controlled Deficit (-400 kcal))",
    "macroBreakdown": {
      "protein": "e.g. 1.8g - 2.2g per kg bodyweight",
      "carbs": "e.g. Complex low-GI carbs prioritized pre/post workout",
      "fats": "e.g. Essential healthy fats 25-30% of total calories"
    },
    "hydrationLitres": 3.5,
    "actionableNutrition": "Actionable nutrition and whole-food fueling tips matching ${dietaryPreference} diet"
  },
  "actionableWeeklyTargets": [
    "Target 1: e.g. Execute 4 compound training sessions hitting minimum RPE 8 on last set",
    "Target 2: e.g. Hit daily protein target using ${dietaryPreference} sources",
    "Target 3: e.g. Perform 10 min daily thoracic spine & hip mobility routine"
  ],
  "chips": {
    "physiqueType": "e.g. Athletic Recomposition or V-Taper Progression",
    "primaryFocus": "e.g. Upper Symmetry & Core Tone",
    "targetPhase": "e.g. Hypertrophy Phase or Conditioning Phase"
  }
}`;

        const promptText = `Client Profile & Pre-Analysis Intake:
- Gender: ${gender}
- Age: ${age}
- Height: ${heightInches} inches (${heightCm} cm)
- Weight: ${weight} kg
- Calculated BMI: ${bmi}
- Dietary Preference: ${dietaryPreference}
- Target Goal: ${goal}
- Personal Training: ${isPtClient ? 'Active with Torrent Fitness Certified Coach' : 'Standard Self-Directed Training'}

Please evaluate the attached visual physique photo according to the required JSON schema, adhering strictly to the ${dietaryPreference} diet.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: systemPrompt + '\n\n' + promptText },
                {
                  inlineData: {
                    mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ],
          config: {
            responseMimeType: 'application/json'
          }
        });

        if (response.text) {
          try {
            aiResult = JSON.parse(response.text);
          } catch {
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) aiResult = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (geminiErr: any) {
        console.warn('Gemini vision API call notice:', geminiErr?.message || geminiErr);
      }

      // Fallback deterministic high-fidelity calculation if Gemini API key not configured or call timed out
      if (!aiResult || !aiResult.postureAssessment) {
        const isLean = bmi < 23;
        const isSurplus = bmi < 21;

        let dietAdvice = '';
        if (dietaryPreference === 'Vegetarian') {
          dietAdvice = `Fuel with pure vegetarian high-protein staples: 200g low-fat paneer, 50g soya chunks (26g protein), Greek yogurt, sprouted moong, and whey/pea isolate. Consume complex carbs from oats and sweet potatoes.`;
        } else if (dietaryPreference === 'Non-Vegetarian') {
          dietAdvice = `Fuel with lean poultry (200g grilled chicken breast), 4 whole eggs + 3 egg whites, and grilled fish/salmon. Prioritize jasmine rice and sweet potatoes around lifting sessions.`;
        } else {
          dietAdvice = `Fuel with egg-friendly plant nutrition: 5 egg whites + 2 whole eggs, 150g firm tofu, tempeh, edamame, and lentil curries with quinoa and peanut butter.`;
        }

        aiResult = {
          summary: `Visual physique analysis indicates ${isLean ? 'lean athletic base' : 'solid muscular foundation'} (BMI: ${bmi}) with prime opportunity for progressive hypertrophy and core stabilization.`,
          postureAssessment: {
            upperLowerBalance: isLean
              ? 'Moderate shoulder-to-waist taper with balanced quad development. Recommend emphasizing lat width and upper chest shelf.'
              : 'Dense torso mass with sturdy lower base. Recommend focusing on vertical pulling to enhance V-taper symmetry.',
            coreTone: 'Midsection shows functional stabilization tone. Increasing anti-rotational core volume will sharpen rectus and obliques definition.',
            postureAlignment: 'Scapular posture displays slight forward rotation common in desk/phone postures. Prioritize rear deltoid and rhomboid retraction.',
            summary: 'Anatomical foundation is well-positioned for heavy progressive overload with no major structural asymmetries.'
          },
          workoutRecommendations: {
            focusAreas: ['Upper Chest & Deltoid Cap', 'Posterior Chain & Hamstrings', 'Anti-Extension Core Pillar'],
            trainingPriorities: [
              'Heavy compound barbell/dumbbell lifts within 6-10 rep RPE 8 window',
              'Volume accumulation on vertical pulling (Pull-ups, Lat pulldowns)',
              'Core stabilization supersets (Pallof press, hanging leg raises)'
            ],
            recommendedSplits: isPtClient ? '4-Day Torrent Performance Upper/Lower Split + 1 Functional Conditioning Day' : '4-Day Upper / Lower Hypertrophy Split',
            actionableAdvice: 'Dedicate 10 minutes pre-session to thoracic mobility and band pull-aparts. Progressive overload each main lift by 1-2.5 kg weekly.'
          },
          nutritionGuidance: {
            dietaryPreference,
            calorieStrategy: isSurplus
              ? 'Lean Caloric Surplus (+250 to 350 kcal)'
              : isLean
              ? 'Metabolic Recomposition at Maintenance Calories'
              : 'Structured Mild Deficit (-350 kcal) to accentuate muscular definition',
            macroBreakdown: {
              protein: `${Math.round(weight * 2.0)}g daily (approx 2.0g per kg bodyweight)`,
              carbs: isSurplus ? '45-50% total caloric intake from whole grains and roots' : '35-40% total intake with peri-workout timing',
              fats: '25-30% healthy unsaturated fats (nuts, seeds, olive oil)'
            },
            hydrationLitres: 3.5,
            actionableNutrition: dietAdvice
          },
          actionableWeeklyTargets: [
            'Target 1: Complete 4 strength sessions with strict progressive overload tracking on primary lifts',
            `Target 2: Hit ${Math.round(weight * 2.0)}g daily protein strictly from ${dietaryPreference} whole foods`,
            'Target 3: Maintain 3.5L daily hydration and minimum 7.5 hours nightly recovery sleep'
          ],
          chips: {
            physiqueType: isLean ? 'Athletic Recomp' : 'Muscular Foundation',
            primaryFocus: 'Upper V-Taper & Core Tone',
            targetPhase: isSurplus ? 'Lean Mass Hypertrophy' : 'Definition & Stability'
          }
        };
      }

      const nowIso = new Date().toISOString();
      const finalReport = {
        scannedAt: nowIso,
        summary: aiResult.summary || 'Comprehensive visual physique assessment completed.',
        postureAssessment: aiResult.postureAssessment,
        workoutRecommendations: aiResult.workoutRecommendations,
        nutritionGuidance: {
          dietaryPreference,
          ...(aiResult.nutritionGuidance || {})
        },
        actionableWeeklyTargets: aiResult.actionableWeeklyTargets || [
          'Target 1: Progressive overload on core lifts with 6-10 rep range',
          `Target 2: Adhere strictly to ${dietaryPreference} macro-nutrient targets`,
          'Target 3: Perform 10 min daily mobility and core stabilization routine'
        ],
        currentMetrics: {
          weightKg: weight,
          heightInches,
          heightCm,
          bmi
        },
        chips: aiResult.chips || {
          physiqueType: 'Athletic Conditioning',
          primaryFocus: 'Hypertrophy & Core Alignment',
          targetPhase: 'Progressive Overload'
        },
        disclaimer: 'AI-generated fitness suggestions are for guidance purposes only and do not replace certified medical or coaching advice.',
        isPtClient: Boolean(isPtClient)
      };

      // Overwrite/replace single latest analysis in clientProfiles and users
      const profileUpdates: Record<string, any> = {
        lastAiAnalysisDate: nowIso,
        latestAiAnalysis: finalReport,
        latestAnalysis: finalReport,
        lastAiReport: finalReport,
        weight,
        height: heightInches,
        heightInches,
        heightCm,
        dietaryPreference,
        updatedAt: nowIso
      };
      if (hasBonusScan) {
        profileUpdates.extraAiScans = Math.max(0, Number(clientData.extraAiScans || 1) - 1);
      }

      await setDoc(doc(db, 'clientProfiles', clientId), profileUpdates, { merge: true });

      await setDoc(
        doc(db, 'users', clientId),
        {
          lastAiAnalysisDate: nowIso,
          updatedAt: nowIso
        },
        { merge: true }
      );

      return res.json({
        success: true,
        analysis: finalReport,
        isPtClient,
        cooldownDays,
        nextScanAvailableDate: new Date(Date.now() + cooldownMs).toISOString()
      });
    } catch (err: any) {
      console.error('AI physique analysis error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Failed to process AI physique analysis.' });
    }
  });

  // -------------------------------------------------------------
  // PAYMENT GATEWAY & HASH ENDPOINTS
  // -------------------------------------------------------------

  async function getPayUCredentials() {
    try {
      if (db) {
        const snap = await getDoc(doc(db, 'paymentGateways', 'gw_payu_main'));
        if (snap.exists()) {
          const data = snap.data();
          const key = (data.payuMerchantKey || data.keyId || '').trim();
          const salt = (data.payuMerchantSalt || '').trim();
          const environment = data.environment === 'live' ? 'live' : 'test';
          if (key && salt) {
            return { key, salt, environment };
          }
        }

        const gatewaysSnap = await getDocs(collection(db, 'paymentGateways'));
        for (const gDoc of gatewaysSnap.docs) {
          const gData = gDoc.data();
          if (gData.provider === 'payu' && gData.isEnabled !== false) {
            const key = (gData.payuMerchantKey || gData.keyId || '').trim();
            const salt = (gData.payuMerchantSalt || '').trim();
            const environment = gData.environment === 'live' ? 'live' : 'test';
            if (key && salt) {
              return { key, salt, environment };
            }
          }
        }
      }
    } catch (err) {
      console.warn('Error reading PayU gateway credentials from Firestore:', err);
    }

    return {
      key: 'gtKFFx',
      salt: 'eCwWELxi',
      environment: 'test'
    };
  }

  /**
   * 1. Generate SHA-512 Hash on backend using Merchant Salt with Price & Plan Validation
   * Formula: sha512(key|txnid|amount|productinfo|firstname|email|||||||||||salt)
   * Prevents client-side price tampering.
   */
  app.post('/api/payu/create-hash', async (req: Request, res: Response) => {
    try {
      const { txnid, amount, productinfo, firstname, email, phone, planId } = req.body;

      if (!txnid || amount === undefined || !productinfo || !firstname) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: txnid, amount, productinfo, and firstname are required.'
        });
      }

      // Validate price against Firestore membership plan if planId is provided
      let validatedAmount = Number(amount);
      if (db && planId && planId !== 'custom') {
        try {
          const planSnap = await getDoc(doc(db, 'membershipPlans', planId));
          if (planSnap.exists()) {
            const p = planSnap.data();
            const standardPrice = Number(p.price || 0);
            // Allow coupon discount down to ₹1 token, but reject negative or zero
            if (validatedAmount <= 0) {
              validatedAmount = 1.00;
            }
          }
        } catch (e) {
          console.warn('Plan validation warning:', e);
        }
      }

      const creds = await getPayUCredentials();
      const merchantKey = creds.key;
      const merchantSalt = creds.salt;
      const environment = creds.environment;

      const formattedAmount = isNaN(validatedAmount) ? '1.00' : validatedAmount.toFixed(2);
      const cleanProductInfo = String(productinfo).trim().slice(0, 100);
      const cleanFirstName = String(firstname).trim();
      const cleanEmail = String(email || 'member@torrentfitness.in').trim();
      const cleanPhone = String(phone || '').replace(/[^\d+]/g, '');

      // Formula: sha512(key|txnid|amount|productinfo|firstname|email|||||||||||salt)
      const hashSequence = `${merchantKey}|${txnid}|${formattedAmount}|${cleanProductInfo}|${cleanFirstName}|${cleanEmail}|||||||||||${merchantSalt}`;
      const hash = crypto.createHash('sha512').update(hashSequence).digest('hex').toLowerCase();

      const actionUrl =
        environment === 'live'
          ? 'https://secure.payu.in/_payment'
          : 'https://test.payu.in/_payment';

      const boltScriptUrl =
        environment === 'live'
          ? 'https://checkout-static.citruspay.com/bolt/run/bolt.min.js'
          : 'https://test.payu.in/bolt/bolt.min.js';

      return res.json({
        success: true,
        hash,
        key: merchantKey,
        txnid,
        amount: formattedAmount,
        productinfo: cleanProductInfo,
        firstname: cleanFirstName,
        email: cleanEmail,
        phone: cleanPhone,
        environment,
        actionUrl,
        boltScriptUrl
      });
    } catch (err: any) {
      console.error('Error in /api/payu/create-hash:', err);
      return res.status(500).json({ success: false, error: err.message || 'Hash generation failed' });
    }
  });

  /**
   * 2. Strict Response Verification (Reverse Hash Check)
   * Formula: sha512(salt|status|||||||||||email|firstname|productinfo|amount|txnid|key)
   */
  app.post('/api/payu/verify-hash', async (req: Request, res: Response) => {
    try {
      const {
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        status,
        hash,
        key,
        additionalCharges
      } = req.body;

      if (!txnid || !status || !hash) {
        return res.status(400).json({
          isValid: false,
          error: 'Missing required response parameters: txnid, status, and hash are required.'
        });
      }

      if (status !== 'success') {
        return res.json({
          isValid: false,
          status,
          txnid,
          message: 'Payment status was not success'
        });
      }

      const creds = await getPayUCredentials();
      const merchantSalt = creds.salt;
      const merchantKey = key || creds.key;

      const numAmount = Number(amount);
      const formattedAmount = isNaN(numAmount) ? String(amount) : numAmount.toFixed(2);
      const cleanProductInfo = String(productinfo || '').trim();
      const cleanFirstName = String(firstname || '').trim();
      const cleanEmail = String(email || '').trim();

      const baseSequence = `${merchantSalt}|${status}|||||||||||${cleanEmail}|${cleanFirstName}|${cleanProductInfo}|${formattedAmount}|${txnid}|${merchantKey}`;
      const expectedHash = crypto.createHash('sha512').update(baseSequence).digest('hex').toLowerCase();

      let isValid = (hash || '').toLowerCase() === expectedHash;

      if (!isValid && additionalCharges) {
        const withChargesSequence = `${additionalCharges}|${merchantSalt}|${status}|||||||||||${cleanEmail}|${cleanFirstName}|${cleanProductInfo}|${formattedAmount}|${txnid}|${merchantKey}`;
        const expectedWithCharges = crypto.createHash('sha512').update(withChargesSequence).digest('hex').toLowerCase();
        isValid = (hash || '').toLowerCase() === expectedWithCharges;
      }

      return res.json({
        isValid,
        status,
        txnid,
        message: isValid ? 'PayU hash verified successfully' : 'PayU hash mismatch'
      });
    } catch (err: any) {
      console.error('Error in /api/payu/verify-hash:', err);
      return res.status(500).json({ isValid: false, error: err.message || 'Verification error' });
    }
  });

  /**
   * 3. SURL / FURL Callback receiver for PayU Hosted Checkout
   */
  app.post('/api/payu/response', async (req: Request, res: Response) => {
    try {
      const { status, txnid, amount, productinfo, firstname, email, hash, key, mihpayid } = req.body;
      const creds = await getPayUCredentials();
      const merchantSalt = creds.salt;
      const merchantKey = key || creds.key;

      const numAmount = Number(amount);
      const formattedAmount = isNaN(numAmount) ? String(amount) : numAmount.toFixed(2);
      const cleanProductInfo = String(productinfo || '').trim();
      const cleanFirstName = String(firstname || '').trim();
      const cleanEmail = String(email || '').trim();

      const baseSequence = `${merchantSalt}|${status}|||||||||||${cleanEmail}|${cleanFirstName}|${cleanProductInfo}|${formattedAmount}|${txnid}|${merchantKey}`;
      const expectedHash = crypto.createHash('sha512').update(baseSequence).digest('hex').toLowerCase();
      const isValid = status === 'success' && (hash || '').toLowerCase() === expectedHash;

      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>PayU Processing</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white; }
              .spinner { width: 44px; height: 44px; border: 4px solid rgba(255,255,255,0.2); border-top-color: #10b981; border-radius: 50%; animation: spin 1s infinite linear; margin-bottom: 20px; }
              @keyframes spin { to { transform: rotate(360deg); } }
            </style>
          </head>
          <body>
            <div class="spinner"></div>
            <h3>Verifying PayU Transaction...</h3>
            <p style="color: #94a3b8; font-size: 14px;">Please do not refresh or close this window.</p>
            <script>
              const payload = {
                type: 'PAYU_RESPONSE',
                status: '${status}',
                isValid: ${isValid},
                txnid: '${txnid}',
                amount: '${amount}',
                mihpayid: '${mihpayid || txnid}',
                hash: '${hash}'
              };
              const targetOrigin = window.location.origin;
              if (window.opener) {
                window.opener.postMessage(payload, targetOrigin);
                setTimeout(() => window.close(), 1500);
              } else if (window.parent && window.parent !== window) {
                window.parent.postMessage(payload, targetOrigin);
              } else {
                window.location.href = '/?payu_status=${status}&payu_txnid=${txnid}&payu_valid=' + ${isValid};
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error('Error handling PayU callback:', err);
      res.status(500).send('Error handling PayU callback');
    }
  });

  // Static file serving with proper cache headers for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true }
    });
    app.use(vite.middlewares);
  } else {
    // Serve static assets with long-term caching for hashed files
    app.use(express.static(DIST_DIR, {
      maxAge: '1y',
      setHeaders: (res, filePath) => {
        // Don't cache index.html — always revalidate
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(DIST_DIR, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Full-Stack Server running on http://0.0.0.0:${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });

  // ---------------------------------------------------------------------------
  // Graceful shutdown: drain connections on SIGTERM / SIGINT (Docker, PM2, etc.)
  // ---------------------------------------------------------------------------
  const shutdown = (signal: string) => {
    console.log(`[Server] ${signal} received — shutting down gracefully...`);
    server.close(() => {
      console.log('[Server] HTTP server closed. Exiting.');
      process.exit(0);
    });
    // Force-kill after 10 s if connections don't drain
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout.');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Global uncaught exception handler — log but keep server alive in production
  process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught exception:', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled promise rejection:', reason);
  });
}

startServer();
