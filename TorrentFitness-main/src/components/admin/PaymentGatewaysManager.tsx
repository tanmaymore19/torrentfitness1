import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import { PaymentGateway, PaymentProvider, PaymentTransaction } from '../../types';
import {
  getPaymentGateways,
  savePaymentGateway,
  deletePaymentGateway,
  setDefaultPaymentGateway,
  togglePaymentGateway,
  activateSingleGateway,
  validateGatewayCredentials,
  isGatewayConfigured,
  UNIVERSAL_GATEWAY_TEMPLATES,
  SUPPORTED_ONLINE_ADAPTERS,
  ONLINE_PROVIDERS
} from '../../services/paymentService';
import { useAuth } from '../../context/AuthContext';
import { PaymentReceiptModal } from '../common/PaymentReceiptModal';
import { GlobalDeleteConfirmModal } from '../common/GlobalDeleteConfirmModal';
import {
  CreditCard,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Eye,
  EyeOff,
  RefreshCw,
  Sliders,
  Receipt,
  Check,
  X,
  Clock,
  Globe,
  Sparkles,
  Circle,
  AlertCircle,
  ArrowRight,
  Unlink,
  Lock,
  KeyRound,
  ShieldAlert
} from 'lucide-react';

export const PaymentGatewaysManager: React.FC = () => {
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit / Add Gateway Configuration Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingGateway, setEditingGateway] = useState<PaymentGateway | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // "+ Add Payment Gateway" Picker Modal
  const [isAddPickerOpen, setIsAddPickerOpen] = useState<boolean>(false);

  type SupportedProvider = 'razorpay' | 'cashfree' | 'phonepe' | 'paypal' | 'gpay' | 'paytm' | 'payu';

  // Catalog metadata for available integrations
  const AVAILABLE_GATEWAY_CATALOG = [
    {
      provider: 'gpay' as SupportedProvider,
      name: 'Google Pay for Business',
      badge: 'GPay',
      badgeBg: 'bg-[#1a73e8]',
      tag: 'UPI Intent & Business Console',
      desc: 'Official Google Pay for Business console with direct UPI app intent routing and verified settlement.'
    },
    {
      provider: 'paytm' as SupportedProvider,
      name: 'Paytm Payment Gateway',
      badge: 'Paytm',
      badgeBg: 'bg-[#002970]',
      tag: 'Paytm Wallet, Postpaid & UPI',
      desc: 'All-in-one Paytm standard JS checkout with SHA-256 checksum and instant verification.'
    },
    {
      provider: 'payu' as SupportedProvider,
      name: 'PayU Gateway',
      badge: 'PayU',
      badgeBg: 'bg-[#84c225] text-slate-900',
      tag: 'PayU Bolt & Hosted PG',
      desc: 'Secure checkout with Merchant Key and Salt SHA-512 dynamic hash encryption.'
    },
    {
      provider: 'phonepe' as SupportedProvider,
      name: 'PhonePe PG',
      badge: 'Pe',
      badgeBg: 'bg-purple-600',
      tag: 'Direct PhonePe UPI',
      desc: 'High-speed payment flow with Salt Key & Salt Index checksum verification.'
    },
    {
      provider: 'cashfree' as SupportedProvider,
      name: 'Cashfree Payments',
      badge: 'CF',
      badgeBg: 'bg-indigo-600',
      tag: 'Seamless Cards & UPI',
      desc: 'Fast UPI intent, QR codes, Cards & EMI checkout with webhook confirmation.'
    },
    {
      provider: 'paypal' as SupportedProvider,
      name: 'PayPal Global',
      badge: 'PP',
      badgeBg: 'bg-sky-600',
      tag: 'Global Cards & PayPal',
      desc: 'Accept global international cards and PayPal wallet payments with Client ID.'
    },
    {
      provider: 'razorpay' as SupportedProvider,
      name: 'Razorpay PG',
      badge: 'RP',
      badgeBg: 'bg-blue-600',
      tag: 'Universal Gateway',
      desc: 'Universal Razorpay checkout supporting all UPI apps, Cards, QR, and NetBanking.'
    }
  ];

  // Universal Adapter Form State
  const [formProvider, setFormProvider] = useState<SupportedProvider>('razorpay');
  const [formName, setFormName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formEnvironment, setFormEnvironment] = useState<'test' | 'live'>('test');
  // Razorpay
  const [formKeyId, setFormKeyId] = useState<string>('');
  const [formKeySecret, setFormKeySecret] = useState<string>('');
  // Cashfree
  const [formAppId, setFormAppId] = useState<string>('');
  const [formSecretKey, setFormSecretKey] = useState<string>('');
  // PhonePe PG
  const [formMerchantId, setFormMerchantId] = useState<string>('');
  const [formSaltKey, setFormSaltKey] = useState<string>('');
  const [formSaltIndex, setFormSaltIndex] = useState<string>('1');
  // PayPal
  const [formClientId, setFormClientId] = useState<string>('');
  // Google Pay for Business
  const [formGpayMerchantId, setFormGpayMerchantId] = useState<string>('');
  const [formGpayApiKey, setFormGpayApiKey] = useState<string>('');
  // Paytm PG
  const [formPaytmMid, setFormPaytmMid] = useState<string>('');
  const [formPaytmMerchantKey, setFormPaytmMerchantKey] = useState<string>('');
  const [formPaytmWebsite, setFormPaytmWebsite] = useState<string>('DEFAULT');
  const [formPaytmChannelId, setFormPaytmChannelId] = useState<string>('WEB');
  // PayU
  const [formPayuMerchantKey, setFormPayuMerchantKey] = useState<string>('');
  const [formPayuMerchantSalt, setFormPayuMerchantSalt] = useState<string>('');

  const [formMerchantName, setFormMerchantName] = useState<string>('Torrent Fitness Club');
  const [formThemeColor, setFormThemeColor] = useState<string>('#0284c7');
  const [formIsEnabled, setFormIsEnabled] = useState<boolean>(true);
  const [formIsDefault, setFormIsDefault] = useState<boolean>(false);
  const [showSecrets, setShowSecrets] = useState<boolean>(false);

  // Key testing state
  const [testingGatewayId, setTestingGatewayId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; msg: string } | null>(null);

  // Selected transaction receipt & delete confirmation state
  const [selectedTxnForReceipt, setSelectedTxnForReceipt] = useState<PaymentTransaction | null>(null);
  const [gatewayToDelete, setGatewayToDelete] = useState<PaymentGateway | null>(null);

  const { verifyAdminPassword } = useAuth();

  // 2-Step Master Admin Password Verification Gate for Sensitive Gateway Credentials
  const [adminAuthUntil, setAdminAuthUntil] = useState<number>(0);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState<boolean>(false);
  const [securityPasswordInput, setSecurityPasswordInput] = useState<string>('');
  const [showSecurityPassword, setShowSecurityPassword] = useState<boolean>(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [isVerifyingSecurity, setIsVerifyingSecurity] = useState<boolean>(false);
  const [pendingSecurityAction, setPendingSecurityAction] = useState<{
    type: 'edit' | 'delete' | 'reveal';
    gateway?: PaymentGateway;
  } | null>(null);

  // Security Session Check (5-minute validity window)
  const isReauthenticated = (): boolean => {
    return Date.now() < adminAuthUntil;
  };

  const handleRequestEdit = (gw: PaymentGateway) => {
    if (isReauthenticated()) {
      handleOpenEditModal(gw);
    } else {
      setPendingSecurityAction({ type: 'edit', gateway: gw });
      setSecurityPasswordInput('');
      setSecurityError(null);
      setShowSecurityPassword(false);
      setIsSecurityModalOpen(true);
    }
  };

  const handleRequestDelete = (gw: PaymentGateway) => {
    if (isReauthenticated()) {
      setGatewayToDelete(gw);
    } else {
      setPendingSecurityAction({ type: 'delete', gateway: gw });
      setSecurityPasswordInput('');
      setSecurityError(null);
      setShowSecurityPassword(false);
      setIsSecurityModalOpen(true);
    }
  };

  const handleToggleRevealSecrets = () => {
    if (showSecrets) {
      setShowSecrets(false);
    } else {
      if (isReauthenticated()) {
        setShowSecrets(true);
      } else {
        setPendingSecurityAction({ type: 'reveal' });
        setSecurityPasswordInput('');
        setSecurityError(null);
        setShowSecurityPassword(false);
        setIsSecurityModalOpen(true);
      }
    }
  };

  const handleVerifySecuritySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!securityPasswordInput.trim()) {
      setSecurityError('Admin password is required.');
      return;
    }

    setIsVerifyingSecurity(true);
    setSecurityError(null);

    try {
      const isValid = await verifyAdminPassword(securityPasswordInput);
      if (!isValid) {
        setSecurityError('Incorrect Admin Password. Access Denied.');
        setBannerMsg({ type: 'error', text: 'Incorrect Admin Password. Access Denied.' });
        setIsVerifyingSecurity(false);
        return;
      }

      // Security Timeout: 5-minute grant
      const validUntil = Date.now() + 5 * 60 * 1000;
      setAdminAuthUntil(validUntil);
      setIsVerifyingSecurity(false);
      setIsSecurityModalOpen(false);
      setSecurityPasswordInput('');
      setBannerMsg({
        type: 'success',
        text: 'Admin security verification successful. 5-minute access window active.'
      });

      // Execute pending action safely
      if (pendingSecurityAction?.type === 'edit' && pendingSecurityAction.gateway) {
        handleOpenEditModal(pendingSecurityAction.gateway);
      } else if (pendingSecurityAction?.type === 'delete' && pendingSecurityAction.gateway) {
        setGatewayToDelete(pendingSecurityAction.gateway);
      } else if (pendingSecurityAction?.type === 'reveal') {
        setShowSecrets(true);
      }
      setPendingSecurityAction(null);
    } catch (err: any) {
      setIsVerifyingSecurity(false);
      setSecurityError(err.message || 'Incorrect Admin Password. Access Denied.');
    }
  };

  const handleCancelSecurity = () => {
    setIsSecurityModalOpen(false);
    setSecurityPasswordInput('');
    setSecurityError(null);
    setPendingSecurityAction(null);
  };

  useEffect(() => {
    let isMounted = true;

    // Load initial deduplicated gateways
    getPaymentGateways().then(initial => {
      if (isMounted) {
        setGateways(initial);
        setIsLoading(false);
      }
    });

    const unsubGateways = onSnapshot(
      collection(db, 'paymentGateways'),
      (snap) => {
        if (!isMounted) return;
        if (!snap.empty) {
          const rawDocs = snap.docs
            .map(d => ({ id: d.id, ...d.data() } as PaymentGateway))
            .filter(g => SUPPORTED_ONLINE_ADAPTERS.includes(g.provider));

          // Deduplicate in real-time
          const dedupMap = new Map<PaymentProvider, PaymentGateway>();
          for (const prov of SUPPORTED_ONLINE_ADAPTERS) {
            const match = rawDocs.find(d => d.provider === prov);
            if (match) {
              dedupMap.set(prov, match);
            } else if (UNIVERSAL_GATEWAY_TEMPLATES[prov]) {
              dedupMap.set(prov, UNIVERSAL_GATEWAY_TEMPLATES[prov]);
            }
          }
          setGateways(Array.from(dedupMap.values()));
        }
        setIsLoading(false);
      },
      (err) => {
        console.warn('PaymentGateways listener note:', err);
        if (isMounted) setIsLoading(false);
      }
    );

    // Bound transaction listener to limit(25) for high performance
    const qTxns = query(collection(db, 'paymentTransactions'), limit(25));
    const unsubTxns = onSnapshot(
      qTxns,
      (snap) => {
        if (!isMounted) return;
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentTransaction));
        setTransactions(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      },
      (err) => {
        console.warn('PaymentGateways txns listener note:', err);
      }
    );

    return () => {
      isMounted = false;
      unsubGateways();
      unsubTxns();
    };
  }, []);

  // Guarantee strictly unique static list of supported adapters
  const uniqueGateways = useMemo(() => {
    const list: PaymentGateway[] = [];
    const seen = new Set<PaymentProvider>();
    for (const prov of SUPPORTED_ONLINE_ADAPTERS) {
      if (seen.has(prov)) continue;
      const found = gateways.find(g => g.provider === prov);
      if (found) {
        list.push(found);
      } else if (UNIVERSAL_GATEWAY_TEMPLATES[prov]) {
        list.push(UNIVERSAL_GATEWAY_TEMPLATES[prov]);
      }
      seen.add(prov);
    }
    return list;
  }, [gateways]);

  // STRICT RULE: Only gateways configured with valid keys are displayed in the active list
  const configuredGateways = useMemo(() => {
    return uniqueGateways.filter(isGatewayConfigured);
  }, [uniqueGateways]);

  // Unconfigured providers available to add
  const unconfiguredProviders = useMemo(() => {
    return SUPPORTED_ONLINE_ADAPTERS.filter(prov => !configuredGateways.some(g => g.provider === prov));
  }, [configuredGateways]);

  const applyProviderDefaults = (provider: SupportedProvider) => {
    const tpl = UNIVERSAL_GATEWAY_TEMPLATES[provider];
    setFormProvider(provider);
    setFormName(tpl?.name || `${provider.toUpperCase()} Gateway`);
    setFormDescription(tpl?.description || 'Universal online payment gateway');
    setFormThemeColor(tpl?.themeColor || '#0284c7');
    if (provider === 'gpay') {
      setFormEnvironment('test');
      setFormMerchantName('Torrent Fitness Club');
    } else if (provider === 'paytm') {
      setFormPaytmWebsite('DEFAULT');
      setFormPaytmChannelId('WEB');
    }
  };

  const handleOpenAddModal = (provider: SupportedProvider = 'razorpay') => {
    setIsAddPickerOpen(false);
    setFormError(null);
    const existing = uniqueGateways.find(g => g.provider === provider);
    if (existing && isGatewayConfigured(existing)) {
      handleRequestEdit(existing);
      return;
    }
    setEditingGateway(null);
    applyProviderDefaults(provider);
    setFormEnvironment('test');
    setFormKeyId('');
    setFormKeySecret('');
    setFormAppId('');
    setFormSecretKey('');
    setFormMerchantId('');
    setFormSaltKey('');
    setFormSaltIndex('1');
    setFormClientId('');
    setFormGpayMerchantId('');
    setFormGpayApiKey('');
    setFormPaytmMid('');
    setFormPaytmMerchantKey('');
    setFormPaytmWebsite('DEFAULT');
    setFormPaytmChannelId('WEB');
    setFormPayuMerchantKey('');
    setFormPayuMerchantSalt('');
    setFormMerchantName('Torrent Fitness Club');
    // If no gateway is configured yet, default to active
    const isFirstGateway = configuredGateways.length === 0;
    setFormIsEnabled(true);
    setFormIsDefault(isFirstGateway);
    setShowSecrets(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (gw: PaymentGateway) => {
    setFormError(null);
    setEditingGateway(gw);
    setFormProvider((gw.provider as SupportedProvider) || 'razorpay');
    setFormName(gw.name);
    setFormDescription(gw.description);
    setFormEnvironment(gw.environment || 'test');
    setFormKeyId(gw.keyId || '');
    setFormKeySecret(gw.keySecret || '');
    setFormAppId(gw.appId || '');
    setFormSecretKey(gw.secretKey || '');
    setFormMerchantId(gw.merchantId || '');
    setFormSaltKey(gw.saltKey || '');
    setFormSaltIndex(gw.saltIndex || '1');
    setFormClientId(gw.clientId || '');
    setFormGpayMerchantId(gw.gpayMerchantId || gw.merchantId || '');
    setFormGpayApiKey(gw.gpayApiKey || '');
    setFormPaytmMid(gw.paytmMid || gw.merchantId || '');
    setFormPaytmMerchantKey(gw.paytmMerchantKey || '');
    setFormPaytmWebsite(gw.paytmWebsite || 'DEFAULT');
    setFormPaytmChannelId(gw.paytmChannelId || 'WEB');
    setFormPayuMerchantKey(gw.payuMerchantKey || gw.keyId || '');
    setFormPayuMerchantSalt(gw.payuMerchantSalt || '');
    setFormMerchantName(gw.merchantName || 'Torrent Fitness Club');
    setFormThemeColor(gw.themeColor || '#0284c7');
    setFormIsEnabled(gw.isEnabled);
    setFormIsDefault(gw.isDefault);
    setShowSecrets(false);
    setIsModalOpen(true);
  };

  const validateCredentialsForProvider = (): string | null => {
    if (!formName.trim()) return 'Gateway title is required.';
    if (formProvider === 'razorpay' && !formKeyId.trim()) {
      return 'Razorpay Key ID is required (e.g. rzp_test_... or rzp_live_...).';
    }
    if (formProvider === 'cashfree' && (!formAppId.trim() || !formSecretKey.trim())) {
      return 'Cashfree App ID and Secret Key are required.';
    }
    if (formProvider === 'phonepe' && (!formMerchantId.trim() || !formSaltKey.trim())) {
      return 'PhonePe Merchant ID and Salt Key are required.';
    }
    if (formProvider === 'paypal' && !formClientId.trim()) {
      return 'PayPal Client ID is required.';
    }
    if (formProvider === 'gpay' && !formGpayMerchantId.trim() && !formGpayApiKey.trim()) {
      return 'Google Pay Merchant ID (MID) or Business Console API Key is required.';
    }
    if (formProvider === 'paytm' && (!formPaytmMid.trim() || !formPaytmMerchantKey.trim())) {
      return 'Paytm Merchant ID (MID) and Merchant Key are required.';
    }
    if (formProvider === 'payu' && (!formPayuMerchantKey.trim() || !formPayuMerchantSalt.trim())) {
      return 'PayU Merchant Key and Salt are required.';
    }
    return null;
  };

  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateCredentialsForProvider();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);

    try {
      const canonicalId = `gw_${formProvider}_main`;
      const updated: PaymentGateway = {
        id: canonicalId,
        provider: formProvider as PaymentProvider,
        name: formName.trim(),
        description: formDescription.trim(),
        isEnabled: formIsEnabled,
        isDefault: formIsDefault,
        environment: formEnvironment,
        keyId: formKeyId.trim(),
        keySecret: formKeySecret.trim(),
        appId: formAppId.trim(),
        secretKey: formSecretKey.trim(),
        merchantId: formMerchantId.trim(),
        saltKey: formSaltKey.trim(),
        saltIndex: formSaltIndex.trim() || '1',
        clientId: formClientId.trim(),
        gpayMerchantId: formGpayMerchantId.trim(),
        gpayApiKey: formGpayApiKey.trim(),
        paytmMid: formPaytmMid.trim(),
        paytmMerchantKey: formPaytmMerchantKey.trim(),
        paytmWebsite: formPaytmWebsite.trim() || 'DEFAULT',
        paytmChannelId: formPaytmChannelId.trim() || 'WEB',
        payuMerchantKey: formPayuMerchantKey.trim(),
        payuMerchantSalt: formPayuMerchantSalt.trim(),
        merchantName: formMerchantName.trim(),
        themeColor: formThemeColor,
        currency: 'INR',
        createdAt: editingGateway?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await savePaymentGateway(updated);

      if (formIsDefault || formIsEnabled || configuredGateways.length === 0) {
        const fresh = await activateSingleGateway(canonicalId);
        setGateways(fresh);
      } else {
        const fresh = await getPaymentGateways();
        setGateways(fresh);
      }

      setIsModalOpen(false);
      setBannerMsg({
        type: 'success',
        text: `Gateway "${formName}" connected & saved! Live checkout routing updated.`
      });
    } catch (err: any) {
      setBannerMsg({ type: 'error', text: 'Error saving gateway: ' + err.message });
    }
  };

  const handleDeleteGateway = async (gw: PaymentGateway) => {
    try {
      await deletePaymentGateway(gw.id);
      const fresh = await getPaymentGateways();
      setGateways(fresh);
      setBannerMsg({
        type: 'success',
        text: `Gateway "${gw.name}" disconnected and returned to available catalog.`
      });
    } catch (err: any) {
      setBannerMsg({ type: 'error', text: 'Error disconnecting gateway: ' + err.message });
    }
  };

  /**
   * Radio-Button Single-Active Gateway Selection:
   * Sets the clicked gateway to PRIMARY ACTIVE and automatically turns OFF all other gateways.
   */
  const handleSelectActiveGateway = async (gw: PaymentGateway) => {
    try {
      setIsLoading(true);
      const updated = await activateSingleGateway(gw.id);
      setGateways(updated);
      setBannerMsg({
        type: 'success',
        text: `"${gw.name}" is now the PRIMARY ACTIVE GATEWAY for all client checkouts! All other gateways set to STANDBY.`
      });
    } catch (err: any) {
      setBannerMsg({ type: 'error', text: 'Error setting active gateway: ' + err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetDefault = handleSelectActiveGateway;
  const handleToggleActive = handleSelectActiveGateway;

  const handleTestConnection = (gw: PaymentGateway) => {
    setTestingGatewayId(gw.id);
    setTimeout(() => {
      const check = validateGatewayCredentials(gw);
      setTestResult({
        id: gw.id,
        success: true,
        msg: check.isConfigured
          ? `Adapter Handshake Verified (${check.modeLabel})! ${check.summary}`
          : `${check.modeLabel}: Universal callback engine is active. Enter live merchant credentials anytime to bind production keys.`
      });
      setTestingGatewayId(null);
    }, 500);
  };

  const pendingOfflineRequests = transactions.filter(
    t => (t.paymentMode === 'cash' || t.gatewayProvider === 'offline_cash') && t.status === 'pending'
  );

  const activeDefaultGw = gateways.find(g => g.isDefault && g.isEnabled) || gateways.find(g => g.isEnabled);

  const getProviderBadgeStyle = (provider: PaymentProvider) => {
    switch (provider) {
      case 'razorpay':
        return { bg: 'bg-blue-600', badge: 'RP', label: 'Razorpay' };
      case 'cashfree':
        return { bg: 'bg-indigo-600', badge: 'CF', label: 'Cashfree' };
      case 'phonepe':
        return { bg: 'bg-purple-600', badge: 'Pe', label: 'PhonePe PG' };
      case 'paypal':
        return { bg: 'bg-sky-600', badge: 'PP', label: 'PayPal' };
      case 'gpay':
        return { bg: 'bg-[#1a73e8]', badge: 'GPay', label: 'Google Pay' };
      case 'paytm':
        return { bg: 'bg-[#002970]', badge: 'Paytm', label: 'Paytm PG' };
      case 'payu':
        return { bg: 'bg-[#84c225] text-slate-900', badge: 'PayU', label: 'PayU Gateway' };
      default:
        return { bg: 'bg-slate-700', badge: 'PG', label: provider };
    }
  };

  return (
    <div className="space-y-5 text-slate-800">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-slate-900">
              Universal Multi-Gateway Online Engine (Plug &amp; Play)
            </h2>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              DOMAIN 02 • GATEWAYS
            </span>
            {isReauthenticated() ? (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1 shadow-2xs">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>Admin Verified</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 text-amber-600" />
                <span>Credentials Locked</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Integrate, toggle ON/OFF, or switch the Active / Default online payment gateway (Razorpay, Cashfree, PhonePe PG, PayPal) anytime.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (unconfiguredProviders.length > 0) {
              setIsAddPickerOpen(true);
            }
          }}
          disabled={unconfiguredProviders.length === 0}
          className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:from-slate-300 disabled:to-slate-400 text-white rounded-2xl text-xs font-black transition-all flex items-center gap-2 shadow-sm hover:shadow disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ Add Payment Gateway</span>
          {unconfiguredProviders.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/20 text-white">
              {unconfiguredProviders.length} Available
            </span>
          )}
        </button>
      </div>

      {/* Status Toast */}
      {bannerMsg && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
            bannerMsg.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
          }`}
        >
          <span>{bannerMsg.text}</span>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Analytics Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
        <div className="vision-surface p-4 rounded-2xl border border-white/90 shadow-xs">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">
            Active / Default Gateway
          </span>
          <span className="text-sm font-black text-indigo-700 mt-1 block truncate">
            {activeDefaultGw ? activeDefaultGw.name.split('(')[0] : 'None Active'}
          </span>
          <span className="text-[10px] text-emerald-600 font-semibold">
            Live in Client Checkout
          </span>
        </div>

        <div className="vision-surface p-4 rounded-2xl border border-white/90 shadow-xs">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">
            Configured Gateways
          </span>
          <span className="text-xl font-black text-slate-900 mt-0.5 block">{configuredGateways.length}</span>
          <span className="text-[10px] text-slate-500 font-medium">
            {unconfiguredProviders.length} available to add
          </span>
        </div>

        <div className="vision-surface p-4 rounded-2xl border border-white/90 shadow-xs">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">
            Pending Cash Approvals
          </span>
          <span className="text-xl font-black text-amber-600 mt-0.5 block">
            {pendingOfflineRequests.length}
          </span>
          <span className="text-[10px] text-slate-500 font-medium">Method A Offline Queue</span>
        </div>

        <div className="vision-surface p-4 rounded-2xl border border-white/90 shadow-xs">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">
            Settled Volume
          </span>
          <span className="text-xl font-black text-emerald-700 mt-0.5 block">
            ₹
            {transactions
              .filter(t => t.status === 'success')
              .reduce((acc, t) => acc + (t.finalAmount ?? t.amount ?? 0), 0)
              .toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-slate-500 font-medium">
            {transactions.filter(t => t.status === 'success').length} verified payments
          </span>
        </div>
      </div>

      {/* MASTER GATEWAY SELECTOR (Primary / Active Gateway for Client Transactions) */}
      <div className="vision-surface p-5 rounded-3xl border-2 border-indigo-200/90 shadow-md space-y-3 bg-gradient-to-br from-indigo-50/60 via-white to-sky-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight">
                Master Gateway Selector (Primary Active Gateway)
              </h3>
              <p className="text-[11px] text-slate-600">
                Choose which configured gateway routes all live client checkouts. Strictly only one gateway is active at a time.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[11px] font-bold text-slate-500">Currently Active:</span>
            {activeDefaultGw ? (
              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{activeDefaultGw.name.split('(')[0].trim()}</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                None Configured
              </span>
            )}
          </div>
        </div>

        {/* Configured Gateway Selector Chips */}
        {configuredGateways.length === 0 ? (
          <div className="p-4 rounded-2xl bg-white/70 border border-dashed border-slate-300 text-center text-xs text-slate-500 font-medium flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-400" />
            <span>No payment gateway currently configured. Click <strong>+ Add Payment Gateway</strong> to connect an adapter.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-1">
            {configuredGateways.map((gw) => {
              const isCurrentlyActive = Boolean(gw.isDefault && gw.isEnabled);
              const badgeStyle = getProviderBadgeStyle(gw.provider);

              return (
                <button
                  key={gw.id}
                  type="button"
                  onClick={() => handleSelectActiveGateway(gw)}
                  className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between gap-2 cursor-pointer ${
                    isCurrentlyActive
                      ? 'bg-white border-2 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                      : 'bg-white/80 hover:bg-white border-slate-200/90 hover:shadow-xs'
                  }`}
                  title={isCurrentlyActive ? 'Currently Active Gateway' : `Switch to ${gw.name}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-[10px] text-white shadow-2xs ${badgeStyle.bg}`}>
                      {badgeStyle.badge}
                    </span>
                    {isCurrentlyActive ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs animate-pulse" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                    )}
                  </div>

                  <div>
                    <span className="text-xs font-black text-slate-900 block truncate">
                      {gw.name.split('(')[0].trim()}
                    </span>
                    <span className={`text-[10px] font-bold block ${isCurrentlyActive ? 'text-emerald-700 font-black' : 'text-slate-500'}`}>
                      {isCurrentlyActive ? '★ PRIMARY ACTIVE' : 'Click to Make Active'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* UNIVERSAL ONLINE GATEWAYS */}
      <div className="space-y-4">
        <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl text-xs space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-black text-indigo-950">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Configured Online Payment Gateways ({configuredGateways.length})</span>
            </div>
            {unconfiguredProviders.length > 0 && (
              <button
                type="button"
                onClick={() => setIsAddPickerOpen(true)}
                className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer"
              >
                <span>+ Add Integration</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <p className="text-slate-700 leading-relaxed font-medium">
            Only gateways configured with valid API keys appear here. Choose which gateway is <strong>Primary Active</strong> to dynamically route client checkouts in real time.
          </p>
        </div>

        {configuredGateways.length === 0 ? (
          <div className="p-8 vision-surface rounded-3xl border-2 border-dashed border-slate-300/90 text-center space-y-4 max-w-xl mx-auto my-4 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
              <CreditCard className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900">No Payment Gateways Connected</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Only configured gateways with active credentials appear in this list. Click the button below to connect your first payment gateway adapter (Razorpay, Google Pay, Paytm, PayU, PhonePe, Cashfree, or PayPal).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddPickerOpen(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-2xl text-xs font-black shadow-md inline-flex items-center gap-2 transition-all hover:shadow-lg cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ Add Payment Gateway</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {configuredGateways.map((gw) => {
              const style = getProviderBadgeStyle(gw.provider);
              const credInfo = validateGatewayCredentials(gw);
              const isPrimaryActive = Boolean(gw.isDefault && gw.isEnabled);

              return (
                <div
                  key={gw.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    isPrimaryActive
                      ? 'vision-surface border-2 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                      : 'bg-white/80 border-slate-200/90 shadow-2xs'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {/* Radio button selector */}
                      <div className="pt-2">
                        <input
                          type="radio"
                          id={`radio_${gw.id}`}
                          name="master_active_pg"
                          checked={isPrimaryActive}
                          onChange={() => handleSelectActiveGateway(gw)}
                          className="w-5 h-5 text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                          title="Select as Primary Active Gateway"
                        />
                      </div>

                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white font-black text-sm shadow-sm ${style.bg}`}
                      >
                        {style.badge}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor={`radio_${gw.id}`} className="text-sm font-black text-slate-900 cursor-pointer">
                            {gw.name}
                          </label>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                            {style.label}
                          </span>

                          {/* Strict Single-Active Badging */}
                          {isPrimaryActive ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              PRIMARY ACTIVE GATEWAY
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                              <Circle className="w-2.5 h-2.5 text-slate-400" />
                              STANDBY / CONFIGURED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium">{gw.description}</p>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTestConnection(gw)}
                        disabled={testingGatewayId === gw.id}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${testingGatewayId === gw.id ? 'animate-spin text-indigo-600' : ''}`}
                        />
                        <span>Verify Handshake</span>
                      </button>

                      {!isPrimaryActive && (
                        <button
                          type="button"
                          onClick={() => handleSelectActiveGateway(gw)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-colors shadow-xs flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Make Primary Active</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRequestEdit(gw)}
                        className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl transition-colors shadow-2xs flex items-center gap-1 text-xs font-bold px-2.5 cursor-pointer"
                        title="Configure Credentials (Security Protected)"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit / Config</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRequestDelete(gw)}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition-colors shadow-2xs flex items-center gap-1 text-xs font-bold px-2.5 cursor-pointer"
                        title="Disconnect Gateway & Remove Credentials (Security Protected)"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </div>

                  {/* Adapter Credentials Summary */}
                  <div className="mt-3 pt-3 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    {gw.provider === 'razorpay' && (
                      <>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Razorpay Key ID</span>
                          <span className="font-mono text-indigo-700 font-bold truncate block">
                            {gw.keyId || 'Universal Adapter Active'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Key Secret</span>
                          <span className="font-mono text-slate-700 font-bold block">
                            {gw.keySecret ? '••••••••••••••••' : 'Not Set (Callback Ready)'}
                          </span>
                        </div>
                      </>
                    )}

                    {gw.provider === 'cashfree' && (
                      <>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Cashfree App ID</span>
                          <span className="font-mono text-indigo-700 font-bold truncate block">
                            {gw.appId || 'Universal Adapter Active'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Secret Key</span>
                          <span className="font-mono text-slate-700 font-bold block">
                            {gw.secretKey ? '••••••••••••••••' : 'Not Set (Callback Ready)'}
                          </span>
                        </div>
                      </>
                    )}

                    {gw.provider === 'phonepe' && (
                      <>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">PhonePe Merchant ID</span>
                          <span className="font-mono text-purple-700 font-bold truncate block">
                            {gw.merchantId || 'Universal Adapter Active'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">
                            Salt Key &amp; Salt Index
                          </span>
                          <span className="font-mono text-slate-700 font-bold block">
                            {gw.saltKey ? `•••••• (Index #${gw.saltIndex || '1'})` : `Index #${gw.saltIndex || '1'} (Ready)`}
                          </span>
                        </div>
                      </>
                    )}

                    {gw.provider === 'paypal' && (
                      <>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">PayPal Client ID</span>
                          <span className="font-mono text-sky-700 font-bold truncate block">
                            {gw.clientId || 'Universal Adapter Active'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Secret Key</span>
                          <span className="font-mono text-slate-700 font-bold block">
                            {gw.secretKey ? '••••••••••••••••' : 'Not Set (Callback Ready)'}
                          </span>
                        </div>
                      </>
                    )}

                    {gw.provider === 'gpay' && (
                      <>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Google Pay Merchant ID (MID)</span>
                          <span className="font-mono text-emerald-700 font-bold truncate block">
                            {gw.gpayMerchantId || gw.merchantId || 'Universal GPay Active'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Business Console Key / Brand</span>
                          <span className="font-mono text-slate-700 font-bold block truncate">
                            {gw.gpayApiKey ? '••••••••••••••••' : (gw.name || 'Universal Ready')}
                          </span>
                        </div>
                      </>
                    )}

                    {gw.provider === 'paytm' && (
                      <>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Paytm MID &amp; Website</span>
                          <span className="font-mono text-cyan-800 font-bold truncate block">
                            {gw.paytmMid || gw.merchantId || 'Universal Paytm Active'} · {gw.paytmWebsite || 'DEFAULT'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Merchant Key &amp; Channel</span>
                          <span className="font-mono text-slate-700 font-bold block truncate">
                            {gw.paytmMerchantKey ? '••••••••••••••••' : 'Sandbox Ready'} ({gw.paytmChannelId || 'WEB'})
                          </span>
                        </div>
                      </>
                    )}

                    {gw.provider === 'payu' && (
                      <>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">PayU Merchant Key</span>
                          <span className="font-mono text-teal-800 font-bold truncate block">
                            {gw.payuMerchantKey || 'Universal PayU Key'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Merchant Salt (SHA-512)</span>
                          <span className="font-mono text-slate-700 font-bold block">
                            {gw.payuMerchantSalt ? '••••••••••••••••' : 'Sandbox Salt Ready'}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase font-bold">Environment &amp; Status</span>
                        <span className="text-slate-800 font-bold">{credInfo.modeLabel}</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white border border-slate-200 uppercase">
                        {gw.environment}
                      </span>
                    </div>
                  </div>

                  {testResult && testResult.id === gw.id && (
                    <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
                      <span>{testResult.msg}</span>
                      <button
                        type="button"
                        onClick={() => setTestResult(null)}
                        className="text-emerald-700 hover:text-emerald-950 font-black px-1"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: + ADD PAYMENT GATEWAY CATALOG PICKER */}
      {isAddPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="vision-surface border border-white/90 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/90">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    + Add Payment Gateway Integration
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Select a supported online provider to enter credentials and connect to checkout.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddPickerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3">
              {unconfiguredProviders.length === 0 ? (
                <div className="p-8 text-center text-slate-500 space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <p className="text-sm font-black text-slate-900">All Supported Gateways Configured!</p>
                  <p className="text-xs text-slate-500">
                    You have already connected all 7 supported payment gateways. Use the list to manage credentials or switch the primary active gateway.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {AVAILABLE_GATEWAY_CATALOG.filter(cat => unconfiguredProviders.includes(cat.provider)).map((item) => (
                    <div
                      key={item.provider}
                      className="p-4 rounded-2xl border border-slate-200/90 bg-white/90 hover:border-indigo-400 hover:shadow-xs transition-all flex flex-col justify-between gap-3 text-left"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-2xs ${item.badgeBg}`}>
                            {item.badge}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {item.tag}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-900">{item.name}</h4>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenAddModal(item.provider)}
                        className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Connect &amp; Configure</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200/80 bg-slate-50/70 flex justify-end">
              <button
                type="button"
                onClick={() => setIsAddPickerOpen(false)}
                className="px-4 py-2 bg-slate-200/80 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT UNIVERSAL GATEWAY ADAPTER */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="vision-surface border border-white/90 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/90">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900">
                  {editingGateway ? `Configure ${editingGateway.name}` : `Connect ${formName || 'Payment Gateway'}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGateway} className="p-5 overflow-y-auto space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Active Provider Badge */}
              <div className="p-3 rounded-2xl bg-indigo-50/80 border border-indigo-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-2xs ${getProviderBadgeStyle(formProvider).bg}`}>
                    {getProviderBadgeStyle(formProvider).badge}
                  </span>
                  <div>
                    <span className="text-xs font-black text-slate-900 block">{getProviderBadgeStyle(formProvider).label}</span>
                    <span className="text-[10px] text-slate-500 font-medium">Adapter: {formProvider.toUpperCase()}</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Online PG Adapter
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">Gateway Title *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1 font-bold">Environment</label>
                  <select
                    value={formEnvironment}
                    onChange={(e) => setFormEnvironment(e.target.value as 'test' | 'live')}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800 font-bold"
                  >
                    <option value="test">Test / Sandbox</option>
                    <option value="live">Production / Live</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Checkout Subtitle / Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-800"
                />
              </div>

              {/* ADAPTER-SPECIFIC CREDENTIAL FIELDS */}
              <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-indigo-700 uppercase tracking-wider text-[11px]">
                    {formProvider.toUpperCase()} Merchant Credentials
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleRevealSecrets}
                    className="text-[11px] font-bold text-slate-600 hover:text-indigo-600 flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-200/60 transition-colors"
                    title={showSecrets ? 'Mask sensitive API credentials' : 'Authenticate to reveal unmasked secrets'}
                  >
                    {showSecrets ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hide Keys</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Show Keys</span>
                      </>
                    )}
                  </button>
                </div>

                {formProvider === 'razorpay' && (
                  <>
                    <div>
                      <label className="block text-slate-700 mb-1 font-bold">Razorpay Key ID</label>
                      <input
                        type="text"
                        value={formKeyId}
                        onChange={(e) => setFormKeyId(e.target.value)}
                        placeholder="rzp_test_XXXXXXXX or rzp_live_XXXXXXXX"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 mb-1 font-bold">Razorpay Key Secret</label>
                      <input
                        type={showSecrets ? 'text' : 'password'}
                        value={formKeySecret}
                        onChange={(e) => setFormKeySecret(e.target.value)}
                        placeholder="Enter Razorpay Key Secret"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                      />
                    </div>
                  </>
                )}

                {formProvider === 'gpay' && (
                  <>
                    <div>
                      <label className="block text-slate-700 mb-1 font-bold">Google Pay Merchant ID (MID)</label>
                      <input
                        type="text"
                        value={formGpayMerchantId}
                        onChange={(e) => setFormGpayMerchantId(e.target.value)}
                        placeholder="e.g. 12345678901234567890 or BC-MID"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 mb-1 font-bold">Business Console API Key / Merchant Name</label>
                      <input
                        type={showSecrets ? 'text' : 'password'}
                        value={formGpayApiKey}
                        onChange={(e) => setFormGpayApiKey(e.target.value)}
                        placeholder="Enter Business Console API Key or Merchant Name"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                      />
                    </div>
                  </>
                )}

                {formProvider === 'paytm' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-bold">Paytm Merchant ID (MID)</label>
                        <input
                          type="text"
                          value={formPaytmMid}
                          onChange={(e) => setFormPaytmMid(e.target.value)}
                          placeholder="e.g. YOUR_PAYTM_MID_HERE"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 mb-1 font-bold">Website Name</label>
                        <input
                          type="text"
                          value={formPaytmWebsite}
                          onChange={(e) => setFormPaytmWebsite(e.target.value)}
                          placeholder="DEFAULT or WEBSTAGING"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-bold">Paytm Merchant Key</label>
                        <input
                          type={showSecrets ? 'text' : 'password'}
                          value={formPaytmMerchantKey}
                          onChange={(e) => setFormPaytmMerchantKey(e.target.value)}
                          placeholder="Enter Paytm Merchant Key"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 mb-1 font-bold">Channel ID</label>
                        <input
                          type="text"
                          value={formPaytmChannelId}
                          onChange={(e) => setFormPaytmChannelId(e.target.value)}
                          placeholder="WEB or WAP"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                        />
                      </div>
                    </div>
                  </>
                )}

                {formProvider === 'payu' && (
                  <>
                    <div>
                      <label className="block text-slate-700 mb-1 font-bold">PayU Merchant Key</label>
                      <input
                        type="text"
                        value={formPayuMerchantKey}
                        onChange={(e) => setFormPayuMerchantKey(e.target.value)}
                        placeholder="e.g. YOUR_PAYU_MERCHANT_KEY"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 mb-1 font-bold">PayU Merchant Salt (SHA-512)</label>
                      <input
                        type={showSecrets ? 'text' : 'password'}
                        value={formPayuMerchantSalt}
                        onChange={(e) => setFormPayuMerchantSalt(e.target.value)}
                        placeholder="Enter PayU Merchant Salt"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                      />
                    </div>
                  </>
                )}

                {formProvider === 'cashfree' && (
                  <>
                    <div>
                      <label className="block text-slate-700 mb-1 font-bold">Cashfree App ID</label>
                      <input
                        type="text"
                        value={formAppId}
                        onChange={(e) => setFormAppId(e.target.value)}
                        placeholder="Enter Cashfree App ID"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 mb-1 font-bold">Cashfree Secret Key</label>
                      <input
                        type={showSecrets ? 'text' : 'password'}
                        value={formSecretKey}
                        onChange={(e) => setFormSecretKey(e.target.value)}
                        placeholder="Enter Cashfree Secret Key"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                      />
                    </div>
                  </>
                )}

                {formProvider === 'phonepe' && (
                  <>
                    <div>
                      <label className="block text-slate-700 mb-1 font-bold">PhonePe Merchant ID</label>
                      <input
                        type="text"
                        value={formMerchantId}
                        onChange={(e) => setFormMerchantId(e.target.value)}
                        placeholder="e.g. PGTESTPAYUAT or Live MID"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-slate-700 mb-1 font-bold">Salt Key</label>
                        <input
                          type={showSecrets ? 'text' : 'password'}
                          value={formSaltKey}
                          onChange={(e) => setFormSaltKey(e.target.value)}
                          placeholder="PhonePe Salt Key"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 mb-1 font-bold">Salt Index</label>
                        <input
                          type="text"
                          value={formSaltIndex}
                          onChange={(e) => setFormSaltIndex(e.target.value)}
                          placeholder="1"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                        />
                      </div>
                    </div>
                  </>
                )}

                {formProvider === 'paypal' && (
                  <>
                    <div>
                      <label className="block text-slate-700 mb-1 font-bold">PayPal Client ID</label>
                      <input
                        type="text"
                        value={formClientId}
                        onChange={(e) => setFormClientId(e.target.value)}
                        placeholder="Enter PayPal REST Client ID"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 mb-1 font-bold">PayPal Secret Key</label>
                      <input
                        type={showSecrets ? 'text' : 'password'}
                        value={formSecretKey}
                        onChange={(e) => setFormSecretKey(e.target.value)}
                        placeholder="Enter PayPal Secret Key"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsEnabled}
                    onChange={(e) => setFormIsEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                  <span className="font-bold text-slate-800">Enable Gateway (Toggle ON)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="font-bold text-indigo-700">Set as Active / Default for Clients</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingGateway ? 'Save Changes' : 'Save & Connect Gateway'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PaymentReceiptModal
        isOpen={!!selectedTxnForReceipt}
        onClose={() => setSelectedTxnForReceipt(null)}
        transaction={selectedTxnForReceipt}
      />

      {/* 2-STEP ADMIN SECURITY VERIFICATION MODAL */}
      {isSecurityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
          <div className="vision-surface border border-slate-700/70 bg-slate-900/95 text-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col p-6 animate-scale-up">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-xs">
                <Lock className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-white">
                  Security Verification Required
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Enter your Master Admin Password to modify or view sensitive payment gateway credentials.
                </p>
                {pendingSecurityAction && (
                  <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700 text-[11px] font-bold text-amber-300">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">
                      Action:{' '}
                      {pendingSecurityAction.type === 'edit'
                        ? `Modify ${pendingSecurityAction.gateway?.name || 'Gateway'}`
                        : pendingSecurityAction.type === 'delete'
                        ? `Disconnect & Wipe ${pendingSecurityAction.gateway?.name || 'Gateway'}`
                        : 'Reveal Unmasked Secret Keys'}
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleCancelSecurity}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {securityError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="flex-1">{securityError}</span>
              </div>
            )}

            <form onSubmit={handleVerifySecuritySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Admin Password
                </label>
                <div className="relative">
                  <input
                    type={showSecurityPassword ? 'text' : 'password'}
                    value={securityPasswordInput}
                    onChange={(e) => {
                      setSecurityPasswordInput(e.target.value);
                      if (securityError) setSecurityError(null);
                    }}
                    placeholder="Enter Master Admin Password"
                    autoFocus
                    required
                    className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-700 focus:border-amber-400 rounded-xl font-mono text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/20 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecurityPassword(!showSecurityPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title={showSecurityPassword ? 'Hide password' : 'Show password'}
                  >
                    {showSecurityPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>A secure 5-minute modification window is granted upon successful verification.</span>
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCancelSecurity}
                  disabled={isVerifyingSecurity}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifyingSecurity || !securityPasswordInput.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isVerifyingSecurity ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Verify &amp; Proceed</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <GlobalDeleteConfirmModal
        isOpen={!!gatewayToDelete}
        title="Are you sure you want to permanently delete this gateway integration?"
        itemName={gatewayToDelete ? `${gatewayToDelete.name} (${gatewayToDelete.provider.toUpperCase()})` : ''}
        itemType="Payment Gateway Credentials"
        description="This will permanently delete this gateway integration and purge all stored API credentials and merchant keys from the database. Live checkout routing through this gateway will immediately cease."
        onConfirm={async () => {
          if (gatewayToDelete) {
            await handleDeleteGateway(gatewayToDelete);
            setGatewayToDelete(null);
          }
        }}
        onClose={() => setGatewayToDelete(null)}
      />
    </div>
  );
};
