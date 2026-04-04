/**
 * Gmail → Fabriq Process-Email Ingestion
 *
 * Google Apps Script that polls Gmail every 1 minute for emails with PDF
 * attachments and forwards them to the Fabriq process-email endpoint.
 *
 * Setup:
 *   1. Sign into the designated Google Workspace email (e.g. invoices@yourcompany.com)
 *   2. Open https://script.google.com and create a new project
 *   3. Paste this entire file into Code.gs
 *   4. Set Script Properties (Project Settings → Script Properties):
 *      - CLOUD_RUN_URL   : e.g. https://your-service-xxxxx.run.app
 *      - API_KEY          : the plaintext key from POST /api/auth/generate-api-key
 *      - MODEL_NAME       : (optional) model name override, defaults to "invoice"
 *      - PROCESS_AFTER    : (optional) ISO date string, e.g. "2026-03-01"
 *                           Only emails received after this date will be processed.
 *                           If not set, defaults to the current time (i.e. only future emails).
 *   5. Run createTimeTrigger() once to start the 1-minute polling
 *   6. Authorize when prompted (Gmail + URL Fetch scopes)
 *
 * Important:
 *   - The script runs on whichever Google account is signed in when you create
 *     the Apps Script project. To use a dedicated inbox (e.g. invoices@company.com),
 *     sign into that account first.
 *   - On first run, only emails after PROCESS_AFTER are processed. After each
 *     successful run the script saves LAST_PROCESSED_AT so it picks up from
 *     where it left off on the next run.
 *
 * Manual trigger:
 *   - Bind the script to a Google Sheet and use the "Fabriq" menu → "Process Emails Now"
 */

// ---------------------------------------------------------------------------
// Guardrails — edit these as needed
// ---------------------------------------------------------------------------

/** Maximum emails to process per run (keeps demo runs fast & predictable). */
var MAX_EMAILS_PER_RUN = 5;

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('CLOUD_RUN_URL');
  var apiKey = props.getProperty('API_KEY');
  if (!url || !apiKey) {
    throw new Error('Missing Script Properties: CLOUD_RUN_URL and API_KEY are required.');
  }
  return {
    cloudRunUrl: url.replace(/\/+$/, ''),          // strip trailing slash
    apiKey: apiKey,
    modelName: props.getProperty('MODEL_NAME') || 'invoice',
  };
}

/**
 * Returns the cutoff date: emails received before this are ignored.
 * Priority: LAST_PROCESSED_AT > PROCESS_AFTER > now (first-run default).
 */
function getCutoffDate_() {
  var props = PropertiesService.getScriptProperties();

  // 1. If we've run before, continue from last processed timestamp
  var last = props.getProperty('LAST_PROCESSED_AT');
  if (last) {
    return new Date(last);
  }

  // 2. If a start date was configured, use that
  var after = props.getProperty('PROCESS_AFTER');
  if (after) {
    return new Date(after);
  }

  // 3. First run with no config — only process future emails
  return new Date();
}

/**
 * Persist the high-water-mark so the next run picks up where we left off.
 */
function saveCutoffDate_(date) {
  PropertiesService.getScriptProperties().setProperty(
    'LAST_PROCESSED_AT',
    date.toISOString()
  );
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

var LABEL_NAME = 'fabriq-processed';

function getOrCreateLabel_() {
  var label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) {
    label = GmailApp.createLabel(LABEL_NAME);
  }
  return label;
}

// ---------------------------------------------------------------------------
// Main entry point — called by time trigger
// ---------------------------------------------------------------------------

function processNewEmails() {
  var config = getConfig_();
  var label = getOrCreateLabel_();
  var cutoff = getCutoffDate_();

  // Gmail search: after:<date> restricts to emails received after the cutoff
  // Format: YYYY/MM/DD (Gmail search syntax)
  var afterStr = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  var query = 'in:inbox -label:' + LABEL_NAME + ' has:attachment after:' + afterStr;

  Logger.log('Query: ' + query);
  Logger.log('Cutoff: ' + cutoff.toISOString());

  var threads = GmailApp.search(query, 0, 50); // fetch more, we'll cap below

  Logger.log('Found ' + threads.length + ' thread(s) matching query.');

  var emailsProcessed = 0;
  var latestDate = cutoff; // track the newest email we successfully process

  for (var t = 0; t < threads.length && emailsProcessed < MAX_EMAILS_PER_RUN; t++) {
    var thread = threads[t];
    var messages = thread.getMessages();
    var threadHadPdf = false;

    for (var m = 0; m < messages.length && emailsProcessed < MAX_EMAILS_PER_RUN; m++) {
      var message = messages[m];
      var messageDate = message.getDate();

      // Skip messages older than the cutoff (Gmail after: is date-level, not timestamp-level)
      if (messageDate <= cutoff) {
        continue;
      }

      var attachments = message.getAttachments();

      // Filter to PDF attachments only
      var pdfs = [];
      for (var a = 0; a < attachments.length; a++) {
        var att = attachments[a];
        if (att.getContentType() === 'application/pdf' ||
            att.getName().toLowerCase().match(/\.pdf$/)) {
          pdfs.push(att);
        }
      }

      if (pdfs.length === 0) {
        continue;
      }

      Logger.log('Processing message ' + message.getId() + ' (' + message.getSubject() + ') with ' + pdfs.length + ' PDF(s).');

      try {
        sendToProcessEmail_(config, message, thread, pdfs);
        emailsProcessed++;
        threadHadPdf = true;

        // Track the latest successfully processed message date
        if (messageDate > latestDate) {
          latestDate = messageDate;
        }
      } catch (e) {
        Logger.log('ERROR processing message ' + message.getId() + ': ' + e.message);
        // Continue processing other messages
      }
    }

    // Only label the thread if we actually processed a PDF from it
    if (threadHadPdf) {
      thread.addLabel(label);
    }
  }

  // Save high-water-mark so next run continues from here
  if (latestDate > cutoff) {
    saveCutoffDate_(latestDate);
    Logger.log('Updated LAST_PROCESSED_AT to ' + latestDate.toISOString());
  }

  Logger.log('Done. Processed ' + emailsProcessed + ' email(s) this run (max ' + MAX_EMAILS_PER_RUN + ').');
}

// ---------------------------------------------------------------------------
// Build multipart/form-data and POST to Cloud Run
// ---------------------------------------------------------------------------

function sendToProcessEmail_(config, message, thread, pdfs) {
  var boundary = 'fabriq_boundary_' + Utilities.getUuid();

  // Form fields
  var fields = {
    gmail_message_id: message.getId(),
    gmail_thread_id: thread.getId(),
    from_email: message.getFrom(),
    to_email: message.getTo(),
    subject: message.getSubject(),
    received_at: message.getDate().toISOString(),
    body_snippet: (message.getPlainBody() || '').substring(0, 500),
    model_name: config.modelName,
  };

  // Build binary-safe multipart payload
  var payload = buildMultipartPayload_(boundary, fields, pdfs);

  var options = {
    method: 'post',
    contentType: 'multipart/form-data; boundary=' + boundary,
    headers: {
      'x-api-key': config.apiKey,
    },
    payload: payload,
    muteHttpExceptions: true,
  };

  var url = config.cloudRunUrl + '/api/agent/process-email';
  Logger.log('POSTing to ' + url);

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  Logger.log('Response ' + code + ': ' + body.substring(0, 500));

  if (code < 200 || code >= 300) {
    throw new Error('HTTP ' + code + ': ' + body.substring(0, 200));
  }
}

// ---------------------------------------------------------------------------
// Build a proper multipart/form-data payload with binary file data
// ---------------------------------------------------------------------------

function buildMultipartPayload_(boundary, fields, pdfs) {
  var payload = [];

  // Add text fields
  for (var key in fields) {
    if (fields[key]) {
      payload.push(
        Utilities.newBlob(
          '--' + boundary + '\r\n' +
          'Content-Disposition: form-data; name="' + key + '"\r\n\r\n' +
          fields[key] + '\r\n'
        ).getBytes()
      );
    }
  }

  // Add PDF files
  for (var i = 0; i < pdfs.length; i++) {
    var pdf = pdfs[i];
    payload.push(
      Utilities.newBlob(
        '--' + boundary + '\r\n' +
        'Content-Disposition: form-data; name="file"; filename="' + pdf.getName() + '"\r\n' +
        'Content-Type: application/pdf\r\n\r\n'
      ).getBytes()
    );
    payload.push(pdf.getBytes());
    payload.push(Utilities.newBlob('\r\n').getBytes());
  }

  // Closing boundary
  payload.push(Utilities.newBlob('--' + boundary + '--\r\n').getBytes());

  // Flatten all byte arrays into one
  var result = [];
  for (var k = 0; k < payload.length; k++) {
    for (var l = 0; l < payload[k].length; l++) {
      result.push(payload[k][l]);
    }
  }

  return Utilities.newBlob(result).getBytes();
}

// ---------------------------------------------------------------------------
// Trigger management
// ---------------------------------------------------------------------------

/** Run once to install the 1-minute time-driven trigger. */
function createTimeTrigger() {
  // Remove existing triggers for this function to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processNewEmails') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('processNewEmails')
    .timeBased()
    .everyMinutes(1)
    .create();

  Logger.log('Time trigger created: processNewEmails every 1 minute.');
}

/** Remove the polling trigger. */
function removeTimeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processNewEmails') {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log('Removed trigger: ' + triggers[i].getUniqueId());
    }
  }
}

// ---------------------------------------------------------------------------
// Sheet menu (optional — bind script to a Google Sheet)
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Fabriq')
    .addItem('Process Emails Now', 'processNewEmails')
    .addItem('Setup 1-min Trigger', 'createTimeTrigger')
    .addItem('Remove Trigger', 'removeTimeTrigger')
    .addToUi();
}
