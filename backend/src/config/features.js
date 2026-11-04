const isTrue = (val) => val === 'true' || val === '1' || val === true;
const isNotFalse = (val) => val !== 'false' && val !== '0' && val !== false;

module.exports = {
  // Enabled by default unless explicitly set to false
  ZERO_AMOUNT_CHECKOUT_ENABLED: isNotFalse(process.env.ZERO_AMOUNT_CHECKOUT_ENABLED),
  STAFF_COMPLIMENTARY_BOOKING_ENABLED: isTrue(process.env.STAFF_COMPLIMENTARY_BOOKING_ENABLED),
};
