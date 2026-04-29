function normalizeMoney(value) {
  const amount = Math.floor(Number(value));
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function normalizeDepositAccount(account = {}) {
  const amount = normalizeMoney(account.amount);
  const principal = account.principal_amount == null
    ? amount
    : Math.min(amount, normalizeMoney(account.principal_amount));
  const interest = normalizeMoney(account.interest_earned);

  return {
    amount,
    principal_amount: principal,
    interest_earned: interest
  };
}

function applyDeposit(account, depositAmount) {
  const base = normalizeDepositAccount(account);
  const amount = normalizeMoney(depositAmount);
  if (amount <= 0) throw new Error('invalid_amount');

  return {
    amount: base.amount + amount,
    principal_amount: base.principal_amount + amount,
    interest_earned: base.interest_earned
  };
}

function applyInterest(account, rate) {
  const base = normalizeDepositAccount(account);
  const interest = Math.round(base.amount * (Number(rate || 0) / 100));
  if (interest <= 0) {
    return {
      ...base,
      lastInterest: 0
    };
  }

  return {
    amount: base.amount + interest,
    principal_amount: base.principal_amount,
    interest_earned: base.interest_earned + interest,
    lastInterest: interest
  };
}

function applyWithdrawal(account, withdrawAmount) {
  const base = normalizeDepositAccount(account);
  const amount = normalizeMoney(withdrawAmount);
  if (amount <= 0) throw new Error('invalid_amount');
  if (amount > base.amount) throw new Error('insufficient_deposit');

  const principalReduction = Math.min(base.principal_amount, amount);
  const nextAmount = base.amount - amount;
  const nextPrincipal = nextAmount === 0 ? 0 : base.principal_amount - principalReduction;

  return {
    amount: nextAmount,
    principal_amount: nextPrincipal,
    interest_earned: base.interest_earned,
    withdrawn: amount,
    closed: nextAmount === 0
  };
}

module.exports = {
  applyDeposit,
  applyInterest,
  applyWithdrawal,
  normalizeDepositAccount
};
