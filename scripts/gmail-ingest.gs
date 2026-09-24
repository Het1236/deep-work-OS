/**
 * Life OS — Gmail order-email forwarder (Google Apps Script)
 *
 * Runs inside YOUR Google account every 10 minutes. Finds new order/payment
 * emails from an allow-list of shops and POSTs sender, subject, date and
 * plain-text body to Life OS, which matches them to bank SMS debits (to add
 * item details) or logs them as their own expense.
 *
 * Setup:
 *   1. Project Settings → Script properties → add INGEST_SECRET = <your token>
 *   2. Select `setup` in the toolbar → Run → approve permissions.
 *   3. Optional: run `testConnection` to check the server answers.
 */

const ENDPOINT = 'https://deep-work-os-iota.vercel.app/api/ingest/email';

// Only emails from these domains are ever read or sent.
const SENDERS = [
  'amazon.in', 'flipkart.com', 'myntra.com', 'ajio.com', 'nykaa.com',
  'swiggy.in', 'zomato.com', 'blinkit.com', 'zeptonow.com', 'bigbasket.com',
  'bookmyshow.com', 'uber.com', 'olacabs.com', 'rapido.bike',
  'decathlon.in', 'irctc.co.in', 'makemytrip.com',
];

const LABEL = 'LifeOS/logged';
const MAX_BODY = 15000; // characters; order mails are long HTML, the text part is enough
const BATCH = 20;

/** Run once: remembers "start from 1 day ago" and installs the 10-min trigger. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('INGEST_SECRET')) {
    throw new Error('Add the INGEST_SECRET script property first (Project Settings → Script properties).');
  }
  if (!props.getProperty('LAST_TS')) {
    props.setProperty('LAST_TS', String(Date.now() - 24 * 60 * 60 * 1000));
  }
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'forwardOrderEmails')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('forwardOrderEmails').timeBased().everyMinutes(10).create();
  GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  Logger.log('Setup done. Trigger installed: forwardOrderEmails every 10 minutes.');
}

/** The scheduled job. Safe to run by hand too. */
function forwardOrderEmails() {
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('INGEST_SECRET');
  const lastTs = Number(props.getProperty('LAST_TS') || 0);

  const query = '{' + SENDERS.map(d => 'from:' + d).join(' ') + '} newer_than:2d';
  const threads = GmailApp.search(query, 0, 50);

  // Collect individual messages newer than the last successful run.
  const fresh = [];
  threads.forEach(thread => {
    thread.getMessages().forEach(m => {
      if (m.getDate().getTime() > lastTs) fresh.push({ thread, m });
    });
  });
  fresh.sort((a, b) => a.m.getDate() - b.m.getDate());

  // Send the messages in batches, stopping at the first failure (it will be retried next run).
  // After each successful batch, move LAST_TS forward.
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  for (let i = 0; i < fresh.length; i += BATCH) {
    const chunk = fresh.slice(i, i + BATCH);
    const payload = {
      messages: chunk.map(({ m }) => ({
        id: m.getId(),
        from: m.getFrom(),
        subject: m.getSubject(),
        date: m.getDate().toISOString(),
        body_text: (m.getPlainBody() || '').slice(0, MAX_BODY),
      })),
    };
    const res = UrlFetchApp.fetch(ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log('Life OS answered ' + code + ': ' + res.getContentText().slice(0, 300));
      return; // LAST_TS not advanced → these emails are retried next run
    }
    chunk.forEach(({ thread }) => thread.addLabel(label));
    props.setProperty('LAST_TS', String(chunk[chunk.length - 1].m.getDate().getTime()));
  }

  // Even with no new mail, ping the server so it can sweep pending email-only orders.
  if (fresh.length === 0) {
    UrlFetchApp.fetch(ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify({ messages: [] }),
      muteHttpExceptions: true,
    });
  }
  Logger.log('Forwarded ' + fresh.length + ' message(s).');
}

/** Manual check: sends an empty batch and prints what the server says. */
function testConnection() {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  const res = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + secret },
    payload: JSON.stringify({ messages: [] }),
    muteHttpExceptions: true,
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
}
