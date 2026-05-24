import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '';

function headers() {
  return { 'x-admin-token': localStorage.getItem('adminToken') || '' };
}

function clientHeaders() {
  return { 'x-client-token': localStorage.getItem('clientToken') || '' };
}

const get  = (url, cfg) => axios.get(url, cfg).then(r => r.data);
const post = (url, d, cfg) => axios.post(url, d, cfg).then(r => r.data);
const put  = (url, d, cfg) => axios.put(url, d, cfg).then(r => r.data);
const del  = (url, cfg) => axios.delete(url, cfg).then(r => r.data);

export const api = {
  getClients:      ()            => get(`${BASE}/admin/clients`,                              { headers: headers() }).then(d => d.clients || d),
  addClient:       (data)        => post(`${BASE}/admin/clients`, data,                       { headers: headers() }),
  updateClient:    (id, d)       => put(`${BASE}/admin/clients/${id}`, d,                    { headers: headers() }),
  deleteClient:    (id)          => del(`${BASE}/admin/clients/${id}`,                        { headers: headers() }),
  toggleClient:    (id)          => post(`${BASE}/admin/clients/${id}/toggle`, {},            { headers: headers() }),
  getLogs:         (id)          => get(`${BASE}/admin/clients/${id}/logs`,                   { headers: headers() }),
  connectWA:       (id, phone)   => post(`${BASE}/admin/clients/${id}/connect`, phone ? { phoneNumber: phone } : {}, { headers: headers() }),
  disconnectWA:    (id)          => post(`${BASE}/admin/clients/${id}/disconnect`, {},        { headers: headers() }),
  getQR:           (id)          => get(`${BASE}/admin/clients/${id}/qr`,                    { headers: headers() }),
  sendReport:      (id)          => post(`${BASE}/admin/clients/${id}/send-report`, {},       { headers: headers() }),
  previewReport:   (id)          => get(`${BASE}/admin/clients/${id}/preview-report`,        { headers: headers() }),
  getApiCreds:     (id)          => get(`${BASE}/admin/clients/${id}/api-credentials`,       { headers: headers() }),
  regenApiKey:     (id)          => post(`${BASE}/admin/clients/${id}/regen-apikey`, {},      { headers: headers() }),
  updateWebhook:   (id, url)     => put(`${BASE}/admin/clients/${id}`, { webhookUrl: url },  { headers: headers() }),
  getConversations:(id)          => get(`${BASE}/admin/clients/${id}/logs`,                   { headers: headers() }).then(d => d.logs || d.conversations || d),
  sendMessage:     (id, to, text)=> post(`${BASE}/admin/clients/${id}/send-message`, { to, text }, { headers: headers() }),
  toggleBot:       (id, convId)  => post(`${BASE}/admin/clients/${id}/conversations/${convId}/bot-toggle`, {}, { headers: headers() }),
  resolveConversation:(id, convId)=> post(`${BASE}/admin/clients/${id}/conversations/${convId}/resolve`, {}, { headers: headers() }),
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
  getWAStatus:     ()             => axios.get(`${BASE}/client/wa-status`,                                         { headers: clientHeaders() }),
  connectWA:       (phone)        => axios.post(`${BASE}/client/wa-connect`, phone ? { phone } : {},               { headers: clientHeaders() }),
  disconnectWA:    ()             => axios.post(`${BASE}/client/wa-disconnect`, {},                                 { headers: clientHeaders() }),
};
