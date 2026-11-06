/**
 * DeepSeek Balance plugin — frontend entry.
 *
 * The host calls mount(container, api) when the tab is activated and
 * unmount(container) when it is torn down.
 */
// ── Constants ──────────────────────────────────────────────────────────
const MONO = "'JetBrains Mono', 'Cascadia Mono', 'Consolas', 'Courier New', ui-monospace, monospace";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const SYMBOLS = { CNY: '¥', USD: '$' };
const GMT8 = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});
function themeColors(dark) {
    return dark
        ? {
            bg: '#08080f',
            surface: '#0e0e1a',
            border: '#1a1a2c',
            text: '#e2e0f0',
            muted: '#52507a',
            accent: '#fbbf24',
        }
        : {
            bg: '#fafaf9',
            surface: '#ffffff',
            border: '#e8e6f0',
            text: '#0f0e1a',
            muted: '#9490b0',
            accent: '#d97706',
        };
}
// ── Helpers ────────────────────────────────────────────────────────────
function ensureAssets() {
    if (document.getElementById('dsb-styles'))
        return;
    const style = document.createElement('style');
    style.id = 'dsb-styles';
    style.textContent = `
    @keyframes dsb-fadeup { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
    @keyframes dsb-pulse  { 0%,100% { opacity:.35 } 50% { opacity:.65 } }
    .dsb-up   { animation: dsb-fadeup 0.4s ease both }
    .dsb-skel { animation: dsb-pulse 1.6s ease infinite }
  `;
    document.head.appendChild(style);
}
function esc(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
function symbolFor(currency) {
    return SYMBOLS[currency.toUpperCase()] ?? (currency ? `${currency} ` : '');
}
function parseAmount(value) {
    const amount = Number.parseFloat(value);
    return Number.isFinite(amount) ? amount : 0;
}
function formatMoney(currency, amount) {
    return `${symbolFor(currency)}${amount.toFixed(2)}`;
}
function formatGmt8(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
        return '';
    const parts = {};
    for (const part of GMT8.formatToParts(date))
        parts[part.type] = part.value;
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
function pickPrimary(infos) {
    return infos.find((info) => info.currency.toUpperCase() === 'CNY') ?? infos[0] ?? null;
}
function buttonStyle(c) {
    return `flex-shrink:0;margin-left:16px;padding:5px 12px;background:transparent;border:1px solid ${c.border};color:${c.muted};font-family:${MONO};font-size:0.7rem;border-radius:3px;cursor:pointer;letter-spacing:0.05em;transition:all 0.15s;`;
}
function headerHtml(c) {
    return `
    <div class="dsb-up" style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px">
      <div style="min-width:0;flex:1">
        <div style="font-size:1.3rem;font-weight:700;letter-spacing:-0.02em">
          用量信息
        </div>
        <div style="font-size:0.7rem;color:${c.muted};margin-top:4px;line-height:1.5">
          所有日期均按 GMT+8 时间显示，数据可能有 5 分钟延迟。
        </div>
      </div>
      <button id="dsb-refresh" style="${buttonStyle(c)}"
        onmouseover="this.style.borderColor='${c.accent}';this.style.color='${c.accent}'"
        onmouseout="this.style.borderColor='${c.border}';this.style.color='${c.muted}'">↻ refresh</button>
    </div>`;
}
// ── Mount / Unmount ────────────────────────────────────────────────────
export function mount(container, api) {
    ensureAssets();
    let cached = null;
    let refreshError = null;
    let inflight = false;
    let disposed = false;
    let timer = null;
    const root = document.createElement('div');
    Object.assign(root.style, {
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: '24px',
        fontFamily: MONO,
    });
    container.appendChild(root);
    function applyTheme(ctx) {
        const c = themeColors(ctx.theme === 'dark');
        root.style.background = c.bg;
        root.style.color = c.text;
        return c;
    }
    function wireButtons() {
        for (const id of ['dsb-refresh', 'dsb-retry']) {
            root.querySelector(`#${id}`)?.addEventListener('click', () => {
                void load(api.context, cached === null);
            });
        }
    }
    function renderSkeleton(ctx) {
        const c = applyTheme(ctx);
        const cards = [0, 1, 2]
            .map((i) => `
      <div style="background:${c.surface};border:1px solid ${c.border};border-radius:3px;padding:18px">
        <div class="dsb-skel" style="height:30px;width:62%;background:${c.muted};border-radius:3px;animation-delay:${i * 0.1}s"></div>
        <div class="dsb-skel" style="height:9px;width:38%;margin-top:10px;background:${c.muted};border-radius:2px;animation-delay:${i * 0.1}s"></div>
      </div>`)
            .join('');
        root.innerHTML = `
      ${headerHtml(c)}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
        ${cards}
      </div>`;
        wireButtons();
    }
    function renderError(ctx, err) {
        const c = applyTheme(ctx);
        root.innerHTML = `
      ${headerHtml(c)}
      <div class="dsb-up" style="background:${c.surface};border:1px solid ${c.border};border-radius:3px;padding:18px">
        <div style="font-size:0.78rem;color:#f43f5e;line-height:1.7;word-break:break-word">
          ✗ ${esc(err.message)}
        </div>
        <button id="dsb-retry" style="${buttonStyle(c)} margin-left:0;margin-top:14px;"
          onmouseover="this.style.borderColor='${c.accent}';this.style.color='${c.accent}'"
          onmouseout="this.style.borderColor='${c.border}';this.style.color='${c.muted}'">重试</button>
      </div>`;
        wireButtons();
    }
    function render(ctx, data, error) {
        const c = applyTheme(ctx);
        const primary = pickPrimary(data.balance_infos);
        const currency = primary?.currency || 'CNY';
        const hasBalance = primary !== null;
        const boxes = [
            ['总余额', primary ? parseAmount(primary.total_balance) : 0],
            ['充值余额', primary ? parseAmount(primary.topped_up_balance) : 0],
            ['赠送余额', primary ? parseAmount(primary.granted_balance) : 0],
        ];
        const cards = boxes
            .map(([label, value], i) => `
      <div class="dsb-up" style="background:${c.surface};border:1px solid ${c.border};border-radius:3px;padding:18px;animation-delay:${i * 0.06}s">
        <div id="dsb-m-${i}" style="font-size:1.9rem;font-weight:700;letter-spacing:-0.04em;line-height:1;color:${c.text}">
          ${hasBalance ? formatMoney(currency, value) : '—'}
        </div>
        <div style="font-size:0.65rem;color:${c.muted};margin-top:6px;letter-spacing:0.1em">${label}</div>
      </div>`)
            .join('');
        const extras = data.balance_infos.filter((info) => info !== primary);
        const extrasHtml = extras.length
            ? `
      <div style="font-size:0.68rem;color:${c.muted};margin-top:12px;line-height:1.8">
        其他币种：${extras
                .map((info) => `${esc(info.currency)} 总 ${formatMoney(info.currency, parseAmount(info.total_balance))}` +
                `（充值 ${formatMoney(info.currency, parseAmount(info.topped_up_balance))}` +
                ` / 赠送 ${formatMoney(info.currency, parseAmount(info.granted_balance))}）`)
                .join(' · ')}
      </div>`
            : '';
        const unavailableHtml = data.is_available
            ? ''
            : `
      <div class="dsb-up" style="margin-bottom:14px;padding:10px 12px;border:1px solid rgba(244,63,94,0.35);background:rgba(244,63,94,0.06);border-radius:3px;font-size:0.72rem;color:#f43f5e">
        账户余额不足，DeepSeek API 调用可能失败。
      </div>`;
        const refreshErrorHtml = error
            ? `
      <div class="dsb-up" style="margin-bottom:14px;font-size:0.7rem;color:#f43f5e;line-height:1.6">
        刷新失败：${esc(error)}
      </div>`
            : '';
        const updated = formatGmt8(data.fetched_at);
        root.innerHTML = `
      ${headerHtml(c)}
      ${unavailableHtml}
      ${refreshErrorHtml}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
        ${cards}
      </div>
      ${extrasHtml}
      ${updated ? `<div style="font-size:0.65rem;color:${c.muted};margin-top:14px;text-align:right">更新于 ${esc(updated)}（GMT+8）</div>` : ''}`;
        wireButtons();
    }
    async function load(ctx, showSkeleton) {
        if (disposed || inflight)
            return;
        inflight = true;
        if (showSkeleton || cached === null)
            renderSkeleton(ctx);
        try {
            const data = (await api.rpc('GET', 'balance'));
            if (disposed)
                return;
            cached = data;
            refreshError = null;
            render(api.context, data, null);
        }
        catch (err) {
            if (disposed)
                return;
            refreshError = err.message;
            if (cached)
                render(api.context, cached, refreshError);
            else
                renderError(api.context, err);
        }
        finally {
            inflight = false;
        }
    }
    void load(api.context, true);
    const unsubscribe = api.onContextChange((ctx) => {
        if (cached)
            render(ctx, cached, refreshError);
        else
            renderSkeleton(ctx);
    });
    timer = window.setInterval(() => {
        void load(api.context, false);
    }, REFRESH_INTERVAL_MS);
    container._dsbCleanup = () => {
        disposed = true;
        unsubscribe();
        if (timer !== null)
            window.clearInterval(timer);
        timer = null;
    };
}
export function unmount(container) {
    container._dsbCleanup?.();
    delete container._dsbCleanup;
    container.innerHTML = '';
}
//# sourceMappingURL=index.js.map