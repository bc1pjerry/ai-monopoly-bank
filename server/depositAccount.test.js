const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyDeposit,
  applyInterest,
  applyWithdrawal,
  normalizeDepositAccount
} = require('./depositAccount');

test('depositing into an existing account increases balance and principal only', () => {
  const account = normalizeDepositAccount({ amount: 1200, principal_amount: 1000, interest_earned: 200 });

  const next = applyDeposit(account, 300);

  assert.deepEqual(next, {
    amount: 1500,
    principal_amount: 1300,
    interest_earned: 200
  });
});

test('interest compounds into the merged account and records total earned interest', () => {
  const account = normalizeDepositAccount({ amount: 1000, principal_amount: 1000, interest_earned: 0 });

  const afterFirst = applyInterest(account, 10);
  const afterSecond = applyInterest(afterFirst, 10);

  assert.deepEqual(afterSecond, {
    amount: 1210,
    principal_amount: 1000,
    interest_earned: 210,
    lastInterest: 110
  });
});

test('withdrawing part of an account reduces balance before stored interest history', () => {
  const account = normalizeDepositAccount({ amount: 1210, principal_amount: 1000, interest_earned: 210 });

  const next = applyWithdrawal(account, 500);

  assert.deepEqual(next, {
    amount: 710,
    principal_amount: 500,
    interest_earned: 210,
    withdrawn: 500,
    closed: false
  });
});

test('withdrawing more than the account balance is rejected', () => {
  const account = normalizeDepositAccount({ amount: 300, principal_amount: 250, interest_earned: 50 });

  assert.throws(() => applyWithdrawal(account, 301), /insufficient_deposit/);
});
