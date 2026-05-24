import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '';

function headers() {
  return { 'x-admin-token': localStorage.getItem('adminToken') || '' };
}

function clientHeaders() {
  return { 'x-client-token': localStorage.getItem('clientToken') || '' };
}

export const api = {
  getClients:      ()       => axios.get(`${BASE}/admin/clients`,                    { headers: headers() }),
  addClient:       (data)   => axios.post(`${BASE}/admin/clients`, data,             { headers: headers() }),
  updateClient:    (id, d)  => axios.put(`${BASE}/admin/clients/${id}`, d,           { headers: headers() }),
  deleteClient:    (id)     => axios.delete(`${BASE}/admin/clients/${id}`,           { headers: headers() }),
  toggleClient:    (id)     => axios.post(`${BASE}/admin/clients/${id}/toggle`, {},  { headers: headers() }),
  getLogs:         (id)     => axios.get(`${BASE}/admin/clients/${id}/logs`,         { headers: headers() }),
  connectWA:       (id, phone) => axios.post(`${BASE}/admin/clients/${id}/connect`, phone ? { phoneNumber: phone } : {}, { headers: headers() }),
  disconnectWA:    (id)     => axios.post(`${BASE}/admin/clients/${id}/disconnect`,{},{ headers: headers() }),
  getQR:           (id)     => axios.get(`${BASE}/admin/clients/${id}/qr`,           { headers: headers() }),
  sendReport:      (id)     => axios.post(`${BASE}/admin/clients/${id}/send-report`,{},{ headers: headers() }),
  previewReport:   (id)     => axios.get(`${BASE}/admin/clients/${id}/preview-report`,{ headers: headers() }),
  getApiCreds:     (id)     => axios.get(`${BASE}/admin/clients/${id}/api-credentials`,{ headers: headers() }),
  regenApiKey:     (id)     => axios.post(`${BASE}/admin/clients/${id}/regen-apikey`,{},{ headers: headers() }),
  updateWebhook:    (id, url)  => axios.put(`${BASE}/admin/clients/${id}`, { webhookUrl: url }, { headers: headers() }),
  getInbox:         (id)           => axios.get(`${BASE}/admin/clients/${id}/logs`,                                      { headers: headers() }),
  sendInboxMessage: (id, to, text) => axios.post(`${BASE}/admin/clients/${id}/send-message`, { to, text },               { headers: headers() }),
  botToggle:        (id, convId)   => axios.post(`${BASE}/admin/clients/${id}/conversations/${convId}/bot-toggle`, {},    { headers: headers() }),
  resolveConv:      (id, convId)   => axios.post(`${BASE}/admin/clients/${id}/conversations/${convId}/resolve`, {},       { headers: headers() }),
};

export const leadsApi = {
  getLeads:    (date, clientId) => axios.get(`${BASE}/booking/leads`, { params: { date, clientId } }),
  markCalled:  (id)             => axios.post(`${BASE}/booking/leads/${id}/call`),
  addFeedback: (id, text)       => axios.post(`${BASE}/booking/leads/${id}/feedback`, { text }),
};

export const clientApi = {
  login:          (data)         => axios.post(`${BASE}/client/login`, data),
  me:             ()             => axios.get(`${BASE}/client/me`,             { headers: clientHeaders() }),
  stats:          ()             => axios.get(`${BASE}/client/stats`,          { headers: clientHeaders() }),
  logs:           ()             => axios.get(`${BASE}/client/logs`,           { headers: clientHeaders() }),
  toggle:         ()             => axios.post(`${BASE}/client/toggle`, {},    { headers: clientHeaders() }),
  sendReport:     ()             => axios.post(`${BASE}/client/send-report`,{},{ headers: clientHeaders() }),
  reportPreview:  ()             => axios.get(`${BASE}/client/report-preview`, { headers: clientHeaders() }),
  getPrompt:      ()             => axios.get(`${BASE}/client/prompt`,         { headers: clientHeaders() }),
  updatePrompt:   (systemPrompt) => axios.put(`${BASE}/client/prompt`, { systemPrompt }, { headers: clientHeaders() }),
  getMetaConfig:   ()             => axios.get(`${BASE}/client/meta-config`,                                         { headers: clientHeaders() }),
  saveMetaConfig:  (data)         => axios.put(`${BASE}/client/meta-config`, data,                                  { headers: clientHeaders() }),
  testMeta:        (to)           => axios.post(`${BASE}/client/meta-test`, { to },                                 { headers: clientHeaders() }),
  getClientInbox:  ()             => axios.get(`${BASE}/client/inbox`,                                              { headers: clientHeaders() }),
  sendClientMsg:   (to, text)     => axios.post(`${BASE}/client/send-message`, { to, text },                       { headers: clientHeaders() }),
  clientBotToggle: (convId)       => axios.post(`${BASE}/client/conversations/${convId}/bot-toggle`, {},            { headers: clientHeaders() }),
  clientResolve:   (convId)       => axios.post(`${BASE}/client/conversations/${convId}/resolve`, {},               { headers: clientHeaders() }),
};
