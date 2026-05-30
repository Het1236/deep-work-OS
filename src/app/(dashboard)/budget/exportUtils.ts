import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Transaction, FinanceCategory, FinanceAccount } from '@/lib/types'
import { formatINR } from '@/lib/finance'

type Lookups = { catMap: Map<string, FinanceCategory>; acctMap: Map<string, FinanceAccount> }

function rowsFor(txns: Transaction[], { catMap, acctMap }: Lookups) {
  return txns.map(t => {
    const cat = t.category_id ? catMap.get(t.category_id)?.name ?? '' : ''
    const acct = t.account_id ? acctMap.get(t.account_id)?.name ?? '' : ''
    const to = t.to_account_id ? acctMap.get(t.to_account_id)?.name ?? '' : ''
    const signed = (t.type === 'income' ? '' : t.type === 'expense' ? '-' : '') + String(t.amount)
    return {
      date: t.txn_date,
      type: t.type,
      category: t.type === 'transfer' ? `${acct} → ${to}` : cat,
      wallet: t.type === 'transfer' ? '' : acct,
      note: t.note ?? '',
      amount: signed,
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

export function exportTransactionsPDF(txns: Transaction[], lookups: Lookups, label: string) {
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
  doc.save(`transactions-${label.replace(/\s+/g, '-').toLowerCase()}.pdf`)
}
