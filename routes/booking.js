const express = require('express');
const router = express.Router();
const path = require('path');
const booking = require('../services/booking');

// GET /booking/ — dashboard HTML page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard.html'));
});

// POST /booking/send-msg — direct WhatsApp message
router.post('/send-msg', async (req, res) => {
  try {
    const waSessions = require('../services/wa-sessions');
    const { to, text } = req.body;
    const clientId = 'a86e53ec-7971-47e3-9274-a0be32cae7ca';
    if (to.includes('@g.us') || to.includes('-')) {
      await waSessions.sendToGroup(clientId, to, text);
    } else {
      await waSessions.sendMessage(clientId, to, text);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /booking/dashboard — aaj ki sab bookings (no auth for local use)
router.get('/dashboard', (req, res) => {
  try {
    const clientId = req.query.clientId || 'a86e53ec-7971-47e3-9274-a0be32cae7ca';
    const leads = booking.getTodayBookings(clientId);
    const all = booking.getAllLeads(clientId, 100);
    res.json({ today: leads, recent: all });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /booking/update — team status update kare
// Body: { leadId, called, serviceDone, notes }
router.post('/update', (req, res) => {
  try {
    const { leadId, called, serviceDone, notes, feedback } = req.body;
    if (!leadId) return res.status(400).json({ error: 'leadId required' });

    const updates = {};
    if (called !== undefined) updates.called = called;
    if (serviceDone !== undefined) updates.serviceDone = serviceDone;
    if (notes !== undefined) updates.notes = notes;
    if (feedback !== undefined) updates.feedback = feedback;

    const success = booking.updateLeadStatus(leadId, updates);
    if (!success) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /booking/slots?date=YYYY-MM-DD — slot availability check
router.get('/slots', (req, res) => {
  try {
    const { date } = req.query;
    const data = booking.loadData();
    const count = data.bookings.filter(b => b.date === date).length;
    const isSunday = new Date(date).getDay() === 0;
    res.json({
      date,
      booked: count,
      available: 10 - count,
      isSunday,
      canBook: !isSunday && count < 10,
      nextAvailable: booking.getNextAvailableDate(date),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /booking/manual — manually add a lead (team se direct)
router.post('/manual', async (req, res) => {
  try {
    const { clientId = 'a86e53ec-7971-47e3-9274-a0be32cae7ca', naam, mobile, vehicle, area, date, customerJid } = req.body;
    if (!naam && !mobile && !customerJid) return res.status(400).json({ error: 'naam, mobile ya customerJid mein se kuch toh do' });
    const result = await booking.handleLead(clientId, { naam: naam || '', mobile: mobile || '', vehicle: vehicle || '', area: area || '', date }, customerJid || '');
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /booking/leads?date=YYYY-MM-DD&clientId=xxx
router.get('/leads', (req, res) => {
  try {
    const { clientId = 'a86e53ec-7971-47e3-9274-a0be32cae7ca' } = req.query;
    const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const leads = booking.getLeadsByDate(clientId, date);
    res.json({ date, leads, total: leads.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /booking/leads/:id/call — mark lead as called
router.post('/leads/:id/call', (req, res) => {
  try {
    const success = booking.markCalled(req.params.id);
    if (!success) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /booking/leads/:id/exotel-call — Exotel click-to-call
router.post('/leads/:id/exotel-call', async (req, res) => {
  try {
    const { staffPhone, clientId } = req.body;
    if (!staffPhone || !clientId) return res.status(400).json({ error: 'staffPhone aur clientId required' });

    const db = require('../db');
    const axios = require('axios');

    const client = db.get('clients').find({ id: clientId }).value();
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const { exotelSid, exotelToken, exotelCallerId } = client;
    if (!exotelSid || !exotelToken || !exotelCallerId) {
      return res.status(400).json({ error: 'Exotel credentials set nahi hain — Admin se kaho AddClient mein daale' });
    }

    const leadData = booking.loadData ? booking.loadData() : null;
    const lead = leadData?.leads?.find(l => l.id === req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const customerPhone = (lead.mobile || '').replace(/\D/g, '');
    const fromPhone = staffPhone.replace(/\D/g, '');

    const auth = Buffer.from(`${exotelSid}:${exotelToken}`).toString('base64');
    const params = new URLSearchParams({
      From: fromPhone,
      To: customerPhone,
      CallerId: exotelCallerId,
      Record: 'true',
      TimeLimit: '3600',
    });

    const exoRes = await axios.post(
      `https://api.exotel.com/v1/Accounts/${exotelSid}/Calls/connect`,
      params.toString(),
      { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Mark lead as called
    booking.markCalled(req.params.id);

    console.log('[Exotel] Call initiated — Staff:', fromPhone, '→ Customer:', customerPhone);
    res.json({ success: true, callSid: exoRes.data?.Call?.Sid || 'initiated' });
  } catch (err) {
    console.error('[Exotel] Error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.RestException?.Message || err.message });
  }
});

// POST /booking/leads/:id/feedback — submit feedback
router.post('/leads/:id/feedback', (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Feedback text required' });
    const success = booking.addFeedback(req.params.id, text.trim());
    if (!success) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /booking/report — manual evening report trigger
router.post('/report', async (req, res) => {
  try {
    await booking.sendEveningReport();
    res.json({ success: true, message: 'Evening report bhej di gayi!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /booking/test — saari cheezein abhi test karo
router.post('/test', async (req, res) => {
  try {
    const clientId = 'a86e53ec-7971-47e3-9274-a0be32cae7ca';
    const results = {};

    // 1. Test lead add karo
    const testLead = {
      naam: 'Test Customer',
      mobile: req.body.mobile || '9327363931',
      vehicle: 'Honda Activa 2022',
      area: 'Althan',
      date: new Date().toISOString().split('T')[0],
    };
    const leadResult = await booking.handleLead(clientId, testLead);
    results.lead = { status: 'done', assignedDate: leadResult.assignedDate, leadId: leadResult.lead.id };

    await new Promise(r => setTimeout(r, 2000));

    // 2. Customer reminder abhi bhejo
    await booking.sendTodayReminders();
    results.customerReminder = 'sent';

    await new Promise(r => setTimeout(r, 2000));

    // 3. Evening report abhi bhejo
    await booking.sendEveningReport();
    results.eveningReport = 'sent';

    await new Promise(r => setTimeout(r, 2000));

    // 4. Followup reminder abhi bhejo
    await booking.sendFollowupReminder();
    results.followupReminder = 'sent';

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
