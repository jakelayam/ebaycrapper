import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';
import Head from 'next/head';
import {
  Search, LogOut, Play, Download, ChevronRight, Settings, Zap,
  Filter, Bell, FileSpreadsheet, MessageSquare, Clock, Trash2,
  Plus, BarChart3, DollarSign, Cpu, TrendingDown, ExternalLink
} from 'lucide-react';

export default function Dashboard() {
  const router = useRouter();
  const [sb, setSb] = useState(null);
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [lastResults, setLastResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [statusBadge, setStatusBadge] = useState('Idle');
  const [runStatus, setRunStatus] = useState('Configure thresholds & filters, then hit Run');
  const [stats, setStats] = useState(null);
  const [integrations, setIntegrations] = useState({ discord: false, sheets: false });
  const [logs, setLogs] = useState([{ msg: 'Ready. Configure settings and run the scraper.', type: 'info' }]);
  const [pipelineOpen, setPipelineOpen] = useState(true);

  // Config
  const [maxPages, setMaxPages] = useState(10);
  const [condNew, setCondNew] = useState(true);
  const [condUsed, setCondUsed] = useState(true);
  const [condRefurb, setCondRefurb] = useState(true);
  const [optSheets, setOptSheets] = useState(true);
  const [optDiscord, setOptDiscord] = useState(true);
  const [excludes, setExcludes] = useState([]);
  const [newExclude, setNewExclude] = useState('');
  const [searchQueries, setSearchQueries] = useState([
    { query: 'DDR4 32GB', maxPrice: 100, type: 'ram' },
    { query: 'DDR4 64GB', maxPrice: 200, type: 'ram' },
    { query: 'DDR4 128GB', maxPrice: 500, type: 'ram' },
  ]);
  const [newQuery, setNewQuery] = useState('');
  const [newMaxPrice, setNewMaxPrice] = useState(100);
  const [newType, setNewType] = useState('general');

  const logRef = useRef(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load auth + saved settings on mount
  useEffect(() => {
    (async () => {
      let token = null;
      try {
        const res = await fetch('/api/config');
        const cfg = await res.json();
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
        const client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        setSb(client);
        const { data: { session } } = await client.auth.getSession();
        if (!session) { router.replace('/login'); return; }
        setUser(session.user);
        setAuthToken(session.access_token);
        token = session.access_token;
      } catch (e) { /* skip auth in dev */ }

      // Load saved settings
      if (token) {
        try {
          const res = await fetch('/api/settings', { headers: { Authorization: 'Bearer ' + token } });
          const data = await res.json();
          if (data.settings) {
            const s = data.settings;
            if (s.conditions) {
              setCondNew(s.conditions.includes('new'));
              setCondUsed(s.conditions.includes('used'));
              setCondRefurb(s.conditions.includes('refurbished'));
            }
            if (s.exclude_keywords) setExcludes(s.exclude_keywords);
            if (s.search_queries && s.search_queries.length > 0) setSearchQueries(s.search_queries);
            if (s.max_pages != null) setMaxPages(s.max_pages);
            if (s.send_to_sheets != null) setOptSheets(s.send_to_sheets);
            if (s.send_to_discord != null) setOptDiscord(s.send_to_discord);
          }
        } catch (e) {}
      }
      setSettingsLoaded(true);

      // Check integrations
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        setIntegrations(data);
      } catch (e) {}

      // Load latest scrape results from Supabase
      loadResults();
    })();
  }, [router]);

  // Auto-save settings to Supabase when they change
  useEffect(() => {
    if (!settingsLoaded || !authToken) return;
    const timeout = setTimeout(() => {
      const conditions = [];
      if (condNew) conditions.push('new');
      if (condUsed) conditions.push('used');
      if (condRefurb) conditions.push('refurbished');

      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken },
        body: JSON.stringify({
          conditions, excludeKeywords: excludes, searchQueries,
          maxPages, sendToSheets: optSheets, sendToDiscord: optDiscord,
        }),
      }).catch(() => {});
    }, 1000);
    return () => clearTimeout(timeout);
  }, [maxPages, condNew, condUsed, condRefurb, optSheets, optDiscord, excludes, searchQueries, authToken, settingsLoaded]);

  async function loadResults() {
    try {
      const res = await fetch('/api/results');
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        setLastResults(data.results);
        setStats({ deals: data.deals, scanned: data.scanned, results: data.results });
        const time = new Date(data.timestamp).toLocaleTimeString();
        setStatusBadge(data.deals + ' deals');
        setRunStatus('Last scrape: ' + data.deals + ' deals at ' + time);
      }
    } catch (e) {}
  }

  function log(msg, type = '') {
    setLogs(prev => [...prev, { msg: new Date().toLocaleTimeString() + '  ' + msg, type }]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
  }

  function addExclude() {
    const val = newExclude.trim().toLowerCase();
    if (val && !excludes.includes(val)) { setExcludes([...excludes, val]); log('Added exclusion: "' + val + '"', 'info'); }
    setNewExclude('');
  }

  function removeExclude(idx) {
    const removed = excludes[idx];
    setExcludes(excludes.filter((_, i) => i !== idx));
    log('Removed exclusion: "' + removed + '"', 'info');
  }

  async function runScraper() {
    setRunning(true); setStatusBadge('Running'); setRunStatus('Triggering GitHub Actions...');
    log('Triggering GitHub Actions workflow (uses Chrome, bypasses eBay blocking)...', 'info');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
      const res = await fetch('/api/trigger', { method: 'POST', headers });
      const data = await res.json();
      if (!data.success) {
        log('Trigger failed: ' + data.error, 'err');
        setStatusBadge('Error'); setRunStatus('Failed to trigger');
        setRunning(false);
        return;
      }
      log('Workflow triggered! Polling for completion...', 'ok');
      setRunStatus('Scraping on GitHub Actions... check Discord in ~5 min');

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await fetch('/api/workflow-status');
          const status = await statusRes.json();
          if (status.status === 'completed') {
            clearInterval(poll);
            if (status.conclusion === 'success') {
              log('Scrape completed! Loading results...', 'ok');
              await loadResults();
              log('Results loaded. Also sent to Discord.', 'ok');
            } else {
              log('Workflow failed: ' + status.conclusion, 'err');
              setStatusBadge('Failed'); setRunStatus('Workflow failed');
            }
            setRunning(false);
          } else if (attempts >= 40) {
            clearInterval(poll);
            log('Still running after 10 min. Check GitHub Actions.', 'info');
            setRunning(false);
          } else {
            setRunStatus('Running on GitHub Actions... (' + (attempts * 15) + 's)');
          }
        } catch (e) {}
      }, 15000);
    } catch (err) {
      log('Trigger error: ' + err.message, 'err');
      setStatusBadge('Error');
      setRunning(false);
    }
  }

  function exportCSV() {
    if (!lastResults.length) return;
    const headers = ['Search','Title','Price','Max Price','Type','Condition','Seller','Link','Timestamp'];
    const rows = lastResults.map(d => [d.searchQuery, '"' + (d.title || '').replace(/"/g, '""') + '"', d.price, d.maxPrice, d.type, d.condition, d.seller, '"' + (d.link || '') + '"', d.timestamp]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ddr4-deals-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
    URL.revokeObjectURL(url);
    log('Exported ' + lastResults.length + ' deals to CSV', 'ok');
  }

  async function handleLogout() {
    if (sb) await sb.auth.signOut();
    router.push('/login');
  }

  const cheapest = stats?.results?.length ? '$' + Math.min(...stats.results.map(r => parseFloat(r.price))).toFixed(2) : '--';
  const productCount = stats?.results?.length ? new Set(stats.results.map(r => r.searchQuery)).size : 0;

  const Badge = ({ ok, label }) => (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wide ${ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{label}</span>
  );

  return (
    <>
      <Head><title>eBay DDR4 RAM Scraper</title></Head>
      <div className="max-w-7xl mx-auto p-6">

        {/* Header */}
        <header className="flex items-center justify-between py-5 border-b border-dark-border mb-7 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2"><Search className="w-5 h-5 text-violet-400" /> eBay DDR4 RAM Scraper</h1>
            <p className="text-xs text-gray-500 mt-0.5">Automated deal hunter — scrape, filter, alert</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-blue-500/15 text-blue-400">DDR4 Only</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-blue-500/15 text-blue-400">Buy It Now</span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${statusBadge === 'Idle' ? 'bg-red-500/15 text-red-400' : statusBadge === 'Running' ? 'bg-yellow-500/15 text-yellow-400' : statusBadge === 'Error' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{statusBadge}</span>
            {user && <span className="text-xs text-gray-500 ml-2">{user.email}</span>}
            <button onClick={handleLogout} className="ml-1 p-1.5 rounded-lg border border-dark-border text-gray-500 hover:text-white hover:border-gray-500 transition-colors"><LogOut className="w-3.5 h-3.5" /></button>
          </div>
        </header>

        {/* Pipeline */}
        <div className="bg-dark-surface border border-dark-border rounded-xl p-6 mb-5">
          <button onClick={() => setPipelineOpen(!pipelineOpen)} className="flex items-center justify-between w-full text-left">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Logic Flow — How It Works</h2>
            <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${pipelineOpen ? 'rotate-90' : ''}`} />
          </button>
          {pipelineOpen && (
            <div className="mt-4">
              <div className="flex gap-0 overflow-x-auto">
                {[
                  { n: 'Step 1', t: 'Scrape eBay', d: 'Search DDR4 32/64/128GB, sorted lowest price', icon: Search },
                  { n: 'Step 2', t: 'Parse Listings', d: 'Extract title, price, condition. Detect multi-stick kits', icon: Cpu },
                  { n: 'Step 3', t: 'Calculate Cost', d: 'Per-stick = total / sticks. 4x16GB = 64GB total', icon: DollarSign },
                  { n: 'Step 4', t: 'Filter & Sort', d: 'Threshold, excludes, reject auctions. Cheapest first', icon: Filter },
                  { n: 'Step 5', t: 'Alert & Log', d: 'Discord #ddr4-ram + Google Sheets auto-log', icon: Bell },
                ].map((step, i) => (
                  <div key={i} className="flex items-stretch">
                    <div className="min-w-[140px] bg-dark-surface2 rounded-lg p-3.5 text-center">
                      <step.icon className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                      <div className="text-[10px] text-violet-400 font-bold uppercase tracking-wider">{step.n}</div>
                      <div className="text-xs font-semibold mt-0.5">{step.t}</div>
                      <div className="text-[10px] text-gray-500 mt-1 leading-tight">{step.d}</div>
                    </div>
                    {i < 4 && <div className="flex items-center px-1.5 text-dark-border">&rarr;</div>}
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-dark-surface2 rounded-lg text-xs">
                <span className="text-violet-400 font-semibold">Multi-Lot Example:</span>
                <span className="text-gray-500 ml-2">&quot;4x16GB DDR4 Kit&quot; at </span><span className="text-emerald-400">$600</span>
                <span className="text-gray-500"> → 4 sticks × 16GB = 64GB → $600/4 = </span><span className="text-emerald-400 font-semibold">$150/stick</span>
                <span className="text-gray-500"> &lt; $200 = </span><span className="text-emerald-400">DEAL</span>
              </div>
            </div>
          )}
        </div>

        {/* Config Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          {/* Products to Search */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2"><Search className="w-3.5 h-3.5" /> Products to Search</h2>
            <div className="space-y-2 mb-4">
              {searchQueries.map((sq, i) => (
                <div key={i} className="flex items-center gap-2 bg-dark-surface2 rounded-lg px-3 py-2.5">
                  <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  <span className="flex-1 text-sm text-white font-medium">{sq.query}</span>
                  <span className="text-xs text-emerald-400 font-semibold whitespace-nowrap">&lt; ${sq.maxPrice}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${sq.type === 'ram' ? 'bg-violet-500/15 text-violet-400' : 'bg-blue-500/15 text-blue-400'}`}>{sq.type === 'ram' ? 'RAM ($/stick)' : 'General'}</span>
                  <button onClick={() => setSearchQueries(searchQueries.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="bg-dark-surface2 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-gray-400 mb-3">Add New Product</h3>
              <div className="space-y-2">
                <input type="text" value={newQuery} onChange={e => setNewQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newQuery.trim()) { setSearchQueries([...searchQueries, { query: newQuery.trim(), maxPrice: newMaxPrice, type: newType }]); setNewQuery(''); } }}
                  placeholder="Search eBay for anything... e.g. Better Pack 555"
                  className="w-full px-3 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-sm text-white outline-none focus:border-violet-500 placeholder:text-gray-600" />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider">Max Price ($)</label>
                    <input type="number" value={newMaxPrice} onChange={e => setNewMaxPrice(parseInt(e.target.value) || 0)} min={1}
                      className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white outline-none focus:border-violet-500 mt-1" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider">Type</label>
                    <select value={newType} onChange={e => setNewType(e.target.value)}
                      className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-white outline-none focus:border-violet-500 mt-1">
                      <option value="general">General (total price)</option>
                      <option value="ram">RAM (per-stick price)</option>
                    </select>
                  </div>
                </div>
                <button onClick={() => { if (newQuery.trim()) { setSearchQueries([...searchQueries, { query: newQuery.trim(), maxPrice: newMaxPrice, type: newType }]); setNewQuery(''); } }}
                  className="w-full py-2.5 bg-violet-600/15 hover:bg-violet-600/25 text-violet-400 rounded-lg text-sm font-semibold border border-violet-500/20 flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" /> Add Product</button>
              </div>
            </div>
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Pages to Scan</h3>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={20} value={maxPages} onChange={e => setMaxPages(parseInt(e.target.value))} className="flex-1 accent-violet-500" />
                <span className="text-sm font-semibold min-w-[70px]">{maxPages} pages</span>
              </div>
              <p className="text-[10px] text-gray-600 mt-1">~60 listings/page per product. Auto-stops when prices exceed max.</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2"><Filter className="w-3.5 h-3.5" /> Filters & Exclusions</h2>
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Conditions</h3>
              <div className="flex gap-4">
                {[[condNew, setCondNew, 'New'], [condUsed, setCondUsed, 'Used'], [condRefurb, setCondRefurb, 'Refurbished']].map(([v, s, l]) => (
                  <label key={l} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={v} onChange={e => s(e.target.checked)} className="w-4 h-4 accent-violet-500" /> {l}
                  </label>
                ))}
              </div>
            </div>
            <div className="border-t border-dark-border pt-4 mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Exclude Keywords</h3>
              <div className="flex flex-wrap gap-2 mb-2">
                {excludes.map((kw, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/25">
                    {kw} <button onClick={() => removeExclude(i)} className="opacity-60 hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newExclude} onChange={e => setNewExclude(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExclude()} placeholder="Add keyword..."
                  className="px-3 py-1.5 bg-dark-bg border border-dashed border-dark-border rounded-lg text-xs text-gray-200 outline-none focus:border-violet-500 w-32" />
                <button onClick={addExclude} className="px-3 py-1.5 bg-dark-surface2 border border-dark-border rounded-lg text-xs text-gray-500 hover:text-white flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
              </div>
            </div>
            <div className="border-t border-dark-border pt-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">RAM Type</h3>
              <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/25">DDR4 Only</span>
              <p className="text-[10px] text-gray-600 mt-2">DDR3, DDR5, GDDR, Optane auto-excluded</p>
            </div>
          </div>
        </div>

        {/* Integrations + Output */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2"><Zap className="w-3.5 h-3.5" /> Integrations</h2>
            {[{ icon: MessageSquare, name: 'Discord Webhook', sub: '#ddr4-ram', ok: integrations.discord },
              { icon: FileSpreadsheet, name: 'Google Sheets', ok: integrations.sheets },
            ].map((int, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-dark-border last:border-0">
                <div className="flex items-center gap-2.5 text-sm font-medium">
                  <div className={`w-2 h-2 rounded-full ${int.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <int.icon className="w-4 h-4 text-gray-500" /> {int.name}
                  {int.sub && <span className="text-[10px] text-gray-600">{int.sub}</span>}
                </div>
                <Badge ok={int.ok} label={int.ok ? 'Connected' : 'Not configured'} />
              </div>
            ))}
          </div>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2"><Settings className="w-3.5 h-3.5" /> Output Options</h2>
            {[[optSheets, setOptSheets, 'Log new listings to Google Sheets', FileSpreadsheet],
              [optDiscord, setOptDiscord, 'Send Discord alerts per item', MessageSquare]].map(([v, s, l, Icon], i) => (
              <label key={i} className="flex items-center gap-3 py-2 text-sm cursor-pointer">
                <input type="checkbox" checked={v} onChange={e => s(e.target.checked)} className="w-4 h-4 accent-violet-500" />
                <Icon className="w-4 h-4 text-gray-500" /> {l}
              </label>
            ))}
          </div>
        </div>

        {/* Run */}
        <div className="bg-dark-surface border border-dark-border rounded-xl p-6 mb-5">
          <div className="flex items-center gap-4 mb-3">
            <button onClick={runScraper} disabled={running}
              className="px-8 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center gap-2">
              {running ? <><Clock className="w-4 h-4 animate-spin" /> Scraping...</> : <><Play className="w-4 h-4" /> Run Scraper</>}
            </button>
            <span className="text-sm text-gray-500">{runStatus}</span>
          </div>
          {running && <div className="h-1 bg-dark-surface2 rounded-full overflow-hidden"><div className="h-full bg-violet-500 rounded-full animate-pulse" style={{ width: '80%' }} /></div>}
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {[{ v: stats.deals, l: 'Deals Found', c: 'text-emerald-400', icon: TrendingDown },
              { v: stats.scanned || 0, l: 'Listings Scanned', c: 'text-blue-400', icon: BarChart3 },
              { v: cheapest, l: 'Best Price', c: 'text-violet-400', icon: DollarSign },
              { v: productCount, l: 'Products', c: 'text-yellow-400', icon: Cpu }].map((s, i) => (
              <div key={i} className="bg-dark-surface2 rounded-lg p-4 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.c}`} />
                <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {lastResults.length > 0 ? (
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 mb-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Results</h2>
                <div className="text-2xl font-bold">{lastResults.length} <span className="text-sm text-gray-500 font-normal">deals found</span></div>
              </div>
              <button onClick={exportCSV} className="px-3 py-1.5 border border-dark-border rounded-lg text-xs text-gray-500 hover:text-white hover:border-gray-500 transition-colors flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-dark-border max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-dark-surface2 sticky top-0 z-10">
                    {['Product', 'Title', 'Price', 'Condition', 'Link'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lastResults.map((d, i) => {
                    const condColor = (d.condition || '').toLowerCase().includes('new') && !(d.condition || '').toLowerCase().includes('pre-owned') ? 'bg-emerald-500/10 text-emerald-400' : (d.condition || '').toLowerCase().includes('refurb') ? 'bg-yellow-500/10 text-yellow-400' : 'bg-blue-500/10 text-blue-400';
                    const hasLink = d.link && d.link !== 'N/A';
                    const title = d.title?.length > 70 ? d.title.substring(0, 70) + '...' : d.title;
                    const priceLabel = d.type === 'ram' && d.stickCount > 1 ? `$${d.price} ($${d.perStickCost}/stick × ${d.stickCount})` : `$${d.price}`;
                    return (
                      <tr key={i} className="hover:bg-violet-500/[0.03] border-t border-dark-border">
                        <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-500/15 text-violet-400">{d.searchQuery || d.capacity || '?'}</span></td>
                        <td className="px-3 py-2.5 max-w-[350px] truncate">{hasLink ? <a href={d.link} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline" title={d.title}>{title}</a> : title}</td>
                        <td className="px-3 py-2.5 text-emerald-400 font-semibold whitespace-nowrap">{priceLabel}</td>
                        <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${condColor}`}>{d.condition || 'N/A'}</span></td>
                        <td className="px-3 py-2.5">{hasLink ? <a href={d.link} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex items-center gap-1 text-xs">View <ExternalLink className="w-3 h-3" /></a> : 'N/A'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-dark-surface border border-dark-border rounded-xl p-12 mb-5 text-center text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No results yet. Configure your settings and hit <strong className="text-gray-300">Run Scraper</strong>.</p>
          </div>
        )}

        {/* Log */}
        <div className="bg-dark-surface border border-dark-border rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Activity Log</h2>
          <div ref={logRef} className="bg-dark-bg border border-dark-border rounded-lg p-3 font-mono text-xs max-h-44 overflow-y-auto space-y-0.5">
            {logs.map((l, i) => (
              <div key={i} className={l.type === 'ok' ? 'text-emerald-400' : l.type === 'err' ? 'text-red-400' : l.type === 'info' ? 'text-blue-400' : 'text-gray-500'}>{l.msg}</div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
