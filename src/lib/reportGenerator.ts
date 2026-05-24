import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ScoreboardData } from '@/lib/types'

// Helper: draw page background + header stripe on every page
function drawPageBase(doc: jsPDF, pageNum: number) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()

  // White background
  doc.setFillColor('#FFFFFF')
  doc.rect(0, 0, W, H, 'F')

  // Thin green + blue accent bar at top of continuation pages
  if (pageNum > 1) {
    doc.setFillColor('#2E8B57')
    doc.rect(0, 0, W, 3, 'F')
    doc.setFillColor('#2563EB')
    doc.rect(0, 3, W, 1, 'F')

    // Continuation header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor('#2E8B57')
    doc.text('DeepWork OS  —  Performance Report (continued)', 14, 12)
  }
}

// Helper: draw footer on every page
function drawFooter(doc: jsPDF, page: number, totalPages: number, dateStr: string) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()

  doc.setDrawColor('#E5E7EB')
  doc.line(14, H - 14, W - 14, H - 14)
  doc.setTextColor('#999999')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(`DeepWork OS  |  Performance Report  |  ${dateStr}`, 14, H - 8)
  doc.text(`Page ${page} of ${totalPages}`, W - 14, H - 8, { align: 'right' })
}

export function generateReport(data: ScoreboardData, userName: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  // Colors
  const green = '#2E8B57'
  const greenLight = '#4CAF7D'
  const blue = '#2563EB'
  const blueLight = '#3B82F6'
  const orange = '#EA580C'
  const nearBlack = '#1A1A2E'
  const darkGray = '#333333'
  const medGray = '#666666'
  const lightGray = '#999999'
  const borderColor = '#E5E7EB'
  const headerBg = '#F1F5F9'
  const rowAlt = '#F9FAFB'

  // ═══════════════════════════════════════════
  // PAGE 1
  // ═══════════════════════════════════════════
  drawPageBase(doc, 1)

  // ── Header Banner ──
  doc.setFillColor(green)
  doc.rect(0, 0, W, 42, 'F')
  doc.setFillColor(blue)
  doc.rect(0, 42, W, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#FFFFFF')
  doc.setFontSize(24)
  doc.text('DeepWork OS', 14, 18)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor('#C8E6C9')
  doc.text('PERFORMANCE REPORT', 14, 26)

  doc.setFontSize(9)
  doc.setTextColor('#A5D6A7')
  doc.text(`${userName}  |  Generated: ${dateStr}`, 14, 34)

  // Brand box
  doc.setFillColor('#FFFFFF')
  doc.roundedRect(W - 50, 12, 36, 18, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(green)
  doc.text('DEEP', W - 44, 20)
  doc.setTextColor(blue)
  doc.text('WORK', W - 44, 26)

  let y = 54

  // ── Key Performance Metrics ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(nearBlack)
  doc.text('Key Performance Metrics', 14, y)
  y += 4

  const boxW = (W - 28 - 18) / 4
  const boxH = 32
  const statBoxes = [
    { label: 'TOTAL (WEEK)', value: `${data.totalHoursWeek}h`, accent: green, sub: 'hours' },
    { label: 'PEAK VELOCITY', value: `${data.peakVelocity}`, accent: blue, sub: 'hrs/day' },
    { label: 'DEEP WORK RATIO', value: `${data.deepWorkRatio}%`, accent: green, sub: 'focus rate' },
    { label: 'AVG INTENSITY', value: `${data.avgIntensity}`, accent: orange, sub: 'out of 10' },
  ]

  statBoxes.forEach((s, i) => {
    const x = 14 + i * (boxW + 6)
    doc.setFillColor(headerBg)
    doc.setDrawColor(borderColor)
    doc.roundedRect(x, y, boxW, boxH, 3, 3, 'FD')
    doc.setFillColor(s.accent)
    doc.roundedRect(x, y, boxW, 3, 3, 3, 'F')
    doc.setFillColor(headerBg)
    doc.rect(x, y + 2, boxW, 2, 'F')

    doc.setTextColor(s.accent)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(s.value, x + boxW / 2, y + 16, { align: 'center' })
    doc.setTextColor(medGray)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text(s.label, x + boxW / 2, y + 23, { align: 'center' })
    doc.setTextColor(lightGray)
    doc.setFontSize(6)
    doc.text(s.sub, x + boxW / 2, y + 28, { align: 'center' })
  })

  y += boxH + 12

  // ── Monthly Overview ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(nearBlack)
  doc.text('Monthly Overview (30 Days)', 14, y)
  y += 4

  doc.setFillColor('#FFFFFF')
  doc.setDrawColor(borderColor)
  doc.roundedRect(14, y, W - 28, 20, 3, 3, 'FD')

  const mStats = [
    { label: 'TOTAL HOURS', value: `${data.totalHoursMonth}h`, color: green },
    { label: 'SESSIONS', value: `${data.sessionsCount}`, color: blue },
    { label: 'AVG PER SESSION', value: data.sessionsCount > 0 ? `${Math.round(data.totalHoursMonth / data.sessionsCount * 60)}min` : '0min', color: orange },
  ]
  const mW = (W - 28) / 3
  mStats.forEach((s, i) => {
    const x = 14 + i * mW + mW / 2
    doc.setTextColor(s.color)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(s.value, x, y + 10, { align: 'center' })
    doc.setTextColor(lightGray)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text(s.label, x, y + 16, { align: 'center' })
  })

  y += 28

  // ── Weekly Bar Chart ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(nearBlack)
  doc.text('Weekly Focus Distribution', 14, y)
  y += 4

  const chartH = 40
  const chartW = W - 28
  const barGap = 4
  const maxMin = Math.max(...data.weeklyChart.map(d => d.deepMin + d.shallowMin), 1)

  doc.setFillColor('#FFFFFF')
  doc.setDrawColor(borderColor)
  doc.roundedRect(14, y, chartW, chartH + 18, 3, 3, 'FD')

  const barAreaW = chartW - 16
  const singleBarW = (barAreaW - 6 * barGap) / 7

  data.weeklyChart.forEach((d, i) => {
    const x = 22 + i * (singleBarW + barGap)
    const totalMin = d.deepMin + d.shallowMin
    const totalH = (totalMin / maxMin) * chartH
    const deepH = totalMin > 0 ? (d.deepMin / totalMin) * totalH : 0
    const shallowH = totalH - deepH

    if (shallowH > 0) {
      doc.setFillColor(blueLight)
      doc.roundedRect(x, y + 4 + (chartH - totalH), singleBarW, shallowH, 1, 1, 'F')
    }
    if (deepH > 0) {
      doc.setFillColor(greenLight)
      doc.roundedRect(x, y + 4 + (chartH - deepH), singleBarW, deepH, 1, 1, 'F')
    }

    doc.setTextColor(medGray)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(d.day, x + singleBarW / 2, y + chartH + 10, { align: 'center' })

    const hrs = Math.round((d.deepMin + d.shallowMin) / 60 * 10) / 10
    if (hrs > 0) {
      doc.setTextColor(darkGray)
      doc.setFontSize(6)
      doc.text(`${hrs}h`, x + singleBarW / 2, y + (chartH - totalH) + 1, { align: 'center' })
    }
  })

  // Legend
  const legY = y + chartH + 14
  doc.setFillColor(greenLight)
  doc.rect(22, legY, 6, 3, 'F')
  doc.setTextColor(medGray)
  doc.setFontSize(6.5)
  doc.text('Deep Work', 30, legY + 2.5)
  doc.setFillColor(blueLight)
  doc.rect(56, legY, 6, 3, 'F')
  doc.text('Shallow Work', 64, legY + 2.5)

  y += chartH + 24

  // ── Weekly Table ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(nearBlack)
  doc.text('Weekly Detail', 14, y)
  y += 2

  autoTable(doc, {
    startY: y,
    head: [['Day', 'Deep Work', 'Shallow Work', 'Total', 'Deep %']],
    body: data.weeklyChart.map(d => {
      const deepH = Math.round(d.deepMin / 60 * 10) / 10
      const shallowH = Math.round(d.shallowMin / 60 * 10) / 10
      const total = deepH + shallowH
      const pct = total > 0 ? Math.round(deepH / total * 100) : 0
      return [d.day, `${deepH}h`, `${shallowH}h`, `${total}h`, `${pct}%`]
    }),
    theme: 'grid',
    headStyles: { fillColor: [46, 139, 87], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fillColor: [255, 255, 255], textColor: [51, 51, 51], fontSize: 8, halign: 'center', lineColor: [229, 231, 235], lineWidth: 0.3 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    margin: { left: 14, right: 14 },
  })

  // ═══════════════════════════════════════════
  // PAGE 2: Session History + Inferences
  // ═══════════════════════════════════════════
  doc.addPage()
  drawPageBase(doc, 2)

  y = 20

  // ── Session History ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(nearBlack)
  doc.text('Session History', 14, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(lightGray)
  doc.text('Last 30 days', 60, y)
  y += 4

  const sessionRows = data.sessions.slice(0, 25).map(s => {
    const dur = s.duration_minutes || 0
    const pct = s.deep_work_pct ?? 100
    const type = pct >= 70 ? 'Deep Work' : pct >= 30 ? 'Mixed' : 'Shallow'
    const dateObj = new Date(s.started_at)
    const date = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    const time = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    const hrs = Math.floor(dur / 60)
    const mins = dur % 60
    const durStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
    const score = s.intensity_score || 0
    return [date, time, type, durStr, `${pct}%`, `${score}/10`, (s.notes || '-').substring(0, 28)]
  })

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Time', 'Type', 'Duration', 'Deep%', 'Intensity', 'Notes']],
    body: sessionRows,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fillColor: [255, 255, 255], textColor: [51, 51, 51], fontSize: 7, lineColor: [229, 231, 235], lineWidth: 0.2 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 18 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'center', cellWidth: 22 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'center', cellWidth: 16 },
      6: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      // Re-draw white bg on auto-overflow pages
      const pg = doc.internal.pages.length - 1
      drawPageBase(doc, pg)
    },
  })

  // @ts-expect-error jspdf-autotable
  y = doc.lastAutoTable.finalY + 12

  // Check if inferences fit; if not, new page
  if (y > H - 75) {
    doc.addPage()
    drawPageBase(doc, doc.internal.pages.length - 1)
    y = 20
  }

  // ── Key Inferences & Recommendations ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(nearBlack)
  doc.text('Key Inferences & Recommendations', 14, y)
  y += 6

  // Build inference lines (no emojis — use text markers)
  const inferences: { marker: string; color: string; text: string }[] = []

  if (data.deepWorkRatio >= 70) {
    inferences.push({ marker: '[+]', color: green, text: `Strong Discipline  --  ${data.deepWorkRatio}% of your work time is focused deep work. You are in the elite zone.` })
  } else if (data.deepWorkRatio >= 40) {
    inferences.push({ marker: '[!]', color: orange, text: `Moderate Focus  --  ${data.deepWorkRatio}% deep work ratio. Aim for 70%+ to maximize cognitive output.` })
  } else {
    inferences.push({ marker: '[X]', color: '#DC2626', text: `Low Focus Alert  --  Only ${data.deepWorkRatio}% deep work. Too much shallow work is reducing your output.` })
  }

  if (data.peakVelocity >= 4) {
    inferences.push({ marker: '[+]', color: green, text: `Peak Capacity  --  Your best day hit ${data.peakVelocity}h, showing elite deep work capacity.` })
  } else {
    inferences.push({ marker: '[>]', color: blue, text: `Growth Opportunity  --  Peak day was ${data.peakVelocity}h. Target 4h+ for maximum impact.` })
  }

  if (data.avgIntensity >= 7) {
    inferences.push({ marker: '[+]', color: green, text: `High Intensity  --  Average ${data.avgIntensity}/10 shows your sessions are highly focused.` })
  } else {
    inferences.push({ marker: '[>]', color: blue, text: `Intensity Check  --  Average ${data.avgIntensity}/10. Try environment design to boost concentration.` })
  }

  const avgPerDay = data.sessionsCount > 0 ? Math.round(data.totalHoursMonth / 30 * 10) / 10 : 0
  inferences.push({ marker: '[i]', color: medGray, text: `Overall  --  ${avgPerDay}h/day average over 30 days across ${data.sessionsCount} total sessions.` })

  // Draw inference cards
  const infCardH = 14
  inferences.forEach((inf, i) => {
    const cardY = y + i * (infCardH + 4)

    // Card background
    doc.setFillColor('#F8FAFC')
    doc.setDrawColor(borderColor)
    doc.roundedRect(14, cardY, W - 28, infCardH, 3, 3, 'FD')

    // Left color bar
    doc.setFillColor(inf.color)
    doc.roundedRect(14, cardY, 4, infCardH, 3, 0, 'F')
    doc.rect(16, cardY, 2, infCardH, 'F') // cover inner rounding

    // Marker
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(inf.color)
    doc.text(inf.marker, 22, cardY + 8.5)

    // Text
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(darkGray)
    doc.text(inf.text, 32, cardY + 8.5, { maxWidth: W - 54 })
  })

  // ═══════════════════════════════════════════
  // FOOTERS on all pages
  // ═══════════════════════════════════════════
  const totalPages = doc.internal.pages.length - 1
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    drawFooter(doc, p, totalPages, dateStr)
  }

  doc.save(`DeepWork_Report_${new Date().toISOString().split('T')[0]}.pdf`)
}
