const axios = require('axios');
const PaymentProvider = require('./PaymentProvider');
const logger = require('../../config/logger');

/**
 * M-PESA Payment Provider — Safaricom Ethiopia
 *
 * Uses the official Safaricom Ethiopia M-PESA API.
 * Configure credentials via environment variables.
 *
 * API Reference: https://developer.safaricom.et
 *
 * NOTE: This is a real integration using the official Safaricom Ethiopia
 * sandbox/production API. To go live:
 * 1. Register at https://developer.safaricom.et
 * 2. Create an app and obtain Consumer Key + Secret
 * 3. Apply for production credentials
 * 4. Update MPESA_BASE_URL to production URL
 */
class MpesaProvider extends PaymentProvider {
  constructor() {
    super();
    this.baseUrl = process.env.MPESA_BASE_URL || 'https://apisandbox.safaricom.et';
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.shortcode = process.env.MPESA_SHORTCODE;
    this.passkey = process.env.MPESA_PASSKEY;
    this.callbackUrl = process.env.MPESA_CALLBACK_URL;
    this._accessToken = null;
    this._tokenExpiry = null;
  }

  /**
   * Check if M-PESA is configured
   */
  isConfigured() {
    return !!(this.consumerKey && this.consumerSecret && this.shortcode && this.passkey);
  }

  /**
   * Get OAuth2 access token from Safaricom Ethiopia
   */
  async getAccessToken() {
    if (this._accessToken && this._tokenExpiry && Date.now() < this._tokenExpiry) {
      return this._accessToken;
    }

    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

    try {
      const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${credentials}` },
        timeout: 15000,
      });

      this._accessToken = response.data.access_token;
      this._tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
      return this._accessToken;
    } catch (err) {
      logger.error('M-PESA token fetch failed:', err.message);
      throw new Error('Failed to authenticate with M-PESA. Please check your credentials.');
    }
  }

  /**
   * Generate STK Push password (Base64 of shortcode + passkey + timestamp)
   */
  getPassword(timestamp) {
    return Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');
  }

  /**
   * Initiate STK Push payment
   */
  async initiate({ amount, phone, reference, description }) {
    if (!this.isConfigured()) {
      logger.warn('M-PESA not configured. Check environment variables.');
      return {
        success: false,
        message: 'M-PESA is not configured. Please contact support.',
        code: 'MPESA_NOT_CONFIGURED',
      };
    }

    // Normalize phone: Safaricom Ethiopia uses 251XXXXXXXXX format
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) {
      return { success: false, message: 'Invalid phone number format for M-PESA.', code: 'INVALID_PHONE' };
    }

    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const password = this.getPassword(timestamp);

    try {
      const token = await this.getAccessToken();

      const payload = {
        BusinessShortCode: this.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.ceil(amount), // M-PESA requires integer
        PartyA: normalizedPhone,
        PartyB: this.shortcode,
        PhoneNumber: normalizedPhone,
        CallBackURL: this.callbackUrl,
        AccountReference: reference,
        TransactionDesc: description || 'Balemuya Service Payment',
      };

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 30000,
        }
      );

      const { ResponseCode, ResponseDescription, CheckoutRequestID, MerchantRequestID } = response.data;

      if (ResponseCode === '0') {
        logger.info(`M-PESA STK Push initiated: ${CheckoutRequestID}`);
        return {
          success: true,
          transactionRef: CheckoutRequestID,
          merchantRequestId: MerchantRequestID,
          message: 'STK Push sent. Please complete payment on your phone.',
        };
      } else {
        logger.error(`M-PESA STK failed: ${ResponseDescription}`);
        return { success: false, message: ResponseDescription, code: 'MPESA_STK_FAILED' };
      }
    } catch (err) {
      logger.error('M-PESA initiate error:', err.response?.data || err.message);
      return {
        success: false,
        message: 'M-PESA payment initiation failed. Please try again.',
        code: 'MPESA_ERROR',
      };
    }
  }

  /**
   * Verify STK Push payment status
   */
  async verify(checkoutRequestId) {
    if (!this.isConfigured()) {
      return { success: false, status: 'UNKNOWN', message: 'M-PESA not configured.' };
    }

    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const password = this.getPassword(timestamp);

    try {
      const token = await this.getAccessToken();

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
        {
          BusinessShortCode: this.shortcode,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId,
        },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );

      const { ResultCode, ResultDesc } = response.data;

      if (ResultCode === '0') {
        return { success: true, status: 'PAID', receipt: response.data.MpesaReceiptNumber || checkoutRequestId };
      } else if (ResultCode === '1032') {
        return { success: false, status: 'CANCELLED', message: 'Payment cancelled by user.' };
      } else {
        return { success: false, status: 'FAILED', message: ResultDesc };
      }
    } catch (err) {
      logger.error('M-PESA verify error:', err.message);
      return { success: false, status: 'UNKNOWN', message: 'Could not verify payment status.' };
    }
  }

  /**
   * Process M-PESA callback (webhook)
   */
  processCallback(callbackData) {
    try {
      const { Body } = callbackData;
      const { stkCallback } = Body;
      const { ResultCode, ResultDesc, CallbackMetadata, CheckoutRequestID, MerchantRequestID } = stkCallback;

      if (ResultCode === 0) {
        const items = CallbackMetadata?.Item || [];
        const getItem = (name) => items.find((i) => i.Name === name)?.Value;

        return {
          success: true,
          checkoutRequestId: CheckoutRequestID,
          merchantRequestId: MerchantRequestID,
          amount: getItem('Amount'),
          receiptNumber: getItem('MpesaReceiptNumber'),
          phone: getItem('PhoneNumber'),
          transactionDate: getItem('TransactionDate'),
        };
      } else {
        return { success: false, checkoutRequestId: CheckoutRequestID, message: ResultDesc };
      }
    } catch (err) {
      logger.error('M-PESA callback parse error:', err.message);
      return { success: false, message: 'Invalid callback data.' };
    }
  }

  /**
   * Initiate B2C (reversal/refund) — requires approved B2C API access
   * This is a stub that documents what's needed for production
   */
  async refund(transactionRef, amount) {
    logger.warn(`M-PESA refund requested for ${transactionRef} — B2C API integration required.`);
    // B2C API endpoint: /mpesa/b2c/v1/paymentrequest
    // Requires: InitiatorName, SecurityCredential, CommandID (BusinessPayment), Amount, PartyA (Shortcode), PartyB (phone)
    // This requires separate production approval from Safaricom Ethiopia
    return {
      success: false,
      message: 'Automated refunds require B2C API approval from Safaricom Ethiopia. Please contact support for manual refunds.',
      code: 'B2C_NOT_CONFIGURED',
    };
  }

  /**
   * Normalize Ethiopian phone number to 251XXXXXXXXX format
   */
  normalizePhone(phone) {
    if (!phone) return null;
    const cleaned = phone.replace(/\s+/g, '').replace(/-/g, '');
    if (cleaned.startsWith('+251')) return cleaned.slice(1); // remove +
    if (cleaned.startsWith('251')) return cleaned;
    if (cleaned.startsWith('09') || cleaned.startsWith('07')) return `251${cleaned.slice(1)}`;
    if (cleaned.startsWith('9') || cleaned.startsWith('7')) return `251${cleaned}`;
    return null;
  }
}

module.exports = MpesaProvider;
