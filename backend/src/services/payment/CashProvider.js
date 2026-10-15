const PaymentProvider = require('./PaymentProvider');
const logger = require('../../config/logger');

/**
 * Cash Payment Provider
 * For in-person cash payments. Records the transaction without external API calls.
 */
class CashProvider extends PaymentProvider {
  async initiate({ amount, reference, description }) {
    logger.info(`Cash payment initiated: ${reference} — ${amount} ETB`);
    return {
      success: true,
      transactionRef: `CASH-${reference}-${Date.now()}`,
      message: 'Cash payment recorded. Please collect payment from the customer.',
    };
  }

  async verify(transactionRef) {
    return { success: true, status: 'PAID', receipt: transactionRef };
  }

  async refund(transactionRef, amount) {
    return {
      success: true,
      message: `Cash refund of ${amount} ETB should be returned directly to the customer.`,
    };
  }
}

module.exports = CashProvider;
