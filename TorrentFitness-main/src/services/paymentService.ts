import { db } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  arrayUnion
} from 'firebase/firestore';
import {
  PaymentGateway,
  PaymentProvider,
  PaymentTransaction,
  PaymentPurpose,
  MembershipRecord,
  PromotionalOffer
} from '../types';

export const LIVE_RAZORPAY_KEY_ID = 'rzp_live_TqxKgruP8oLXbD';
export const LIVE_RAZORPAY_KEY_SECRET = 'oToShMju6rOURDG8MQP35jhC';

export const DEFAULT_RAZORPAY_TEST_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_RAZORPAY_KEY_ID) ||
  LIVE_RAZORPAY_KEY_ID;

export const DEFAULT_RAZORPAY_GATEWAY: PaymentGateway = {
  id: 'gw_razorpay_main',
  provider: 'razorpay',
  name: 'Razorpay PG (UPI / Cards / NetBanking)',
  description: 'Official Razorpay standard gateway supporting UPI, Dynamic QR, Cards & NetBanking.',
  isEnabled: true,
  isDefault: true,
  environment: 'live',
  keyId: LIVE_RAZORPAY_KEY_ID,
  keySecret: LIVE_RAZORPAY_KEY_SECRET,
  merchantName: 'Torrent Fitness Club',
  themeColor: '#4f46e5',
  currency: 'INR',
  webhookSecret: '',
  instructions: 'Official Razorpay Checkout popup supporting Google Pay, PhonePe, Paytm, QR, Cards & NetBanking with instant activation.',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: new Date().toISOString()
};

export const DEFAULT_CASHFREE_GATEWAY: PaymentGateway = {
  id: 'gw_cashfree_main',
  provider: 'cashfree',
  name: 'Cashfree Payments (Seamless UPI & Cards)',
  description: 'High-success-rate checkout via Cashfree PG with instant webhook confirmation.',
  isEnabled: false,
  isDefault: false,
  environment: 'test',
  appId: '',
  secretKey: '',
  merchantName: 'Torrent Fitness Club',
  themeColor: '#6366f1',
  currency: 'INR',
  webhookSecret: '',
  instructions: 'Fast UPI Intent, QR, Card & EMI checkout powered by Cashfree Payments.',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const DEFAULT_PHONEPE_GATEWAY: PaymentGateway = {
  id: 'gw_phonepe_main',
  provider: 'phonepe',
  name: 'PhonePe Payment Gateway',
  description: 'Direct PhonePe PG integration with Salt Key & Salt Index checksum verification.',
  isEnabled: false,
  isDefault: false,
  environment: 'test',
  merchantId: '',
  saltKey: '',
  saltIndex: '1',
  merchantName: 'Torrent Fitness Club',
  themeColor: '#7c3aed',
  currency: 'INR',
  webhookSecret: '',
  instructions: 'Pay effortlessly via PhonePe UPI, Dynamic QR, or Debit/Credit Cards.',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const DEFAULT_PAYPAL_GATEWAY: PaymentGateway = {
  id: 'gw_paypal_main',
  provider: 'paypal',
  name: 'PayPal Global Checkout',
  description: 'International cards & PayPal Express checkout using Client ID and Secret Key.',
  isEnabled: false,
  isDefault: false,
  environment: 'test',
  clientId: '',
  secretKey: '',
  merchantName: 'Torrent Fitness Club',
  themeColor: '#0070ba',
  currency: 'INR',
  webhookSecret: '',
  instructions: 'Global checkout via PayPal balance or international Credit/Debit Cards.',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const DEFAULT_GPAY_GATEWAY: PaymentGateway = {
  id: 'gw_gpay_main',
  provider: 'gpay',
  name: 'Google Pay (Business Console)',
  description: 'Google Pay for Business API & Web UPI intent with instant verified settlement.',
  isEnabled: false,
  isDefault: false,
  environment: 'test',
  gpayMerchantId: '',
  gpayApiKey: '',
  merchantName: 'Torrent Fitness Club',
  themeColor: '#1a73e8',
  currency: 'INR',
  webhookSecret: '',
  instructions: 'Official Google Pay Web, UPI Intent, and GPay Business Console callback verification.',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const DEFAULT_PAYTM_GATEWAY: PaymentGateway = {
  id: 'gw_paytm_main',
  provider: 'paytm',
  name: 'Paytm Payment Gateway (PG)',
  description: 'Paytm all-in-one standard JS checkout supporting Paytm Wallet, UPI, Postpaid, and NetBanking.',
  isEnabled: false,
  isDefault: false,
  environment: 'test',
  paytmMid: '',
  paytmMerchantKey: '',
  paytmWebsite: 'DEFAULT',
  paytmChannelId: 'WEB',
  merchantName: 'Torrent Fitness Club',
  themeColor: '#002970',
  currency: 'INR',
  webhookSecret: '',
  instructions: 'Paytm Standard JS Checkout with SHA-256 checksum and order verification.',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const DEFAULT_PAYU_GATEWAY: PaymentGateway = {
  id: 'gw_payu_main',
  provider: 'payu',
  name: 'PayU Gateway (Bolt / Hosted)',
  description: 'PayU Bolt / Hosted checkout with Merchant Key and Salt SHA-512 encryption.',
  isEnabled: false,
  isDefault: false,
  environment: 'test',
  payuMerchantKey: '',
  payuMerchantSalt: '',
  merchantName: 'Torrent Fitness Club',
  themeColor: '#84c225',
  currency: 'INR',
  webhookSecret: '',
  instructions: 'PayU Bolt popup & Hosted redirection with dynamic hash verification.',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const UNIVERSAL_GATEWAY_TEMPLATES: Record<string, PaymentGateway> = {
  razorpay: DEFAULT_RAZORPAY_GATEWAY,
  phonepe: DEFAULT_PHONEPE_GATEWAY,
  cashfree: DEFAULT_CASHFREE_GATEWAY,
  paypal: DEFAULT_PAYPAL_GATEWAY,
  gpay: DEFAULT_GPAY_GATEWAY,
  paytm: DEFAULT_PAYTM_GATEWAY,
  payu: DEFAULT_PAYU_GATEWAY
};

export const SUPPORTED_ONLINE_ADAPTERS: PaymentProvider[] = [
  'razorpay',
  'phonepe',
  'cashfree',
  'paypal',
  'gpay',
  'paytm',
  'payu'
];

export const ONLINE_PROVIDERS: PaymentProvider[] = SUPPORTED_ONLINE_ADAPTERS;

export const ALL_DEFAULT_GATEWAYS: PaymentGateway[] = [
  DEFAULT_RAZORPAY_GATEWAY,
  DEFAULT_PHONEPE_GATEWAY,
  DEFAULT_CASHFREE_GATEWAY,
  DEFAULT_PAYPAL_GATEWAY,
  DEFAULT_GPAY_GATEWAY,
  DEFAULT_PAYTM_GATEWAY,
  DEFAULT_PAYU_GATEWAY
];

/**
 * Initialize default universal online gateways in Firestore if collection is empty
 * or migrate legacy setups so all 7 adapters are available with strictly ONE active gateway.
 */
export async function initializePaymentGatewaysIfEmpty(): Promise<PaymentGateway[]> {
  try {
    // 1. Guarantee gym_config/payment_gateways contains the pre-9:00 AM live Razorpay config
    await setDoc(doc(db, 'gym_config', 'payment_gateways'), {
      ...DEFAULT_RAZORPAY_GATEWAY,
      keyId: LIVE_RAZORPAY_KEY_ID,
      keySecret: LIVE_RAZORPAY_KEY_SECRET,
      environment: 'live',
      status: 'ACTIVE',
      isEnabled: true,
      isDefault: true,
      updatedAt: new Date().toISOString()
    }, { merge: true }).catch(() => {});

    const snap = await getDocs(collection(db, 'paymentGateways'));
    if (snap.empty) {
      for (const gw of ALL_DEFAULT_GATEWAYS) {
        await setDoc(doc(db, 'paymentGateways', gw.id), gw);
      }
      return ALL_DEFAULT_GATEWAYS;
    }

    // Ensure gw_razorpay_main has live credentials restored
    const rzpSnap = await getDoc(doc(db, 'paymentGateways', 'gw_razorpay_main'));
    if (rzpSnap.exists()) {
      const data = rzpSnap.data() as PaymentGateway;
      if (!data.keySecret || data.keyId?.startsWith('rzp_test_')) {
        await setDoc(doc(db, 'paymentGateways', 'gw_razorpay_main'), {
          ...data,
          keyId: LIVE_RAZORPAY_KEY_ID,
          keySecret: LIVE_RAZORPAY_KEY_SECRET,
          environment: 'live',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } else {
      await setDoc(doc(db, 'paymentGateways', 'gw_razorpay_main'), DEFAULT_RAZORPAY_GATEWAY);
    }

    return await getPaymentGateways();
  } catch (err) {
    console.error('Error initializing payment gateways:', err);
    return ALL_DEFAULT_GATEWAYS;
  }
}

/**
 * Fetch all configured online payment gateways:
 * 1. Strictly de-duplicates Firestore records so each of the 7 supported adapters exists exactly ONCE.
 * 2. Cleans up orphaned or duplicate documents from past edits.
 * 3. Enforces the Single-Active constraint: strictly ONLY ONE gateway is enabled & default at any time.
 */
export async function getPaymentGateways(): Promise<PaymentGateway[]> {
  try {
    const snap = await getDocs(collection(db, 'paymentGateways'));
    const rawDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentGateway));

    // Group documents by provider
    const docsByProvider = new Map<PaymentProvider, PaymentGateway[]>();
    for (const d of rawDocs) {
      if (SUPPORTED_ONLINE_ADAPTERS.includes(d.provider)) {
        const list = docsByProvider.get(d.provider) || [];
        list.push(d);
        docsByProvider.set(d.provider, list);
      }
    }

    // Determine the single primary active gateway across configured docs
    const configuredDocs = rawDocs.filter(d => isGatewayConfigured(d));
    let primaryActiveProvider: PaymentProvider | null = null;
    const explicitlyDefault = configuredDocs.find(d => d.isDefault && d.isEnabled);
    if (explicitlyDefault && SUPPORTED_ONLINE_ADAPTERS.includes(explicitlyDefault.provider)) {
      primaryActiveProvider = explicitlyDefault.provider;
    } else {
      const anyDefault = configuredDocs.find(d => d.isDefault);
      if (anyDefault && SUPPORTED_ONLINE_ADAPTERS.includes(anyDefault.provider)) {
        primaryActiveProvider = anyDefault.provider;
      } else {
        const anyEnabled = configuredDocs.find(d => d.isEnabled);
        if (anyEnabled && SUPPORTED_ONLINE_ADAPTERS.includes(anyEnabled.provider)) {
          primaryActiveProvider = anyEnabled.provider;
        } else if (configuredDocs.length > 0) {
          primaryActiveProvider = configuredDocs[0].provider;
        }
      }
    }

    // Default to razorpay if none is active
    if (!primaryActiveProvider) {
      primaryActiveProvider = 'razorpay';
    }

    const deduplicatedList: PaymentGateway[] = [];
    const deleteDocIds: string[] = [];

    for (const prov of SUPPORTED_ONLINE_ADAPTERS) {
      const canonicalId = `gw_${prov}_main`;
      const matches = docsByProvider.get(prov) || [];
      const defaultTemplate = UNIVERSAL_GATEWAY_TEMPLATES[prov] || DEFAULT_RAZORPAY_GATEWAY;

      let merged: PaymentGateway;

      if (matches.length === 0) {
        // Doc didn't exist; seed canonical doc
        merged = {
          ...defaultTemplate,
          id: canonicalId,
          isEnabled: prov === primaryActiveProvider,
          isDefault: prov === primaryActiveProvider
        };
        await setDoc(doc(db, 'paymentGateways', canonicalId), merged);
      } else {
        // Pick best doc (prefer canonical ID or one with credentials)
        const canonicalDoc = matches.find(m => m.id === canonicalId) || matches[0];
        
        // Merge credentials across duplicate records if any
        let mergedKeyId = canonicalDoc.keyId || '';
        let mergedKeySecret = canonicalDoc.keySecret || '';
        let mergedAppId = canonicalDoc.appId || '';
        let mergedSecretKey = canonicalDoc.secretKey || '';
        let mergedMerchantId = canonicalDoc.merchantId || '';
        let mergedSaltKey = canonicalDoc.saltKey || '';
        let mergedSaltIndex = canonicalDoc.saltIndex || '1';
        let mergedClientId = canonicalDoc.clientId || '';
        let mergedGpayMid = canonicalDoc.gpayMerchantId || '';
        let mergedGpayKey = canonicalDoc.gpayApiKey || '';
        let mergedPaytmMid = canonicalDoc.paytmMid || '';
        let mergedPaytmKey = canonicalDoc.paytmMerchantKey || '';
        let mergedPaytmWeb = canonicalDoc.paytmWebsite || 'DEFAULT';
        let mergedPaytmChan = canonicalDoc.paytmChannelId || 'WEB';
        let mergedPayuKey = canonicalDoc.payuMerchantKey || '';
        let mergedPayuSalt = canonicalDoc.payuMerchantSalt || '';

        for (const m of matches) {
          if (!mergedKeyId && m.keyId) mergedKeyId = m.keyId;
          if (!mergedKeySecret && m.keySecret) mergedKeySecret = m.keySecret;
          if (!mergedAppId && m.appId) mergedAppId = m.appId;
          if (!mergedSecretKey && m.secretKey) mergedSecretKey = m.secretKey;
          if (!mergedMerchantId && m.merchantId) mergedMerchantId = m.merchantId;
          if (!mergedSaltKey && m.saltKey) mergedSaltKey = m.saltKey;
          if (!mergedClientId && m.clientId) mergedClientId = m.clientId;
          if (!mergedGpayMid && m.gpayMerchantId) mergedGpayMid = m.gpayMerchantId;
          if (!mergedGpayKey && m.gpayApiKey) mergedGpayKey = m.gpayApiKey;
          if (!mergedPaytmMid && m.paytmMid) mergedPaytmMid = m.paytmMid;
          if (!mergedPaytmKey && m.paytmMerchantKey) mergedPaytmKey = m.paytmMerchantKey;
          if (!mergedPayuKey && m.payuMerchantKey) mergedPayuKey = m.payuMerchantKey;
          if (!mergedPayuSalt && m.payuMerchantSalt) mergedPayuSalt = m.payuMerchantSalt;

          // If there are duplicate records with non-canonical IDs, queue them for cleanup
          if (m.id !== canonicalId) {
            deleteDocIds.push(m.id);
          }
        }

        const isThisPrimary = prov === primaryActiveProvider;

        // Restore live Razorpay credentials if missing or was test key
        const resolvedRzpKeyId =
          prov === 'razorpay'
            ? (!mergedKeyId || mergedKeyId.startsWith('rzp_test_') ? LIVE_RAZORPAY_KEY_ID : mergedKeyId.trim())
            : mergedKeyId.trim();
        const resolvedRzpKeySecret =
          prov === 'razorpay'
            ? (!mergedKeySecret ? LIVE_RAZORPAY_KEY_SECRET : mergedKeySecret.trim())
            : mergedKeySecret.trim();

        merged = {
          ...defaultTemplate,
          ...canonicalDoc,
          id: canonicalId,
          provider: prov,
          isEnabled: isThisPrimary,
          isDefault: isThisPrimary,
          environment: prov === 'razorpay' ? 'live' : (canonicalDoc.environment || 'test'),
          keyId: resolvedRzpKeyId,
          keySecret: resolvedRzpKeySecret,
          appId: mergedAppId.trim(),
          secretKey: mergedSecretKey.trim(),
          merchantId: mergedMerchantId.trim(),
          saltKey: mergedSaltKey.trim(),
          saltIndex: mergedSaltIndex.trim() || '1',
          clientId: mergedClientId.trim(),
          gpayMerchantId: mergedGpayMid.trim(),
          gpayApiKey: mergedGpayKey.trim(),
          paytmMid: mergedPaytmMid.trim(),
          paytmMerchantKey: mergedPaytmKey.trim(),
          paytmWebsite: mergedPaytmWeb.trim() || 'DEFAULT',
          paytmChannelId: mergedPaytmChan.trim() || 'WEB',
          payuMerchantKey: mergedPayuKey.trim(),
          payuMerchantSalt: mergedPayuSalt.trim(),
          updatedAt: new Date().toISOString()
        };

        // Write cleaned canonical record
        await setDoc(doc(db, 'paymentGateways', canonicalId), merged, { merge: true });
      }

      deduplicatedList.push(merged);

      // Keep gym_config/payment_gateways updated with active gateway
      if (merged.isEnabled || merged.isDefault) {
        await setDoc(doc(db, 'gym_config', 'payment_gateways'), {
          ...merged,
          status: 'ACTIVE',
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
      }
    }

    // Clean up duplicate non-canonical documents in the background
    if (deleteDocIds.length > 0) {
      for (const idToDelete of deleteDocIds) {
        try {
          await deleteDoc(doc(db, 'paymentGateways', idToDelete));
        } catch (e) {
          console.warn('Could not delete duplicate gateway doc:', idToDelete, e);
        }
      }
    }

    return deduplicatedList;
  } catch (err) {
    console.error('Error fetching and deduplicating payment gateways:', err);
    return ALL_DEFAULT_GATEWAYS;
  }
}

/**
 * Get the currently active/default online gateway selected by Admin
 */
export function getActiveOnlineGateway(gateways: PaymentGateway[]): PaymentGateway | null {
  const onlineList = gateways.filter(g => SUPPORTED_ONLINE_ADAPTERS.includes(g.provider));
  const defaultEnabled = onlineList.find(g => g.isDefault && g.isEnabled);
  if (defaultEnabled) return defaultEnabled;
  const anyEnabled = onlineList.find(g => g.isEnabled);
  if (anyEnabled) return anyEnabled;
  const rzp = onlineList.find(g => g.provider === 'razorpay');
  return rzp || DEFAULT_RAZORPAY_GATEWAY;
}

/**
 * Fetch the single active online gateway directly from database on demand
 */
export async function fetchActiveOnlineGateway(): Promise<PaymentGateway> {
  try {
    const list = await getPaymentGateways();
    return getActiveOnlineGateway(list) || DEFAULT_RAZORPAY_GATEWAY;
  } catch (e) {
    console.warn('Error in fetchActiveOnlineGateway:', e);
    return DEFAULT_RAZORPAY_GATEWAY;
  }
}

/**
 * Save or update a payment gateway:
 * - Always saves to canonical document ID `gw_${gateway.provider}_main`
 * - Rigorously trims all merchant keys, passwords, and IDs
 * - If marked default or enabled, atomics deactivates all other gateways
 */
export async function savePaymentGateway(gateway: PaymentGateway): Promise<void> {
  const canonicalId = `gw_${gateway.provider}_main`;
  const ref = doc(db, 'paymentGateways', canonicalId);
  const now = new Date().toISOString();

  const cleanedGateway: PaymentGateway = {
    ...gateway,
    id: canonicalId,
    keyId: (gateway.keyId || '').trim(),
    keySecret: (gateway.keySecret || '').trim(),
    appId: (gateway.appId || '').trim(),
    secretKey: (gateway.secretKey || '').trim(),
    merchantId: (gateway.merchantId || '').trim(),
    saltKey: (gateway.saltKey || '').trim(),
    saltIndex: (gateway.saltIndex || '1').trim(),
    clientId: (gateway.clientId || '').trim(),
    gpayMerchantId: (gateway.gpayMerchantId || '').trim(),
    gpayApiKey: (gateway.gpayApiKey || '').trim(),
    paytmMid: (gateway.paytmMid || '').trim(),
    paytmMerchantKey: (gateway.paytmMerchantKey || '').trim(),
    paytmWebsite: (gateway.paytmWebsite || 'DEFAULT').trim(),
    paytmChannelId: (gateway.paytmChannelId || 'WEB').trim(),
    payuMerchantKey: (gateway.payuMerchantKey || '').trim(),
    payuMerchantSalt: (gateway.payuMerchantSalt || '').trim(),
    updatedAt: now
  };

  await setDoc(ref, cleanedGateway, { merge: true });

  if (gateway.isEnabled || gateway.isDefault) {
    await activateSingleGateway(canonicalId);
  }
}

export function isGatewayConfigured(gw?: PaymentGateway | null): boolean {
  if (!gw) return false;
  switch (gw.provider) {
    case 'razorpay':
      return Boolean(gw.keyId && gw.keyId.trim().length > 0);
    case 'cashfree':
      return Boolean(gw.appId && gw.appId.trim().length > 0);
    case 'phonepe':
      return Boolean(gw.merchantId && gw.merchantId.trim().length > 0);
    case 'paypal':
      return Boolean(gw.clientId && gw.clientId.trim().length > 0);
    case 'gpay':
      return Boolean(
        (gw.gpayMerchantId && gw.gpayMerchantId.trim().length > 0) ||
        (gw.gpayApiKey && gw.gpayApiKey.trim().length > 0) ||
        (gw.merchantId && gw.merchantId.trim().length > 0)
      );
    case 'paytm':
      return Boolean(
        (gw.paytmMid && gw.paytmMid.trim().length > 0) ||
        (gw.paytmMerchantKey && gw.paytmMerchantKey.trim().length > 0) ||
        (gw.merchantId && gw.merchantId.trim().length > 0)
      );
    case 'payu':
      return Boolean(
        (gw.payuMerchantKey && gw.payuMerchantKey.trim().length > 0) ||
        (gw.keyId && gw.keyId.trim().length > 0)
      );
    default:
      return false;
  }
}

/**
 * Remove / disconnect a payment gateway by wiping credentials and resetting back to unconfigured state
 */
export async function deletePaymentGateway(gatewayId: string): Promise<void> {
  const canonicalDoc = doc(db, 'paymentGateways', gatewayId);
  const snap = await getDoc(canonicalDoc);
  const currentData = snap.exists() ? (snap.data() as PaymentGateway) : null;
  const wasActive = Boolean(currentData?.isEnabled || currentData?.isDefault);

  await setDoc(canonicalDoc, {
    isEnabled: false,
    isDefault: false,
    keyId: '',
    keySecret: '',
    appId: '',
    secretKey: '',
    merchantId: '',
    saltKey: '',
    saltIndex: '1',
    clientId: '',
    gpayMerchantId: '',
    gpayApiKey: '',
    paytmMid: '',
    paytmMerchantKey: '',
    paytmWebsite: 'DEFAULT',
    paytmChannelId: 'WEB',
    payuMerchantKey: '',
    payuMerchantSalt: '',
    updatedAt: new Date().toISOString()
  }, { merge: true });

  // If this was the active gateway, reassign active to another configured gateway
  if (wasActive) {
    const allSnap = await getDocs(collection(db, 'paymentGateways'));
    const remainingConfigured = allSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as PaymentGateway))
      .filter(g => g.id !== gatewayId && isGatewayConfigured(g));

    if (remainingConfigured.length > 0) {
      await activateSingleGateway(remainingConfigured[0].id);
    }
  }
}

/**
 * Radio-Button Strict Single-Active Enforcement:
 * At any given moment, strictly ONLY ONE online payment gateway can be active.
 * Sets the target gateway to { isEnabled: true, isDefault: true }
 * and turns OFF all other gateways ({ isEnabled: false, isDefault: false }) in database and state.
 */
export async function activateSingleGateway(gatewayIdOrProvider: string): Promise<PaymentGateway[]> {
  const snap = await getDocs(collection(db, 'paymentGateways'));
  const now = new Date().toISOString();

  // Find target doc
  let targetId = gatewayIdOrProvider;
  for (const d of snap.docs) {
    const data = d.data();
    if (d.id === gatewayIdOrProvider || data.provider === gatewayIdOrProvider) {
      targetId = d.id;
      break;
    }
  }

  // Atomically update all gateways so strictly ONE is enabled & default
  for (const d of snap.docs) {
    const isTarget = d.id === targetId || d.id === `gw_${gatewayIdOrProvider}_main`;
    await updateDoc(doc(db, 'paymentGateways', d.id), {
      isEnabled: isTarget,
      isDefault: isTarget,
      updatedAt: now
    });
  }

  return await getPaymentGateways();
}

/**
 * Set a gateway as default & active (unsets all other gateways)
 */
export async function setDefaultPaymentGateway(gatewayId: string): Promise<void> {
  await activateSingleGateway(gatewayId);
}

/**
 * Toggle active status: turning ON any gateway activates it and deactivates all others.
 * Turning OFF a gateway switches back to default Razorpay so the app is never left without a gateway.
 */
export async function togglePaymentGateway(gatewayId: string, isEnabled: boolean): Promise<void> {
  if (isEnabled) {
    await activateSingleGateway(gatewayId);
  } else {
    // Fall back to Razorpay
    await activateSingleGateway('gw_razorpay_main');
  }
}

/**
 * Generate official receipt number: TF-REC-YYYY-XXXXXX
 */
export function generateReceiptNumber(): string {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `TF-REC-${year}-${randomSuffix}`;
}

/**
 * Strictly calculate Original Price, Discount Amount, and Final Payable Amount
 * Enforces the Mandatory ₹1 Payment Rule for 100% Discount Coupons:
 * - If a user applies a 100% discount coupon (or if discount reduces total to <= 0),
 *   override the final payable total strictly to ₹1 (One Rupee).
 */
export function calculateCheckoutAmountsWithCoupon(
  subtotal: number,
  discountPercent: number,
  couponCode?: string
): {
  originalPrice: number;
  discountAmount: number;
  finalAmount: number;
  isHundredPercentPromo: boolean;
} {
  const cleanSubtotal = Math.max(0, Math.round(subtotal));
  const hasCoupon = Boolean(couponCode && couponCode.trim()) && discountPercent > 0;

  if (!hasCoupon) {
    return {
      originalPrice: cleanSubtotal,
      discountAmount: 0,
      finalAmount: cleanSubtotal,
      isHundredPercentPromo: false
    };
  }

  if (discountPercent >= 100) {
    // Mandatory ₹1 token fee for 100% discount coupons
    const finalPayable = 1;
    const rawDiscount = Math.max(0, cleanSubtotal - finalPayable);
    return {
      originalPrice: cleanSubtotal,
      discountAmount: rawDiscount,
      finalAmount: finalPayable,
      isHundredPercentPromo: true
    };
  }

  const rawDiscount = Math.round((cleanSubtotal * discountPercent) / 100);
  const computedFinal = cleanSubtotal - rawDiscount;
  // Never allow ₹0 payable when a discount coupon is applied
  const finalPayable = computedFinal <= 0 ? 1 : computedFinal;
  const effectiveDiscount = Math.max(0, cleanSubtotal - finalPayable);

  return {
    originalPrice: cleanSubtotal,
    discountAmount: effectiveDiscount,
    finalAmount: finalPayable,
    isHundredPercentPromo: discountPercent >= 100
  };
}

/**
 * Validate a Promo Coupon Code against Firestore `offers` collection:
 * - Enforces usage limit check (`timesUsed >= maxUsageLimit`) and returns exact error:
 *   "Coupon limit reached. This promo code is no longer available."
 * - Automatically locks/deactivates the coupon in Firestore if limit is reached.
 */
export async function validatePromoCouponCode(
  rawCode: string,
  options?: { addPt?: boolean; planId?: string }
): Promise<{
  valid: boolean;
  offer?: PromotionalOffer;
  code?: string;
  discountPercent?: number;
  error?: string;
}> {
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    return { valid: false, error: 'Please enter a valid promo code.' };
  }

  try {
    const q = query(collection(db, 'offers'), where('code', '==', code));
    const snap = await getDocs(q);

    let matchedDoc = snap.docs[0];
    if (!matchedDoc) {
      // Fallback case-insensitive scan
      const allSnap = await getDocs(collection(db, 'offers'));
      matchedDoc = allSnap.docs.find(
        d => String(d.data().code || '').trim().toUpperCase() === code
      ) as any;
    }

    if (!matchedDoc) {
      return { valid: false, error: 'Invalid or expired coupon code.' };
    }

    const offer = { id: matchedDoc.id, ...matchedDoc.data() } as PromotionalOffer;
    const timesUsed = Number(offer.timesUsed || 0);
    const maxUsageLimit =
      typeof offer.maxUsageLimit === 'number' && offer.maxUsageLimit > 0
        ? offer.maxUsageLimit
        : 0;

    // 1. Check usage limit first (even if active flag wasn't flipped yet)
    if (maxUsageLimit > 0 && timesUsed >= maxUsageLimit) {
      if (offer.active) {
        try {
          await updateDoc(doc(db, 'offers', offer.id), {
            active: false,
            deactivatedAt: new Date().toISOString()
          });
        } catch {}
      }
      return {
        valid: false,
        error: 'Coupon limit reached. This promo code is no longer available.'
      };
    }

    // 2. Check active status
    if (!offer.active) {
      return {
        valid: false,
        error: 'This promo code has been deactivated and is no longer available.'
      };
    }

    // 3. Check expiry date
    if (offer.validUntil) {
      const expiryEnd = new Date(`${offer.validUntil}T23:59:59`);
      if (expiryEnd.getTime() < Date.now()) {
        return {
          valid: false,
          error: 'This promo code has expired.'
        };
      }
    }

    // 4. Optional PTBOOST rule if PT is not selected
    if (code === 'PTBOOST' && options?.addPt === false) {
      return {
        valid: false,
        error: 'PTBOOST requires adding Personal Trainer (PT) to your plan.'
      };
    }

    // 5. Membership Plan Eligibility Check
    if (
      offer.applicableTarget === 'specific' &&
      Array.isArray(offer.applicablePlanIds) &&
      offer.applicablePlanIds.length > 0
    ) {
      if (options?.planId && !offer.applicablePlanIds.includes(options.planId)) {
        return {
          valid: false,
          error: 'This coupon is not valid for the selected membership plan.'
        };
      }
    }

    return {
      valid: true,
      offer,
      code: offer.code,
      discountPercent: Number(offer.discountPercent || 0)
    };
  } catch (err) {
    console.error('Error validating promo coupon:', err);
    return { valid: false, error: 'Unable to verify promo code right now. Please try again.' };
  }
}

/**
 * Strictly increment a coupon's `timesUsed` count ONLY when payment is officially completed
 * (either via Online Gateway success or Offline Payment Approval by Admin).
 * Automatically deactivates/locks the coupon (`active: false`) once `timesUsed >= maxUsageLimit`.
 */
export async function redeemCouponOnPaymentSuccess(rawCode?: string): Promise<void> {
  if (!rawCode || !rawCode.trim() || rawCode.trim().toUpperCase() === 'NONE') return;
  const code = rawCode.trim().toUpperCase();

  try {
    const q = query(collection(db, 'offers'), where('code', '==', code));
    const snap = await getDocs(q);
    let matchedDoc = snap.docs[0];

    if (!matchedDoc) {
      const allSnap = await getDocs(collection(db, 'offers'));
      matchedDoc = allSnap.docs.find(
        d => String(d.data().code || '').trim().toUpperCase() === code
      ) as any;
    }

    if (!matchedDoc) return;

    const offerData = matchedDoc.data() as PromotionalOffer;
    const currentUsed = Number(offerData.timesUsed || 0);
    const maxLimit =
      typeof offerData.maxUsageLimit === 'number' && offerData.maxUsageLimit > 0
        ? offerData.maxUsageLimit
        : 0;
    const nextUsed = currentUsed + 1;
    const shouldLock = maxLimit > 0 && nextUsed >= maxLimit;

    await updateDoc(doc(db, 'offers', matchedDoc.id), {
      timesUsed: nextUsed,
      ...(shouldLock
        ? {
            active: false,
            deactivatedAt: new Date().toISOString()
          }
        : {})
    });
  } catch (err) {
    console.warn('Could not increment coupon redemption count:', err);
  }
}

/**
 * Deeply strips `undefined` values from an object before writing to Firestore
 * so `setDoc` / `updateDoc` never throw `Unsupported field value: undefined`.
 */
export function sanitizeFirestorePayload<T extends Record<string, any>>(obj: T): T {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      cleaned[key] = sanitizeFirestorePayload(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned as T;
}

/**
 * Record a payment transaction
 * Note: Increments coupon usage ONLY if `data.status === 'success'`
 */
export async function createPaymentTransaction(
  data: Omit<PaymentTransaction, 'id' | 'receiptNumber' | 'createdAt'>
): Promise<PaymentTransaction> {
  const txId = `txn_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const receiptNumber = generateReceiptNumber();
  const now = new Date().toISOString();

  // Enforce ₹1 mandatory rule if 100% coupon was applied
  const isHundredPercent = Number(data.discountPercent || 0) >= 100;
  const rawFinal = data.finalAmount ?? data.amount;
  const enforcedFinal = isHundredPercent ? 1 : rawFinal;

  const resolvedPaymentId =
    data.paymentId || data.razorpayPaymentId || data.referenceId || txId;

  const rawRecord: PaymentTransaction = {
    ...data,
    id: txId,
    receiptNumber,
    clientPhone: data.clientPhone || '',
    clientEmail: data.clientEmail || '',
    planId: data.planId || '',
    planName: data.planName || data.itemTitle,
    couponCode: data.couponCode || '',
    amount: enforcedFinal,
    finalAmount: enforcedFinal,
    originalPrice: data.originalPrice ?? data.amount,
    discountAmount: data.discountAmount ?? 0,
    discountPercent: data.discountPercent ?? 0,
    paymentId: resolvedPaymentId,
    referenceId: data.referenceId || resolvedPaymentId,
    verificationStatus:
      data.status === 'success'
        ? 'ACTIVE'
        : data.status === 'pending'
        ? 'PENDING'
        : 'REJECTED',
    ptIncluded: Boolean(data.ptIncluded),
    ptTrainerId: data.ptTrainerId || '',
    ptTrainerName: data.ptTrainerName || '',
    timestamp: now,
    createdAt: now,
    ...(data.status === 'success' ? { completedAt: now } : {})
  };

  const cleanRecord = sanitizeFirestorePayload(rawRecord);

  // Synchronously replicate transaction across all primary and alias financial collections
  await Promise.allSettled([
    setDoc(doc(db, 'paymentTransactions', txId), cleanRecord),
    setDoc(doc(db, 'transactions', txId), cleanRecord),
    setDoc(doc(db, 'payments', txId), cleanRecord),
    setDoc(doc(db, 'invoices', txId), cleanRecord),
    setDoc(doc(db, 'billing_history', txId), cleanRecord)
  ]);

  // Strict Redemption Lock: Increment coupon usage ONLY when payment is officially completed
  if (cleanRecord.status === 'success' && cleanRecord.couponCode) {
    await redeemCouponOnPaymentSuccess(cleanRecord.couponCode);
  }

  return cleanRecord;
}

export interface OnlinePaymentVerificationInput {
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  purpose: PaymentPurpose;
  itemTitle: string;
  planId?: string;
  planName: string;
  durationMonths: number;
  startDate?: string;
  endDate?: string;
  originalPrice: number;
  couponCode?: string;
  discountPercent?: number;
  discountAmount?: number;
  paidAmount: number;
  currency?: string;
  gatewayId: string;
  gatewayProvider: PaymentProvider;
  gatewayName: string;
  paymentMethod: string;
  razorpayPaymentId: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
  ptIncluded?: boolean;
  ptTrainerId?: string;
  ptTrainerName?: string;
  metadata?: Record<string, any>;
}

/**
 * Direct Client-Side Post-Payment Verification & Optimistic Database Synchronization:
 * 1. Captures razorpay_payment_id, razorpay_order_id, and razorpay_signature.
 * 2. Writes completed transaction into `paymentTransactions` (with status: 'success', verificationStatus: 'ACTIVE', paymentId, timestamp).
 * 3. Atomically increments `timesUsed` on applied coupon doc (and locks if maxUsageLimit reached).
 * 4. Immediately updates `users/{clientId}` (`membershipStatus: 'ACTIVE'`, `membershipPlan`, `membershipStartDate`, `membershipExpiryDate`)
 *    and `clientProfiles/{clientId}` (`membershipStatus: 'active'`, `membershipPlanName`, `membershipStartDate`, `membershipEndDate`),
 *    and writes the active `memberships` (or `aerobicsSubscriptions` / `ptRequests`) record so the user is never left hanging.
 */
export async function verifyAndActivateOnlinePayment(
  input: OnlinePaymentVerificationInput
): Promise<PaymentTransaction> {
  const now = new Date();
  const nowIso = now.toISOString();
  const durationMonths = input.durationMonths || 1;
  const startDate = input.startDate || nowIso.split('T')[0];
  let endDate = input.endDate;
  if (!endDate) {
    const endD = new Date(now);
    endD.setMonth(endD.getMonth() + durationMonths);
    endDate = endD.toISOString().split('T')[0];
  }

  const cleanPaymentId =
    (input.razorpayPaymentId || '').trim() || `pay_${Date.now()}`;
  const cleanOrderId =
    (input.razorpayOrderId || '').trim() || `order_${Date.now()}`;
  const cleanSignature = (input.razorpaySignature || '').trim();

  const isHundredPercent = Number(input.discountPercent || 0) >= 100;
  const enforcedPaid = isHundredPercent
    ? 1
    : input.paidAmount <= 0 && input.couponCode
    ? 1
    : input.paidAmount;
  const enforcedDiscount = isHundredPercent
    ? Math.max(0, input.originalPrice - 1)
    : input.discountAmount || 0;

  const memId =
    input.purpose === 'membership' || input.purpose === 'renewal'
      ? `mem_${Date.now()}_${input.clientId}`
      : undefined;

  // Step 1: Write completed transaction record (also redeems coupon if couponCode provided)
  const transaction = await createPaymentTransaction({
    clientId: input.clientId,
    clientName: input.clientName,
    clientPhone: input.clientPhone || '',
    clientEmail: input.clientEmail || '',
    purpose: input.purpose,
    itemTitle: input.itemTitle,
    planId: input.planId || 'custom',
    planName: input.planName || input.itemTitle,
    durationMonths,
    startDate,
    endDate,
    originalPrice: input.originalPrice,
    couponCode: input.couponCode || '',
    discountPercent: input.discountPercent || 0,
    discountAmount: enforcedDiscount,
    finalAmount: enforcedPaid,
    amount: enforcedPaid,
    currency: input.currency || 'INR',
    status: 'success',
    verificationStatus: 'ACTIVE',
    paymentMode: 'online',
    gatewayId: input.gatewayId,
    gatewayProvider: input.gatewayProvider,
    gatewayName: input.gatewayName,
    paymentMethod: input.paymentMethod,
    paymentId: cleanPaymentId,
    referenceId: cleanPaymentId,
    membershipId: memId,
    ptIncluded: Boolean(input.ptIncluded),
    ptTrainerId: input.ptTrainerId || '',
    ptTrainerName: input.ptTrainerName || '',
    approvedAt: nowIso,
    razorpayPaymentId: cleanPaymentId,
    razorpayOrderId: cleanOrderId,
    razorpaySignature: cleanSignature,
    timestamp: nowIso,
    metadata: sanitizeFirestorePayload({
      ...(input.metadata || {}),
      verifiedClientSideAt: nowIso,
      razorpayPaymentId: cleanPaymentId,
      razorpayOrderId: cleanOrderId
    })
  });

  // Step 2: Activate Membership / Aerobics / PT records & update user docs immediately
  if (input.purpose === 'membership' || input.purpose === 'renewal') {
    // Check for existing active membership for seamless stacking / queueing
    let isCurrentlyActive = false;
    let existingExpiryDate = '';
    try {
      const clientSnap = await getDoc(doc(db, 'clientProfiles', input.clientId));
      if (clientSnap.exists()) {
        const cData = clientSnap.data();
        const curStatus = String(cData.membershipStatus || '').toLowerCase();
        const curExpiry = cData.membershipEndDate || cData.membershipExpiryDate || '';
        const todayStr = new Date().toISOString().split('T')[0];
        if (curStatus === 'active' && curExpiry && curExpiry >= todayStr) {
          isCurrentlyActive = true;
          existingExpiryDate = curExpiry;
        }
      }
    } catch (e) {
      console.warn('Could not check existing client profile for stacking:', e);
    }

    const finalMemId = memId || `mem_${Date.now()}_${input.clientId}`;
    let memStatus: 'active' | 'queued' = 'active';
    let effectiveStartDate = startDate;
    let effectiveEndDate = endDate;

    if (isCurrentlyActive && existingExpiryDate) {
      memStatus = 'queued';
      // Seamless stacking: Next plan begins automatically the day after current active expiry ends
      const nextStart = new Date(`${existingExpiryDate}T00:00:00`);
      nextStart.setDate(nextStart.getDate() + 1);
      effectiveStartDate = nextStart.toISOString().split('T')[0];

      const nextEnd = new Date(nextStart);
      nextEnd.setMonth(nextEnd.getMonth() + durationMonths);
      effectiveEndDate = nextEnd.toISOString().split('T')[0];
    }

    const membershipRecord: MembershipRecord = sanitizeFirestorePayload({
      id: finalMemId,
      clientId: input.clientId,
      clientName: input.clientName,
      planId: input.planId || 'custom',
      planName: input.planName || input.itemTitle,
      durationMonths,
      amountPaid: enforcedPaid,
      originalPrice: input.originalPrice,
      couponCode: input.couponCode || '',
      discountAmount: enforcedDiscount,
      discountPercent: input.discountPercent || 0,
      paymentMode: 'online',
      gatewayId: input.gatewayId,
      gatewayProvider: input.gatewayProvider,
      gatewayName: input.gatewayName,
      referenceId: cleanPaymentId,
      receiptNumber: transaction.receiptNumber,
      transactionId: transaction.id,
      status: memStatus,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      ptIncluded: Boolean(input.ptIncluded),
      ptTrainerId: input.ptTrainerId || '',
      ptTrainerName: input.ptTrainerName || '',
      approvedAt: nowIso,
      createdAt: nowIso
    });

    await setDoc(doc(db, 'memberships', finalMemId), membershipRecord, { merge: true });

    let clientProfileUpdates: Record<string, any>;
    if (memStatus === 'queued') {
      // Seamless Stacking: Keep current active plan intact; queue the next plan
      clientProfileUpdates = sanitizeFirestorePayload({
        userId: input.clientId,
        displayName: input.clientName,
        queuedPlanId: input.planId || 'custom',
        queuedPlanName: input.planName || input.itemTitle,
        queuedStartDate: effectiveStartDate,
        queuedEndDate: effectiveEndDate,
        queuedDurationMonths: durationMonths,
        queuedAmountPaid: enforcedPaid,
        offlineRequestStatus: 'none',
        pendingOfflineRequestId: '',
        offlineRejectionReason: '',
        ...(input.ptIncluded
          ? {
              ptStatus: 'active',
              ...(input.ptTrainerId ? { assignedTrainerId: input.ptTrainerId } : {}),
              ...(input.ptTrainerName ? { assignedTrainerName: input.ptTrainerName } : {})
            }
          : {})
      });
    } else {
      clientProfileUpdates = sanitizeFirestorePayload({
        userId: input.clientId,
        displayName: input.clientName,
        membershipStatus: 'active',
        membershipPlan: input.planName || input.itemTitle,
        membershipPlanId: input.planId || 'custom',
        membershipPlanName: input.planName || input.itemTitle,
        membershipStartDate: effectiveStartDate,
        membershipEndDate: effectiveEndDate,
        membershipExpiryDate: effectiveEndDate,
        offlineRequestStatus: 'none',
        pendingOfflineRequestId: '',
        offlineRejectionReason: '',
        ...(input.ptIncluded
          ? {
              ptStatus: 'active',
              ...(input.ptTrainerId ? { assignedTrainerId: input.ptTrainerId } : {}),
              ...(input.ptTrainerName ? { assignedTrainerName: input.ptTrainerName } : {})
            }
          : {})
      });
    }

    await setDoc(doc(db, 'clientProfiles', input.clientId), clientProfileUpdates, {
      merge: true
    });

    // Also sync top-level user document with ACTIVE status and expiry dates if newly active
    if (memStatus === 'active') {
      try {
        await setDoc(
          doc(db, 'users', input.clientId),
          sanitizeFirestorePayload({
            membershipStatus: 'ACTIVE',
            membershipPlan: input.planName || input.itemTitle,
            membershipStartDate: effectiveStartDate,
            membershipExpiryDate: effectiveEndDate
          }),
          { merge: true }
        );
      } catch (userSyncErr) {
        console.warn('Could not sync users doc membership fields:', userSyncErr);
      }
    }
  } else if (input.purpose === 'aerobics') {
    const batchId = input.metadata?.batchId || input.planId || '';
    const batchName = input.metadata?.batchName || input.planName || input.itemTitle;
    const slotTiming = input.metadata?.slotTiming || '';
    const instructorName = input.metadata?.instructorName || 'Coach Pooja Sharma';
    const planDuration =
      (input.metadata?.planDuration as 'monthly' | 'quarterly') ||
      (durationMonths >= 3 ? 'quarterly' : 'monthly');
    const subId = `aerosub_${input.clientId}_${Date.now()}`;

    await setDoc(
      doc(db, 'aerobicsSubscriptions', subId),
      sanitizeFirestorePayload({
        id: subId,
        clientId: input.clientId,
        clientName: input.clientName,
        clientPhone: input.clientPhone || '',
        batchId,
        batchName,
        slotTiming,
        instructorName,
        planDuration,
        durationMonths,
        amountPaid: enforcedPaid,
        originalPrice: input.originalPrice,
        couponCode: input.couponCode || '',
        discountAmount: enforcedDiscount,
        paymentMode: 'online',
        gatewayName: input.gatewayName,
        referenceId: cleanPaymentId,
        status: 'active',
        startDate,
        endDate,
        createdAt: nowIso
      }),
      { merge: true }
    );

    if (batchId) {
      try {
        await updateDoc(doc(db, 'aerobicsBatches', batchId), {
          enrolledClientIds: arrayUnion(input.clientId)
        });
      } catch (e) {
        console.warn('Could not append clientId to aerobicsBatches:', e);
      }
    }

    await setDoc(
      doc(db, 'clientProfiles', input.clientId),
      sanitizeFirestorePayload({
        aerobicsStatus: 'active',
        aerobicsBatchId: batchId,
        aerobicsBatchName: batchName,
        aerobicsSlotTiming: slotTiming,
        aerobicsPlanType: planDuration,
        aerobicsStartDate: startDate,
        aerobicsEndDate: endDate
      }),
      { merge: true }
    );
  } else if (input.purpose === 'personal_training') {
    const ptRequestId = input.metadata?.ptRequestId || input.planId || '';
    const trainerId = input.ptTrainerId || input.metadata?.trainerId || '';
    const trainerName = input.ptTrainerName || input.metadata?.trainerName || '';

    if (ptRequestId) {
      try {
        await setDoc(
          doc(db, 'ptRequests', ptRequestId),
          {
            status: 'PAYMENT_SUCCESS_NEEDS_ASSIGNMENT',
            paymentMode: 'online',
            paidStatus: 'paid',
            transactionId: cleanPaymentId || transaction.id,
            updatedAt: nowIso
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('Could not update ptRequest:', e);
      }
    }

    await setDoc(
      doc(db, 'clientProfiles', input.clientId),
      sanitizeFirestorePayload({
        ptStatus: 'pending_assignment',
        requestedTrainerId: trainerId,
        requestedTrainerName: trainerName
      }),
      { merge: true }
    );
  }

  return transaction;
}

/**
 * METHOD A: Submit an Offline / Cash Payment Request (Client -> Admin Verification Queue)
 * Membership remains locked/inactive until Admin clicks "Approve & Activate".
 */
export interface OfflinePaymentRequestInput {
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  purpose: PaymentPurpose;
  itemTitle: string;
  planId?: string;
  planName: string;
  durationMonths: number;
  originalPrice: number;
  couponCode?: string;
  discountPercent?: number;
  discountAmount?: number;
  finalAmount: number;
  ptIncluded?: boolean;
  ptTrainerId?: string;
  ptTrainerName?: string;
  metadata?: Record<string, any>;
}

export async function submitOfflinePaymentRequest(
  input: OfflinePaymentRequestInput
): Promise<{ transaction: PaymentTransaction; membershipRecord?: MembershipRecord }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const startDate = nowIso.split('T')[0];
  const endD = new Date(now);
  endD.setMonth(endD.getMonth() + (input.durationMonths || 1));
  const endDate = endD.toISOString().split('T')[0];

  const txId = `txn_cash_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const memId = `mem_cash_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const receiptNumber = generateReceiptNumber();
  const refId = `CASH-REQ-${Math.floor(100000 + Math.random() * 900000)}`;

  const isHundredPercent = Number(input.discountPercent || 0) >= 100;
  const enforcedFinal = isHundredPercent ? 1 : input.finalAmount <= 0 && input.couponCode ? 1 : input.finalAmount;
  const enforcedDiscount = isHundredPercent
    ? Math.max(0, input.originalPrice - 1)
    : input.discountAmount || 0;

  let membershipRecord: MembershipRecord | undefined;

  if (input.purpose === 'membership' || input.purpose === 'renewal') {
    membershipRecord = sanitizeFirestorePayload<MembershipRecord>({
      id: memId,
      clientId: input.clientId,
      clientName: input.clientName,
      planId: input.planId || 'custom',
      planName: input.planName,
      durationMonths: input.durationMonths,
      amountPaid: enforcedFinal,
      originalPrice: input.originalPrice,
      couponCode: input.couponCode || '',
      discountAmount: enforcedDiscount,
      discountPercent: input.discountPercent || 0,
      paymentMode: 'cash',
      gatewayId: 'gw_offline_cash',
      gatewayProvider: 'offline_cash',
      gatewayName: 'Offline Cash Desk',
      referenceId: refId,
      receiptNumber,
      transactionId: txId,
      status: 'pending',
      startDate,
      endDate,
      ptIncluded: Boolean(input.ptIncluded),
      ptTrainerId: input.ptTrainerId || '',
      ptTrainerName: input.ptTrainerName || '',
      createdAt: nowIso
    });
    await setDoc(doc(db, 'memberships', memId), membershipRecord);
  }

  const transaction: PaymentTransaction = sanitizeFirestorePayload({
    id: txId,
    receiptNumber,
    clientId: input.clientId,
    clientName: input.clientName,
    clientPhone: input.clientPhone || '',
    clientEmail: input.clientEmail || '',
    purpose: input.purpose,
    itemTitle: input.itemTitle,
    planId: input.planId || '',
    planName: input.planName,
    durationMonths: input.durationMonths,
    startDate,
    endDate,
    originalPrice: input.originalPrice,
    couponCode: input.couponCode || '',
    discountPercent: input.discountPercent || 0,
    discountAmount: enforcedDiscount,
    finalAmount: enforcedFinal,
    amount: enforcedFinal,
    currency: 'INR',
    status: 'pending',
    verificationStatus: 'PENDING',
    paymentMode: 'cash',
    gatewayId: 'gw_offline_cash',
    gatewayProvider: 'offline_cash',
    gatewayName: 'Offline Cash Desk',
    paymentMethod: 'Offline / Cash (Pending Approval)',
    paymentId: refId,
    referenceId: refId,
    ...(membershipRecord ? { membershipId: memId } : {}),
    ptIncluded: Boolean(input.ptIncluded),
    ptTrainerId: input.ptTrainerId || '',
    ptTrainerName: input.ptTrainerName || '',
    timestamp: nowIso,
    metadata: {
      ...(input.metadata || {}),
      requestedAt: nowIso
    },
    createdAt: nowIso
  });

  await setDoc(doc(db, 'paymentTransactions', txId), transaction);

  // Mark client profile as having a pending offline verification request (membership stays inactive/locked until approved)
  try {
    await setDoc(
      doc(db, 'clientProfiles', input.clientId),
      {
        pendingOfflineRequestId: txId,
        offlineRequestStatus: 'pending',
        offlineRejectionReason: ''
      },
      { merge: true }
    );
  } catch (e) {
    console.warn('Could not update clientProfile pending status:', e);
  }

  return { transaction, membershipRecord };
}

export interface OfflineApprovalVerificationInput {
  amountReceived?: number;
  paymentReceivedDate?: string;
  approvedByAdminId?: string;
  approvedByAdminName?: string;
}

export function calculateExpiryFromPaymentDate(
  startDateStr: string,
  durationMonths: number = 1
): { expiryDate: string; durationDays: number } {
  const cleanMonths = Math.max(1, Number(durationMonths) || 1);
  const durationDays = cleanMonths === 12 ? 365 : cleanMonths * 30;
  const base = startDateStr ? new Date(`${startDateStr}T00:00:00`) : new Date();
  if (isNaN(base.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + durationDays);
    return { expiryDate: fallback.toISOString().split('T')[0], durationDays };
  }
  base.setDate(base.getDate() + durationDays);
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return { expiryDate: `${yyyy}-${mm}-${dd}`, durationDays };
}

/**
 * METHOD A (ADMIN ACTION): Approve & Activate an Offline Cash Payment Request
 * Automatically turns the membership ACTIVE immediately with valid start and end dates
 * calculated from the Admin-verified Payment Received Date.
 */
export async function approveOfflinePaymentRequest(
  transactionId: string,
  verification?: OfflineApprovalVerificationInput
): Promise<void> {
  const txRef = doc(db, 'paymentTransactions', transactionId);
  const txSnap = await getDoc(txRef);
  if (!txSnap.exists()) {
    throw new Error('Payment request not found');
  }

  const tx = { id: txSnap.id, ...txSnap.data() } as PaymentTransaction;
  const now = new Date();
  const nowIso = now.toISOString();
  const durationMonths = tx.durationMonths || Number(tx.metadata?.durationMonths) || 1;
  const startDate = verification?.paymentReceivedDate?.trim() || nowIso.split('T')[0];
  const { expiryDate: endDate, durationDays } = calculateExpiryFromPaymentDate(
    startDate,
    durationMonths
  );

  const recordedAmount =
    verification?.amountReceived !== undefined && !isNaN(Number(verification.amountReceived))
      ? Math.max(0, Number(verification.amountReceived))
      : tx.finalAmount ?? tx.amount ?? 0;

  const approvedByAdminId = verification?.approvedByAdminId || 'admin_master';
  const approvedByAdminName = verification?.approvedByAdminName || 'Master Admin';

  const approvedRefId = tx.referenceId?.startsWith('CASH-REQ-')
    ? tx.referenceId.replace('CASH-REQ-', 'CASH-APR-')
    : tx.referenceId || `CASH-APR-${Math.floor(100000 + Math.random() * 900000)}`;

  // 1. Update PaymentTransaction to success with Admin verification audit fields
  const wasAlreadyApproved = tx.status === 'success';
  await updateDoc(
    txRef,
    sanitizeFirestorePayload({
      status: 'success',
      verificationStatus: 'ACTIVE',
      startDate,
      endDate,
      finalAmount: recordedAmount,
      amount: recordedAmount,
      paymentId: approvedRefId,
      referenceId: approvedRefId,
      gatewayName: 'Offline Cash Approved',
      paymentMethod: 'Offline Cash Approved',
      paymentReceivedDate: startDate,
      approvedByAdminId,
      approvedByAdminName,
      approvedAt: nowIso,
      completedAt: nowIso,
      metadata: {
        ...(tx.metadata || {}),
        paymentReceivedDate: startDate,
        calculatedDurationDays: durationDays,
        recordedAmountReceived: recordedAmount,
        approvedByAdminId,
        approvedByAdminName,
        approvedAt: nowIso
      }
    })
  );

  // Strict Redemption Lock: Increment coupon usage ONLY when offline payment is approved by Admin
  if (!wasAlreadyApproved && tx.couponCode) {
    await redeemCouponOnPaymentSuccess(tx.couponCode);
  }

  // 2. Activate according to purpose
  if (tx.purpose === 'membership' || tx.purpose === 'renewal') {
    // Check for existing active membership for seamless stacking / queueing
    let isCurrentlyActive = false;
    let existingExpiryDate = '';
    try {
      const clientSnap = await getDoc(doc(db, 'clientProfiles', tx.clientId));
      if (clientSnap.exists()) {
        const cData = clientSnap.data();
        const curStatus = String(cData.membershipStatus || '').toLowerCase();
        const curExpiry = cData.membershipEndDate || cData.membershipExpiryDate || '';
        const todayStr = new Date().toISOString().split('T')[0];
        if (curStatus === 'active' && curExpiry && curExpiry >= todayStr) {
          isCurrentlyActive = true;
          existingExpiryDate = curExpiry;
        }
      }
    } catch (e) {
      console.warn('Could not check existing client profile for stacking in offline approval:', e);
    }

    const memId = tx.membershipId || `mem_${Date.now()}`;
    let memStatus: 'active' | 'queued' = 'active';
    let effectiveStartDate = startDate;
    let effectiveEndDate = endDate;

    if (isCurrentlyActive && existingExpiryDate) {
      memStatus = 'queued';
      // Seamless stacking: Next plan begins automatically the day after current active expiry ends
      const nextStart = new Date(`${existingExpiryDate}T00:00:00`);
      nextStart.setDate(nextStart.getDate() + 1);
      effectiveStartDate = nextStart.toISOString().split('T')[0];

      const { expiryDate: stackedEnd } = calculateExpiryFromPaymentDate(
        effectiveStartDate,
        durationMonths
      );
      effectiveEndDate = stackedEnd;
    }

    const memRef = doc(db, 'memberships', memId);
    const memSnap = await getDoc(memRef);

    if (memSnap.exists()) {
      await updateDoc(
        memRef,
        sanitizeFirestorePayload({
          status: memStatus,
          startDate: effectiveStartDate,
          endDate: effectiveEndDate,
          amountPaid: recordedAmount,
          referenceId: approvedRefId,
          gatewayName: 'Offline Cash Approved',
          paymentReceivedDate: startDate,
          approvedByAdminId,
          approvedAt: nowIso
        })
      );
    } else {
      const newMem: MembershipRecord = sanitizeFirestorePayload({
        id: memId,
        clientId: tx.clientId,
        clientName: tx.clientName,
        planId: tx.planId || 'plan',
        planName: tx.planName || tx.itemTitle,
        durationMonths,
        amountPaid: recordedAmount,
        originalPrice: tx.originalPrice ?? recordedAmount,
        couponCode: tx.couponCode || '',
        discountAmount: tx.discountAmount || 0,
        discountPercent: tx.discountPercent || 0,
        paymentMode: 'cash',
        gatewayId: 'gw_offline_cash',
        gatewayProvider: 'offline_cash',
        gatewayName: 'Offline Cash Approved',
        referenceId: approvedRefId,
        receiptNumber: tx.receiptNumber,
        transactionId: tx.id,
        status: memStatus,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        ptIncluded: Boolean(tx.ptIncluded),
        ptTrainerId: tx.ptTrainerId || '',
        ptTrainerName: tx.ptTrainerName || '',
        approvedAt: nowIso,
        createdAt: tx.createdAt
      });
      await setDoc(memRef, newMem);
    }

    let clientUpdates: Record<string, any>;
    if (memStatus === 'queued') {
      // Seamless Stacking: Keep current active plan intact; queue next plan
      clientUpdates = sanitizeFirestorePayload({
        queuedPlanId: tx.planId || 'custom',
        queuedPlanName: tx.planName || tx.itemTitle,
        queuedStartDate: effectiveStartDate,
        queuedEndDate: effectiveEndDate,
        queuedDurationMonths: durationMonths,
        queuedAmountPaid: recordedAmount,
        offlineRequestStatus: 'approved',
        pendingOfflineRequestId: '',
        offlineRejectionReason: '',
        ...(tx.ptIncluded && tx.ptTrainerId
          ? {
              ptStatus: 'active',
              assignedTrainerId: tx.ptTrainerId,
              ...(tx.ptTrainerName ? { assignedTrainerName: tx.ptTrainerName } : {})
            }
          : {})
      });
    } else {
      clientUpdates = sanitizeFirestorePayload({
        membershipStatus: 'active',
        membershipPlan: tx.planName || tx.itemTitle,
        membershipPlanId: tx.planId || 'custom',
        membershipPlanName: tx.planName || tx.itemTitle,
        membershipStartDate: effectiveStartDate,
        membershipEndDate: effectiveEndDate,
        membershipExpiryDate: effectiveEndDate,
        offlineRequestStatus: 'approved',
        pendingOfflineRequestId: '',
        offlineRejectionReason: '',
        ...(tx.ptIncluded && tx.ptTrainerId
          ? {
              ptStatus: 'active',
              assignedTrainerId: tx.ptTrainerId,
              ...(tx.ptTrainerName ? { assignedTrainerName: tx.ptTrainerName } : {})
            }
          : {})
      });
    }

    await setDoc(doc(db, 'clientProfiles', tx.clientId), clientUpdates, { merge: true });

    if (memStatus === 'active') {
      try {
        await setDoc(
          doc(db, 'users', tx.clientId),
          sanitizeFirestorePayload({
            membershipStatus: 'ACTIVE',
            membershipPlan: tx.planName || tx.itemTitle,
            membershipStartDate: effectiveStartDate,
            membershipExpiryDate: effectiveEndDate
          }),
          { merge: true }
        );
      } catch (e) {
        console.warn('Could not sync users doc on offline approval:', e);
      }
    }
  } else if (tx.purpose === 'aerobics') {
    const batchId = tx.metadata?.batchId || tx.planId || '';
    const batchName = tx.metadata?.batchName || tx.planName || tx.itemTitle;
    const slotTiming = tx.metadata?.slotTiming || '';
    const instructorName = tx.metadata?.instructorName || 'Instructor';
    const planDuration = (tx.metadata?.planDuration as 'monthly' | 'quarterly') || 'monthly';
    const subId = tx.metadata?.aerobicsSubId || `aesub_${Date.now()}`;

    await setDoc(
      doc(db, 'aerobicsSubscriptions', subId),
      sanitizeFirestorePayload({
        id: subId,
        clientId: tx.clientId,
        clientName: tx.clientName,
        clientPhone: tx.clientPhone || '',
        batchId,
        batchName,
        slotTiming,
        instructorName,
        planDuration,
        durationMonths,
        amountPaid: recordedAmount,
        originalPrice: tx.originalPrice ?? recordedAmount,
        couponCode: tx.couponCode || '',
        discountAmount: tx.discountAmount || 0,
        paymentMode: 'cash',
        gatewayName: 'Offline Cash Approved',
        referenceId: approvedRefId,
        status: 'active',
        startDate,
        endDate,
        createdAt: tx.createdAt
      }),
      { merge: true }
    );

    if (batchId) {
      try {
        await updateDoc(doc(db, 'aerobicsBatches', batchId), {
          enrolledClientIds: arrayUnion(tx.clientId)
        });
      } catch (e) {
        console.warn('Could not append clientId to aerobicsBatch:', e);
      }
    }

    await setDoc(
      doc(db, 'clientProfiles', tx.clientId),
      sanitizeFirestorePayload({
        aerobicsStatus: 'active',
        aerobicsBatchId: batchId,
        aerobicsBatchName: batchName,
        aerobicsSlotTiming: slotTiming,
        aerobicsPlanType: planDuration,
        aerobicsStartDate: startDate,
        aerobicsEndDate: endDate,
        offlineRequestStatus: 'approved',
        pendingOfflineRequestId: '',
        offlineRejectionReason: ''
      }),
      { merge: true }
    );
  } else if (tx.purpose === 'personal_training') {
    const ptRequestId = tx.metadata?.ptRequestId || tx.planId;
    const trainerId = tx.ptTrainerId || tx.metadata?.trainerId;
    const trainerName = tx.ptTrainerName || tx.metadata?.trainerName;

    if (ptRequestId) {
      try {
        await updateDoc(doc(db, 'ptRequests', ptRequestId), {
          status: 'active',
          updatedAt: nowIso
        });
      } catch (e) {
        console.warn('Could not update ptRequest:', e);
      }
    }

    await setDoc(
      doc(db, 'clientProfiles', tx.clientId),
      sanitizeFirestorePayload({
        ptStatus: 'active',
        ...(trainerId ? { assignedTrainerId: trainerId } : {}),
        ...(trainerName ? { assignedTrainerName: trainerName } : {}),
        offlineRequestStatus: 'approved',
        pendingOfflineRequestId: '',
        offlineRejectionReason: ''
      }),
      { merge: true }
    );
  }
}

/**
 * METHOD A (ADMIN ACTION): Reject an Offline Cash Payment Request
 * Cancels the request and notifies the member on their screen.
 */
export async function rejectOfflinePaymentRequest(
  transactionId: string,
  reason = 'Cash payment could not be verified at the reception desk.'
): Promise<void> {
  const txRef = doc(db, 'paymentTransactions', transactionId);
  const txSnap = await getDoc(txRef);
  if (!txSnap.exists()) {
    throw new Error('Payment request not found');
  }

  const tx = { id: txSnap.id, ...txSnap.data() } as PaymentTransaction;
  const nowIso = new Date().toISOString();

  await updateDoc(txRef, {
    status: 'rejected',
    verificationStatus: 'REJECTED',
    rejectionReason: reason,
    rejectedAt: nowIso
  });

  if (tx.membershipId) {
    try {
      await updateDoc(doc(db, 'memberships', tx.membershipId), {
        status: 'rejected',
        rejectionReason: reason,
        rejectedAt: nowIso
      });
    } catch (e) {
      console.warn('Could not mark membership record as rejected:', e);
    }
  }

  try {
    await updateDoc(doc(db, 'clientProfiles', tx.clientId), {
      offlineRequestStatus: 'rejected',
      offlineRejectionReason: reason,
      offlineRejectedAt: nowIso,
      pendingOfflineRequestId: ''
    });
  } catch (e) {
    console.warn('Could not update clientProfile rejection notice:', e);
  }
}

/**
 * Load all transactions across all financial collections with de-duplication
 */
export async function getAllPaymentTransactions(): Promise<PaymentTransaction[]> {
  try {
    const collectionsToQuery = ['paymentTransactions', 'transactions', 'payments', 'invoices', 'billing_history'];
    const snaps = await Promise.allSettled(
      collectionsToQuery.map(colName => getDocs(collection(db, colName)))
    );

    const txMap = new Map<string, PaymentTransaction>();

    for (const res of snaps) {
      if (res.status === 'fulfilled' && res.value && !res.value.empty) {
        for (const docSnap of res.value.docs) {
          const data = { id: docSnap.id, ...docSnap.data() } as PaymentTransaction;
          if (data.id && !txMap.has(data.id)) {
            txMap.set(data.id, data);
          }
        }
      }
    }

    const list = Array.from(txMap.values());
    return list.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
      const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
      return timeB - timeA;
    });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    return [];
  }
}

/**
 * Load client transactions across all financial collections with de-duplication
 */
export async function getClientPaymentTransactions(clientId: string): Promise<PaymentTransaction[]> {
  if (!clientId) return [];
  try {
    const collectionsToQuery = ['paymentTransactions', 'transactions', 'payments', 'invoices', 'billing_history'];
    const snaps = await Promise.allSettled(
      collectionsToQuery.map(colName =>
        getDocs(query(collection(db, colName), where('clientId', '==', clientId)))
      )
    );

    const txMap = new Map<string, PaymentTransaction>();

    for (const res of snaps) {
      if (res.status === 'fulfilled' && res.value && !res.value.empty) {
        for (const docSnap of res.value.docs) {
          const data = { id: docSnap.id, ...docSnap.data() } as PaymentTransaction;
          if (data.id && !txMap.has(data.id)) {
            txMap.set(data.id, data);
          }
        }
      }
    }

    const list = Array.from(txMap.values());
    return list.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.timestamp || 0).getTime();
      const timeB = new Date(b.createdAt || b.timestamp || 0).getTime();
      return timeB - timeA;
    });
  } catch (err) {
    console.error('Error fetching client transactions:', err);
    return [];
  }
}

/**
 * Dynamically load official Razorpay standard checkout script
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn('Failed to load official Razorpay checkout script.');
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

/**
 * Dynamically load official PayU Bolt checkout script
 */
export function loadPayUBoltScript(environment: 'test' | 'live' = 'test'): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    if ((window as any).bolt) {
      resolve(true);
      return;
    }

    const existingScript = document.getElementById('payu-bolt-sdk');
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement('script');
    script.id = 'payu-bolt-sdk';
    script.src =
      environment === 'live'
        ? 'https://checkout-static.citruspay.com/bolt/run/bolt.min.js'
        : 'https://test.payu.in/bolt/bolt.min.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn('Failed to load official PayU Bolt checkout script.');
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

/**
 * Validate Razorpay API key format
 */
export function validateRazorpayKey(keyId?: string): {
  isValid: boolean;
  isTest: boolean;
  isLive: boolean;
  message: string;
} {
  if (!keyId || !keyId.trim()) {
    return {
      isValid: false,
      isTest: false,
      isLive: false,
      message: 'No Razorpay Key ID provided (Instant Gateway Checkout Mode Active)'
    };
  }

  const trimmed = keyId.trim();
  if (trimmed.startsWith('rzp_test_')) {
    return {
      isValid: true,
      isTest: true,
      isLive: false,
      message: 'Valid Razorpay Test Key ID'
    };
  } else if (trimmed.startsWith('rzp_live_')) {
    return {
      isValid: true,
      isTest: false,
      isLive: true,
      message: 'Valid Razorpay Production / Live Key ID'
    };
  } else {
    return {
      isValid: false,
      isTest: false,
      isLive: false,
      message: 'Key ID must start with "rzp_test_" or "rzp_live_"'
    };
  }
}

/**
 * Universal Gateway Credential Validator for Razorpay, Cashfree, PhonePe PG, and PayPal
 */
export function validateGatewayCredentials(gateway: PaymentGateway): {
  isConfigured: boolean;
  modeLabel: string;
  summary: string;
} {
  switch (gateway.provider) {
    case 'razorpay': {
      const hasKeys = Boolean(gateway.keyId?.trim() && gateway.keySecret?.trim());
      return {
        isConfigured: hasKeys,
        modeLabel: hasKeys
          ? gateway.keyId?.startsWith('rzp_live_')
            ? 'Live SDK Configured'
            : 'Test SDK Configured'
          : 'Universal Adapter Ready',
        summary: hasKeys
          ? `Key ID: ${gateway.keyId?.slice(0, 12)}...`
          : 'Ready (Add Key ID & Secret for live merchant binding)'
      };
    }
    case 'cashfree': {
      const hasKeys = Boolean(gateway.appId?.trim() && gateway.secretKey?.trim());
      return {
        isConfigured: hasKeys,
        modeLabel: hasKeys ? `${gateway.environment.toUpperCase()} API Configured` : 'Universal Adapter Ready',
        summary: hasKeys
          ? `App ID: ${gateway.appId?.slice(0, 10)}...`
          : 'Ready (Add App ID & Secret Key for live merchant binding)'
      };
    }
    case 'phonepe': {
      const hasKeys = Boolean(gateway.merchantId?.trim() && gateway.saltKey?.trim());
      return {
        isConfigured: hasKeys,
        modeLabel: hasKeys ? `Merchant ${gateway.merchantId}` : 'Universal Adapter Ready',
        summary: hasKeys
          ? `MID: ${gateway.merchantId} | Salt Index: ${gateway.saltIndex || '1'}`
          : 'Ready (Add Merchant ID, Salt Key & Salt Index)'
      };
    }
    case 'paypal': {
      const hasKeys = Boolean(gateway.clientId?.trim() && gateway.secretKey?.trim());
      return {
        isConfigured: hasKeys,
        modeLabel: hasKeys ? `${gateway.environment.toUpperCase()} REST Configured` : 'Universal Adapter Ready',
        summary: hasKeys
          ? `Client ID: ${gateway.clientId?.slice(0, 10)}...`
          : 'Ready (Add Client ID & Secret Key)'
      };
    }
    case 'gpay': {
      const hasMid = Boolean(gateway.gpayMerchantId?.trim() || gateway.merchantId?.trim());
      const hasKey = Boolean(gateway.gpayApiKey?.trim() || gateway.merchantName?.trim());
      const hasKeys = hasMid && hasKey;
      const isLive = gateway.environment === 'live';
      return {
        isConfigured: hasKeys,
        modeLabel: hasKeys ? `GPay ${isLive ? 'Production' : 'Sandbox'}` : 'Universal Adapter Ready',
        summary: hasKeys
          ? `MID: ${gateway.gpayMerchantId || gateway.merchantId} | ${isLive ? 'Production Live' : 'Sandbox Test'}`
          : 'Ready (Add Merchant ID (MID), Business Console API Key & Environment)'
      };
    }
    case 'paytm': {
      const hasMid = Boolean(gateway.paytmMid?.trim() || gateway.merchantId?.trim());
      const hasKey = Boolean(gateway.paytmMerchantKey?.trim());
      const hasKeys = hasMid && hasKey;
      return {
        isConfigured: hasKeys,
        modeLabel: hasKeys ? `Paytm ${gateway.paytmWebsite || 'DEFAULT'}` : 'Universal Adapter Ready',
        summary: hasKeys
          ? `MID: ${gateway.paytmMid || gateway.merchantId} | Website: ${gateway.paytmWebsite || 'DEFAULT'} | Channel: ${gateway.paytmChannelId || 'WEB'}`
          : 'Ready (Add Paytm MID, Merchant Key, Website & Channel ID)'
      };
    }
    case 'payu': {
      const hasKey = Boolean(gateway.payuMerchantKey?.trim() || gateway.keyId?.trim());
      const hasSalt = Boolean(gateway.payuMerchantSalt?.trim());
      const hasKeys = hasKey && hasSalt;
      return {
        isConfigured: hasKeys,
        modeLabel: hasKeys ? `PayU ${gateway.environment.toUpperCase()} Mode` : 'Universal Adapter Ready',
        summary: hasKeys
          ? `Merchant Key: ${(gateway.payuMerchantKey || gateway.keyId)?.slice(0, 8)}... | Salt SHA-512 Ready`
          : 'Ready (Add PayU Merchant Key, Merchant Salt & Environment)'
      };
    }
    default:
      return {
        isConfigured: true,
        modeLabel: 'Active',
        summary: gateway.name
      };
  }
}
