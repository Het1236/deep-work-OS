import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Transaction, FinanceCategory, FinanceAccount, DebtStatus } from '@/lib/types'
import { formatINR } from '@/lib/finance'

type Lookups = { catMap: Map<string, FinanceCategory>; acctMap: Map<string, FinanceAccount> }

const isDebtType = (t: Transaction) => t.type === 'lend' || t.type === 'borrow' || t.type === 'repayment'

function debtLabel(t: Transaction): string {
  if (t.type === 'lend') return `Lent to ${t.person || '?'}`
  if (t.type === 'borrow') return `Borrowed from ${t.person || '?'}`
  return t.account_id ? `Repaid ${t.person || '?'}` : `${t.person || '?'} repaid`
}

function rowsFor(txns: Transaction[], { catMap, acctMap }: Lookups) {
  return txns.map(t => {
    const cat = t.category_id ? catMap.get(t.category_id)?.name ?? '' : ''
    const acct = t.account_id ? acctMap.get(t.account_id)?.name ?? '' : ''
    const to = t.to_account_id ? acctMap.get(t.to_account_id)?.name ?? '' : ''
    // Debt rows: account_id = money out (−), to_account_id = money in (+).
    const sign = t.type === 'income' ? '' : t.type === 'expense' ? '-'
      : isDebtType(t) ? (t.account_id ? '-' : '+') : ''
    return {
      date: t.txn_date,
      type: t.type,
      category: t.type === 'transfer' ? `${acct} → ${to}` : isDebtType(t) ? debtLabel(t) : cat,
      wallet: t.type === 'transfer' ? '' : acct || to,
      note: t.note ?? '',
      amount: sign + String(t.amount),
    }
  })
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportTransactionsCSV(txns: Transaction[], lookups: Lookups, label: string) {
  const rows = rowsFor(txns, lookups)
  const header = ['Date', 'Type', 'Category', 'Wallet', 'Note', 'Amount (INR)']
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`
  const lines = [
    header.map(esc).join(','),
    ...rows.map(r => [r.date, r.type, r.category, r.wallet, r.note, r.amount].map(esc).join(',')),
  ]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `transactions-${label.replace(/\s+/g, '-').toLowerCase()}.csv`)
}

export function exportTransactionsPDF(txns: Transaction[], lookups: Lookups, label: string, debts?: DebtStatus[]) {
  const rows = rowsFor(txns, lookups)
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Budget Tracker — Transactions', 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(120)
  doc.text(label, 14, 25)

  const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
  doc.text(`Income: ${formatINR(income)}    Expense: ${formatINR(expense)}    Net: ${formatINR(income - expense)}`, 14, 31)

  autoTable(doc, {
    startY: 37,
    head: [['Date', 'Type', 'Category', 'Wallet', 'Note', 'Amount (Rs)']],
    body: rows.map(r => [r.date, r.type, r.category, r.wallet, r.note, r.amount]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [76, 175, 125] },
  })

  // Outstanding lend/borrow summary (all-time, not just this view's rows).
  const open = (debts || []).filter(d => d.outstanding > 0)
  if (open.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const afterTable = (doc as any).lastAutoTable?.finalY ?? 40
    doc.setFontSize(12)
    doc.setTextColor(0)
    doc.text('Outstanding Lend / Borrow', 14, afterTable + 12)
    autoTable(doc, {
      startY: afterTable + 16,
      head: [['Person', 'Direction', 'Original (Rs)', 'Repaid (Rs)', 'Outstanding (Rs)', 'Since', 'Due']],
      body: open.map(d => [
        d.person,
        d.direction === 'lent' ? 'Owes you' : 'You owe',
        String(d.original), String(d.repaid), String(d.outstanding),
        d.tx.txn_date, d.tx.due_date ? `${d.tx.due_date}${d.overdue ? ' (OVERDUE)' : ''}` : '—',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [245, 166, 35] },
    })
    const owedToYou = open.filter(d => d.direction === 'lent').reduce((s, d) => s + d.outstanding, 0)
    const youOwe = open.filter(d => d.direction === 'borrowed').reduce((s, d) => s + d.outstanding, 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const y = ((doc as any).lastAutoTable?.finalY ?? afterTable + 20) + 7
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(`Owed to you: ${formatINR(owedToYou)}    You owe: ${formatINR(youOwe)}`, 14, y)
  }

  doc.save(`transactions-${label.replace(/\s+/g, '-').toLowerCase()}.pdf`)
}
