const isTrue = (val) => val === 'true' || val === '1' || val === true;

module.exports = {
  ZERO_AMOUNT_CHECKOUT_ENABLED: isTrue(process.env.ZERO_AMOUNT_CHECKOUT_ENABLED),
  STAFF_COMPLIMENTARY_BOOKING_ENABLED: isTrue(process.env.STAFF_COMPLIMENTARY_BOOKING_ENABLED),
};
