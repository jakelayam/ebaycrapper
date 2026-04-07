import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';
import Head from 'next/head';
import {
  Search, LogOut, Play, Download, ChevronDown, ChevronUp,
  FileSpreadsheet, MessageSquare, Clock, Trash2,
  Plus, BarChart3, DollarSign, TrendingDown, ExternalLink,
  Package, X, Sparkles, ArrowUpRight, SlidersHorizontal, Check, Tag
} from 'lucide-react';

const EBAY_CATEGORIES = [
  'All Categories',
  'Antiques', 'Art', 'Baby', 'Books & Magazines',
  'Business & Industrial', 'Cameras & Photo', 'Cell Phones & Accessories',
  'Clothing, Shoes & Accessories', 'Coins & Paper Money', 'Collectibles',
  'Computers/Tablets & Networking', 'Consumer Electronics', 'Crafts',
  'Dolls & Bears', 'Entertainment Memorabilia', 'Everything Else',
  'Gift Cards & Coupons', 'Health & Beauty', 'Home & Garden',
  'Jewelry & Watches', 'Movies & TV', 'Music', 'Musical Instruments & Gear',
  'Pet Supplies', 'Pottery & Glass', 'Real Estate', 'Specialty Services',
  'Sporting Goods', 'Sports Mem, Cards & Fan Shop', 'Stamps',
  'Tickets & Experiences', 'Toys & Hobbies', 'Travel', 'Video Games & Consoles',
];

function CategoryDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customCats, setCustomCats] = useState([]);
  const ref = useRef(null);

  const allCats = [...EBAY_CATEGORIES, ...customCats];
  const filtered = search ? allCats.filter(c => c.toLowerCase().includes(search.toLowerCase())) : allCats;
  const showCreate = search && !allCats.some(c => c.toLowerCase() === search.toLowerCase());

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(!open); setSearch(''); }}
        className="flex items-center gap-2 bg-dark-surface border border-dark-border hover:border-gray-600 rounded-xl text-xs text-gray-300 pl-3 pr-2 py-2.5 outline-none cursor-pointer transition-all min-w-[200px] w-full">
        <Tag className="w-3 h-3 text-gray-500 shrink-0" />
        <span className="flex-1 text-left truncate">{value}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-dark-surface border border-dark-border rounded-xl shadow-2xl shadow-black/40 overflow-hidden fade-in" style={{ minWidth: '240px' }}>
          <div className="p-2 border-b border-white/5">
            <div className="flex items-center gap-2 bg-dark-bg rounded-lg px-3 py-2">
              <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search or type custom..." autoFocus
                className="bg-transparent text-xs text-white outline-none w-full placeholder:text-gray-600" />
              {search && <button onClick={() => setSearch('')} className="text-gray-600 hover:text-gray-400"><X className="w-3 h-3" /></button>}
            </div>
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1 scrollbar-thin">
            {showCreate && (
              <button onClick={() => { setCustomCats(prev => [...prev, search.trim()]); onChange(search.trim()); setSearch(''); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-xs hover:bg-violet-500/10 transition-colors">
                <Plus className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-violet-400 font-medium">Create &quot;{search.trim()}&quot;</span>
              </button>
            )}
            {filtered.map(cat => (
              <button key={cat} onClick={() => { onChange(cat); setSearch(''); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${value === cat ? 'bg-violet-500/10 text-violet-400' : 'text-gray-300 hover:bg-white/[0.04] hover:text-white'}`}>
                <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all ${value === cat ? 'bg-violet-600 border-violet-600' : 'border-gray-600'}`}>
                  {value === cat && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="truncate">{cat}</span>
              </button>
            ))}
            {!filtered.length && !showCreate && (
              <div className="px-3 py-4 text-center text-xs text-gray-600">No categories found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULT_PRODUCTS = [
  { name: 'DDR4 32GB', query: 'DDR4 32GB RAM', maxPrice: 100, category: 'Computers/Tablets & Networking' },
  { name: 'DDR4 64GB', query: 'DDR4 64GB RAM', maxPrice: 200, category: 'Computers/Tablets & Networking' },
  { name: 'DDR4 128GB', query: 'DDR4 128GB RAM', maxPrice: 500, category: 'Computers/Tablets & Networking' },
];

export default function Dashboard() {
  const router = useRouter();
  const [sb, setSb] = useState(null);
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [lastResults, setLastResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [statusBadge, setStatusBadge] = useState('Idle');
  const [runStatus, setRunStatus] = useState('Ready to scrape');
  const [stats, setStats] = useState(null);
  const [integrations, setIntegrations] = useState({ discord: false, sheets: false });
  const [logs, setLogs] = useState([{ msg: 'Ready. Add products and hit Run.', type: 'info' }]);

  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [showAddProduct, setShowAddProduct] = useState(true);
  const [newName, setNewName] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [newMaxPrice, setNewMaxPrice] = useState(100);
  const [newCategory, setNewCategory] = useState('All Categories');

  const [showFilters, setShowFilters] = useState(true);
  const [maxPages, setMaxPages] = useState(50);
  const [condNew, setCondNew] = useState(true);
  const [condUsed, setCondUsed] = useState(true);
  const [condRefurb, setCondRefurb] = useState(true);
  const [optSheets, setOptSheets] = useState(true);
  const [optDiscord, setOptDiscord] = useState(true);
  const [excludes, setExcludes] = useState(['broken', 'for parts', 'untested', 'as-is', 'as is', 'not working', 'damaged']);
  const [newExclude, setNewExclude] = useState('');
  const [filterProduct, setFilterProduct] = useState('all');
  const logRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/config');
        const cfg = await res.json();
        if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
          const client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
          setSb(client);
          const { data: { session } } = await client.auth.getSession();
          if (!session) { router.replace('/login'); return; }
          setUser(session.user);
          setAuthToken(session.access_token);
        }
      } catch (e) {}
      try { const res = await fetch('/api/status'); setIntegrations(await res.json()); } catch (e) {}
    })();
  }, [router]);

  function log(msg, type = '') {
    setLogs(prev => [...prev, { msg: new Date().toLocaleTimeString() + '  ' + msg, type }]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
  }

  function addProduct() {
    if (!newName.trim() || !newQuery.trim()) return;
    setProducts([...products, { name: newName.trim(), query: newQuery.trim(), maxPrice: newMaxPrice, category: newCategory }]);
    log(`Added: ${newName.trim()} (< $${newMaxPrice})`, 'info');
    setNewName(''); setNewQuery(''); setNewMaxPrice(100); setNewCategory('All Categories');
  }

  function addExclude() {
    const val = newExclude.trim().toLowerCase();
    if (val && !excludes.includes(val)) setExcludes([...excludes, val]);
    setNewExclude('');
  }

  async function runScraper() {
    if (!products.length) { log('Add at least one product', 'err'); return; }
    setRunning(true); setStatusBadge('Running'); setRunStatus('Scraping eBay...');
    const conditions = [condNew && 'new', condUsed && 'used', condRefurb && 'refurbished'].filter(Boolean);
    const config = { products, conditions, excludeKeywords: excludes, maxPages, sendToSheets: optSheets, sendToDiscord: optDiscord };
    log(`Scraping ${products.length} products...`, 'info');
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
      const res = await fetch('/api/scrape', { method: 'POST', headers, body: JSON.stringify(config) });
      const data = await res.json();
      if (data.success) {
        setLastResults(data.results || []);
        setStats({ deals: data.deals, scanned: data.scanned, results: data.results || [] });
        log(`${data.deals} deals from ${data.scanned || 0} listings`, 'ok');
        if (data.sheetsStatus) log('Sheets: ' + data.sheetsStatus, data.sheetsStatus === 'sent' ? 'ok' : 'err');
        if (data.discordStatus) log('Discord: ' + data.discordStatus, data.discordStatus === 'sent' ? 'ok' : 'err');
        setStatusBadge(data.deals + ' deals'); setRunStatus(`Done — ${data.deals} deals found`);
      } else { log('Error: ' + data.error, 'err'); setStatusBadge('Error'); setRunStatus('Failed'); }
    } catch (err) { log('Request failed: ' + err.message, 'err'); setStatusBadge('Error'); }
    setRunning(false);
  }

  function exportCSV() {
    if (!lastResults.length) return;
    const h = ['Product','Category','Title','Price','Condition','Seller','Link','Timestamp'];
    const rows = lastResults.map(d => [d.product, d.category, '"' + (d.title || '').replace(/"/g, '""') + '"', d.price, d.condition, d.seller, '"' + (d.link || '') + '"', d.timestamp]);
    const blob = new Blob([[h.join(','), ...rows.map(r => r.join(','))].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'deals-' + new Date().toISOString().slice(0, 10) + '.csv' }).click();
    URL.revokeObjectURL(url);
  }

  const filteredResults = filterProduct === 'all' ? lastResults : lastResults.filter(d => d.product === filterProduct);
  const cheapest = stats?.results?.length ? '$' + Math.min(...stats.results.map(r => parseFloat(r.price))).toFixed(2) : '--';
  const productNames = [...new Set(lastResults.map(d => d.product))];

  return (
    <>
      <Head>
        <title>eBay Scraper — OpenClaw</title>
        <style>{`
          :root { --glass: rgba(255,255,255,0.03); --glass-border: rgba(255,255,255,0.06); --glow: rgba(139,92,246,0.15); }
          .glass { background: var(--glass); border: 1px solid var(--glass-border); backdrop-filter: blur(20px); }
          .glass-hover:hover { border-color: rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); }
          .glow-btn { box-shadow: 0 0 20px var(--glow), 0 4px 12px rgba(0,0,0,0.3); }
          .glow-btn:hover { box-shadow: 0 0 30px var(--glow), 0 6px 16px rgba(0,0,0,0.4); }
          .fade-in { animation: fadeIn 0.3s ease-out; }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          .stat-glow { position: relative; }
          .stat-glow::before { content: ''; position: absolute; inset: -1px; border-radius: 16px; background: linear-gradient(135deg, rgba(139,92,246,0.1), transparent); pointer-events: none; }
          .scrollbar-thin::-webkit-scrollbar { width: 4px; }
          .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
          .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
          .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
        `}</style>
      </Head>
      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6">

        {/* HEADER */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-600/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">eBay Scraper</h1>
              <p className="text-xs text-gray-500 mt-0.5">Multi-product deal hunter by OpenClaw</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 glass rounded-full px-4 py-2">
              <div className="flex items-center gap-1.5" title={integrations.discord ? 'Discord connected' : 'Discord not configured'}>
                <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
                <div className={`w-1.5 h-1.5 rounded-full ${integrations.discord ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-red-400'}`} />
              </div>
              <div className="w-px h-3 bg-gray-700" />
              <div className="flex items-center gap-1.5" title={integrations.sheets ? 'Sheets connected' : 'Sheets not configured'}>
                <FileSpreadsheet className="w-3.5 h-3.5 text-gray-500" />
                <div className={`w-1.5 h-1.5 rounded-full ${integrations.sheets ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-red-400'}`} />
              </div>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${statusBadge === 'Idle' ? 'glass text-gray-400' : statusBadge === 'Running' ? 'bg-amber-500/10 text-amber-400 animate-pulse' : statusBadge === 'Error' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{statusBadge}</div>
            {user && <button onClick={async () => { if (sb) await sb.auth.signOut(); router.push('/login'); }} className="p-2 rounded-xl glass glass-hover text-gray-500 hover:text-white transition-all"><LogOut className="w-3.5 h-3.5" /></button>}
          </div>
        </header>

        {/* PRODUCTS */}
        <section className="glass rounded-2xl p-6 mb-6 fade-in">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <Package className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-white">Products</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-semibold">{products.length}</span>
            </div>
            <button onClick={() => setShowAddProduct(!showAddProduct)}
              className="px-4 py-2 bg-violet-600/15 hover:bg-violet-600/25 text-violet-400 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border border-violet-500/20">
              {showAddProduct ? <ChevronUp className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} {showAddProduct ? 'Hide' : 'Add Product'}
            </button>
          </div>

          {/* Add product form */}
          {showAddProduct && (
            <div className="bg-dark-surface2/80 rounded-2xl p-5 mb-5 border border-dark-border fade-in">
              <div className="flex items-center gap-0 bg-dark-bg rounded-xl border border-dark-border overflow-visible mb-4">
                <div className="flex items-center gap-2 flex-1 px-4 py-3">
                  <Search className="w-4 h-4 text-gray-500 shrink-0" />
                  <input type="text" value={newQuery} onChange={e => setNewQuery(e.target.value)}
                    onBlur={() => { if (!newName && newQuery) setNewName(newQuery); }}
                    placeholder="Search eBay for anything..."
                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-600" />
                </div>
                <div className="border-l border-dark-border">
                  <CategoryDropdown value={newCategory} onChange={setNewCategory} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1.5 font-bold">Display Name</label>
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Better Pack 555"
                    className="w-full px-3 py-2.5 bg-dark-bg border border-dark-border rounded-xl text-sm text-white outline-none focus:border-violet-500 transition-colors" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1.5 font-bold">Max Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">$</span>
                    <input type="number" value={newMaxPrice} onChange={e => setNewMaxPrice(parseInt(e.target.value) || 0)} min={1}
                      className="w-full pl-7 pr-3 py-2.5 bg-dark-bg border border-dark-border rounded-xl text-sm text-white outline-none focus:border-violet-500 transition-colors" />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <button onClick={addProduct} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold transition-all glow-btn">Add</button>
                </div>
              </div>
            </div>
          )}

          {/* Product list */}
          <div className="space-y-2">
            {products.map((p, i) => (
              <div key={i} className="flex items-center justify-between bg-dark-bg/50 hover:bg-dark-surface2/80 rounded-xl px-5 py-3.5 group transition-all border border-transparent hover:border-dark-border">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-white">{p.name}</span>
                  <span className="text-[11px] text-gray-600 bg-dark-surface2 px-2 py-0.5 rounded-md">{p.category}</span>
                  <span className="text-[11px] text-gray-600 italic hidden sm:inline">&quot;{p.query}&quot;</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-emerald-400">&lt; ${p.maxPrice}</span>
                  <button onClick={() => { setProducts(products.filter((_, j) => j !== i)); log(`Removed: ${p.name}`, 'info'); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all"><X className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
            {!products.length && <div className="text-center py-10 text-gray-600 text-sm">No products yet. Click <strong className="text-violet-400">Add Product</strong> above.</div>}
          </div>
        </section>

        {/* RUN */}
        <section className="glass rounded-2xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <button onClick={runScraper} disabled={running || !products.length}
              className="px-10 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center gap-2.5 text-sm glow-btn">
              {running ? <><Clock className="w-4 h-4 animate-spin" /> Scraping...</> : <><Play className="w-4 h-4" /> Run Scraper</>}
            </button>
            <div className="flex-1">
              <p className="text-sm text-gray-300 font-medium">{runStatus}</p>
              <p className="text-[11px] text-gray-600 mt-0.5">{products.length} product{products.length !== 1 ? 's' : ''} | {[condNew && 'New', condUsed && 'Used', condRefurb && 'Refurb'].filter(Boolean).join(', ')} | Max {maxPages} pages</p>
            </div>
            {lastResults.length > 0 && (
              <button onClick={exportCSV} className="px-4 py-2.5 glass glass-hover rounded-xl text-xs text-gray-400 hover:text-white transition-all flex items-center gap-1.5 font-medium">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            )}
          </div>
          {running && <div className="h-1 bg-dark-surface2 rounded-full overflow-hidden mt-5"><div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full animate-pulse" style={{ width: '80%' }} /></div>}
        </section>

        {/* STATS */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-6 fade-in">
            {[
              { v: stats.deals, l: 'Deals Found', c: 'text-emerald-400', icon: TrendingDown },
              { v: stats.scanned || 0, l: 'Scanned', c: 'text-blue-400', icon: BarChart3 },
              { v: cheapest, l: 'Best Price', c: 'text-violet-400', icon: DollarSign },
            ].map((s, i) => (
              <div key={i} className="stat-glow glass rounded-2xl p-5 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-2 ${s.c} opacity-70`} />
                <div className={`text-2xl font-bold ${s.c} tracking-tight`}>{s.v}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1 font-semibold">{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* RESULTS */}
        {lastResults.length > 0 ? (
          <section className="glass rounded-2xl mb-6 overflow-hidden fade-in">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-sm font-semibold text-white">{filteredResults.length} Deals</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setFilterProduct('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterProduct === 'all' ? 'bg-violet-600/20 text-violet-400 border border-violet-500/20' : 'text-gray-500 hover:text-gray-300 border border-transparent'}`}>All</button>
                {productNames.map(name => (
                  <button key={name} onClick={() => setFilterProduct(name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterProduct === name ? 'bg-violet-600/20 text-violet-400 border border-violet-500/20' : 'text-gray-500 hover:text-gray-300 border border-transparent'}`}>{name}</button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.02] sticky top-0 z-10 backdrop-blur-sm">
                    {['Product', 'Title', 'Price', 'Condition', ''].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((d, i) => {
                    const hasLink = d.link && d.link !== 'N/A';
                    const title = d.title?.length > 65 ? d.title.substring(0, 62) + '...' : d.title;
                    const condColor = (d.condition || '').toLowerCase().includes('new') && !(d.condition || '').toLowerCase().includes('pre-owned') ? 'text-emerald-400 bg-emerald-500/10' : (d.condition || '').toLowerCase().includes('refurb') ? 'text-amber-400 bg-amber-500/10' : 'text-blue-400 bg-blue-500/10';
                    return (
                      <tr key={i} className="hover:bg-white/[0.02] border-t border-white/[0.03] transition-colors group">
                        <td className="px-5 py-3.5"><span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/10">{d.product}</span></td>
                        <td className="px-5 py-3.5 max-w-[380px]">
                          {hasLink ? <a href={d.link} target="_blank" rel="noreferrer" className="text-gray-200 hover:text-violet-400 transition-colors group-hover:underline decoration-violet-500/30 underline-offset-2" title={d.title}>{title}</a> : <span className="text-gray-400">{title}</span>}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-emerald-400 whitespace-nowrap text-base">${d.price}</td>
                        <td className="px-5 py-3.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${condColor}`}>{d.condition || 'N/A'}</span></td>
                        <td className="px-5 py-3.5">{hasLink && <a href={d.link} target="_blank" rel="noreferrer" className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-violet-400 transition-all"><ArrowUpRight className="w-3.5 h-3.5" /></a>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : !stats ? (
          <section className="glass rounded-2xl p-20 mb-6 text-center fade-in">
            <div className="w-16 h-16 rounded-2xl bg-violet-600/10 flex items-center justify-center mx-auto mb-4">
              <Search className="w-7 h-7 text-violet-400/40" />
            </div>
            <p className="text-gray-500 text-sm">Add products and hit <strong className="text-violet-400">Run Scraper</strong> to find deals.</p>
          </section>
        ) : null}

        {/* FILTERS & SETTINGS */}
        <button onClick={() => setShowFilters(!showFilters)}
          className="w-full glass glass-hover rounded-2xl px-6 py-4 mb-3 flex items-center justify-between transition-all">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-300">Filters & Settings</span>
          </div>
          {showFilters ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>
        {showFilters && (
          <div className="glass rounded-2xl p-6 mb-3 space-y-6 fade-in">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Conditions</h3>
                <div className="flex gap-4">
                  {[[condNew, setCondNew, 'New'], [condUsed, setCondUsed, 'Used'], [condRefurb, setCondRefurb, 'Refurb']].map(([v, s, l]) => (
                    <label key={l} className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                      <input type="checkbox" checked={v} onChange={e => s(e.target.checked)} className="w-4 h-4 accent-violet-500 rounded" /> <span className="text-gray-300">{l}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Output</h3>
                <div className="flex gap-5">
                  {[[optSheets, setOptSheets, 'Sheets', FileSpreadsheet], [optDiscord, setOptDiscord, 'Discord', MessageSquare]].map(([v, s, l, Icon], i) => (
                    <label key={i} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                      <input type="checkbox" checked={v} onChange={e => s(e.target.checked)} className="w-4 h-4 accent-violet-500 rounded" />
                      <Icon className="w-3.5 h-3.5 text-gray-500" /> <span className="text-gray-300">{l}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Exclude Keywords</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {excludes.map((kw, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/15">
                    {kw} <button onClick={() => setExcludes(excludes.filter((_, j) => j !== i))} className="opacity-40 hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newExclude} onChange={e => setNewExclude(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExclude()} placeholder="Add keyword..."
                  className="px-3 py-2 bg-dark-bg border border-dark-border rounded-xl text-xs text-gray-200 outline-none focus:border-violet-500 w-44 transition-colors" />
                <button onClick={addExclude} className="px-3 py-2 glass glass-hover rounded-xl text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-all"><Plus className="w-3 h-3" /> Add</button>
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Max Pages per Product</h3>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={100} value={maxPages} onChange={e => setMaxPages(parseInt(e.target.value))} className="flex-1 accent-violet-500 h-1" />
                <span className="text-sm font-bold text-gray-300 min-w-[40px] text-right">{maxPages}</span>
              </div>
            </div>
          </div>
        )}

        {/* LOG */}
        <div className="glass rounded-2xl overflow-hidden mt-3">
          <div className="px-6 py-3 border-b border-white/5">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Activity Log</h2>
          </div>
          <div ref={logRef} className="px-5 py-3 font-mono text-[11px] max-h-32 overflow-y-auto space-y-0.5 scrollbar-thin">
            {logs.map((l, i) => (
              <div key={i} className={l.type === 'ok' ? 'text-emerald-400' : l.type === 'err' ? 'text-red-400' : l.type === 'info' ? 'text-blue-400/70' : 'text-gray-600'}>{l.msg}</div>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-700 mt-8 font-medium tracking-wide">OpenClaw eBay Scraper v3.0</p>
      </div>
    </>
  );
}
