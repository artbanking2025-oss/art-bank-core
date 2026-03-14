/**
 * Bank-specific API routes
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { ArtBankDB } from '../lib/db';

const bank = new Hono<{ Bindings: Env }>();

// Bank profile with loan portfolio
bank.get('/profile/:id', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const bankId = c.req.param('id');
  
  const node = await db.getNode(bankId);
  if (!node || node.node_type !== 'bank') {
    return c.json({ error: 'Bank not found' }, 404);
  }
  
  // Get transactions where bank is involved
  const transactions = await db.getTransactionsByBank(bankId);
  
  let totalLoaned = 0;
  transactions.forEach((t: any) => {
    if (t.loan_amount) totalLoaned += t.loan_amount;
  });
  
  return c.json({
    profile: node,
    portfolio: {
      total_loans: transactions.length,
      total_loaned: totalLoaned,
      transactions
    }
  });
});

// Approve/reject transaction
bank.patch('/transactions/:id', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const transactionId = c.req.param('id');
  const { status, reason } = await c.req.json();
  
  try {
    await db.updateTransactionStatus(transactionId, status);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

export default bank;
