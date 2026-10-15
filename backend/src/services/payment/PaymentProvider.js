/**
 * PaymentProvider Interface
 *
 * All payment providers must implement this interface.
 * This allows swapping payment methods without changing business logic.
 */
class PaymentProvider {
  /**
   * Initiate a payment
   * @param {Object} params
   * @param {number} params.amount - Amount in ETB
   * @param {string} params.phone - Customer phone number
   * @param {string} params.reference - Unique payment reference
   * @param {string} params.description - Payment description
   * @returns {Promise<{ success: boolean, transactionRef: string, message: string }>}
   */
  async initiate(params) {
    throw new Error('PaymentProvider.initiate() must be implemented');
  }

  /**
   * Verify a payment status
   * @param {string} transactionRef
   * @returns {Promise<{ success: boolean, status: string, receipt: string }>}
   */
  async verify(transactionRef) {
    throw new Error('PaymentProvider.verify() must be implemented');
  }

  /**
   * Initiate a refund
   * @param {string} transactionRef
   * @param {number} amount
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async refund(transactionRef, amount) {
    throw new Error('PaymentProvider.refund() must be implemented');
  }
}

module.exports = PaymentProvider;
