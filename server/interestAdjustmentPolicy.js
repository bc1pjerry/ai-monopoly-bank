function shouldAutoAdjustInterestRate(eventType) {
  return eventType === 'interest-settled';
}

module.exports = {
  shouldAutoAdjustInterestRate
};
