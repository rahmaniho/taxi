/* ==========================================================================
 * js/components/chart.js — نمودارهای SVG سبک (بدون Chart.js و CDN)
 * --------------------------------------------------------------------------
 * دلیل تصمیم: نسخه دمو Chart.js را از CDN می‌گرفت که در حالت آفلاین PWA و
 * نصب‌شده روی موبایل از کار می‌افتاد. این پیاده‌سازی سبک (۱۰ کیلوبایت، صفر
 * وابستگی) همان نیازها را با SVG پاسخ می‌دهد: میله‌ای، گروهی، خطی و دایره‌ای.
 * ========================================================================== */

import { formatNumber, toFa, escapeHTML } from '../utils.js';
import { icon } from './icons.js';

const W = 640;
const H = 260;
const PAD = { top: 18, right: 46, bottom: 34, left: 12 };

let _tipEl = null;

function tip() {
    if (_tipEl && document.body.contains(_tipEl)) return _tipEl;
    _tipEl = document.createElement('div');
    _tipEl.className = 'chart-tip';
    document.body.appendChild(_tipEl);
    document.addEventListener('mousemove', (e) => {
        if (_tipEl.style.display !== 'block') return;
        const pad = 14;
        _tipEl.style.left = Math.min(e.clientX + pad, window.innerWidth - _tipEl.offsetWidth - 8) + 'px';
        _tipEl.style.top = Math.max(e.clientY - 38, 8) + 'px';
    });
    return _tipEl;
}

function compact(n) {
    const a = Math.abs(Number(n) || 0);
    if (a >= 1e9) return toFa((n / 1e9).toFixed(1)) + 'میلیارد';
    if (a >= 1e6) return toFa((n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)) + 'م';
    if (a >= 1e3) return toFa(Math.round(n / 1e3)) + 'هزار';
    return toFa(Math.round(n));
}

function resolve(elOrId) {
    return typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
}

function niceMax(max) {
    if (max <= 0) return 10;
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    const n = max / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
}

function emptyHTML(text) {
    return `<div class="chart-empty">${icon('bar-chart', 'icon-xl')}<span>${escapeHTML(text || 'داده‌ای برای نمایش نیست')}</span></div>`;
}

function attachTips(host) {
    host.querySelectorAll('[data-tip]').forEach((n) => {
        n.addEventListener('mouseenter', () => {
            const t = tip();
            t.textContent = n.dataset.tip;
            t.style.display = 'block';
        });
        n.addEventListener('mouseleave', () => {
            tip().style.display = 'none';
        });
    });
}

function svgWrap(inner, height) {
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" style="height:${height || '100%'}">${inner}</svg>`;
}

export const Charts = {
    /** نمودار میله‌ای ساده */
    bar(el, { labels = [], data = [], label = '', color = '#D4AF37', emptyText = '' } = {}) {
        const host = resolve(el);
        if (!host) return;
        if (!data.length || data.every((d) => !d)) {
            host.innerHTML = emptyHTML(emptyText);
            return;
        }
        const max = niceMax(Math.max(...data, 1));
        const plotW = W - PAD.left - PAD.right;
        const plotH = H - PAD.top - PAD.bottom;
        const stepX = plotW / data.length;
        const barW = Math.min(46, stepX * 0.62);

        const grid = [0, 0.25, 0.5, 0.75, 1].map((r) => {
            const y = PAD.top + plotH - plotH * r;
            return `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="3 4"/>
                    <text x="${W - PAD.right + 6}" y="${y + 4}" font-size="11" fill="currentColor" fill-opacity="0.55">${compact(max * r)}</text>`;
        }).join('');

        const bars = data.map((v, i) => {
            const h = Math.max(2, (v / max) * plotH);
            const x = W - PAD.right - (i + 1) * stepX + (stepX - barW) / 2;
            const y = PAD.top + plotH - h;
            return `<g class="bar-hover">
                <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" fill="${color}" fill-opacity="0.85"
                      data-tip="${escapeHTML(labels[i] || '')} : ${formatNumber(v)}">
                    <title>${escapeHTML(labels[i] || '')}: ${formatNumber(v)}</title>
                </rect>
                <text x="${x + barW / 2}" y="${PAD.top + plotH + 16}" font-size="11" text-anchor="middle" fill="currentColor" fill-opacity="0.7">${escapeHTML(String(labels[i] ?? ''))}</text>
            </g>`;
        }).join('');

        host.innerHTML = svgWrap(`${grid}${bars}`, host.dataset.height);
        attachTips(host);
    },

    /** نمودار میله‌ای گروهی (درآمد/هزینه، …) */
    groupedBar(el, { labels = [], series = [], emptyText = '' } = {}) {
        const host = resolve(el);
        if (!host) return;
        const hasData = series.some((s) => (s.data || []).some((v) => v));
        if (!hasData) { host.innerHTML = emptyHTML(emptyText); return; }

        const maxVal = Math.max(...series.flatMap((s) => s.data || []), 1);
        const max = niceMax(maxVal);
        const plotW = W - PAD.left - PAD.right;
        const plotH = H - PAD.top - PAD.bottom;
        const stepX = plotW / labels.length;
        const barW = Math.min(22, (stepX * 0.7) / series.length);

        const grid = [0, 0.25, 0.5, 0.75, 1].map((r) => {
            const y = PAD.top + plotH - plotH * r;
            return `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="3 4"/>
                    <text x="${W - PAD.right + 6}" y="${y + 4}" font-size="11" fill="currentColor" fill-opacity="0.55">${compact(max * r)}</text>`;
        }).join('');

        let bars = '';
        labels.forEach((lab, i) => {
            const groupRight = W - PAD.right - i * stepX;
            series.forEach((s, si) => {
                const v = (s.data || [])[i] || 0;
                const h = Math.max(1.5, (v / max) * plotH);
                const x = groupRight - (si + 1) * barW - 4;
                const y = PAD.top + plotH - h;
                bars += `<rect class="bar-hover" x="${x}" y="${y}" width="${barW}" height="${h}" rx="4"
                     fill="${s.color || '#D4AF37'}" fill-opacity="0.85"
                     data-tip="${escapeHTML(s.label || '')} · ${escapeHTML(lab)} : ${formatNumber(v)}"><title>${escapeHTML(s.label || '')}: ${formatNumber(v)}</title></rect>`;
            });
            bars += `<text x="${groupRight - (series.length * barW + 4) / 2}" y="${PAD.top + plotH + 16}" font-size="11" text-anchor="middle" fill="currentColor" fill-opacity="0.7">${escapeHTML(lab)}</text>`;
        });

        const legend = `<div class="chart-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${escapeHTML(s.label || '')}</span>`).join('')}</div>`;
        host.innerHTML = svgWrap(`${grid}${bars}`) + legend;
        attachTips(host);
    },

    /** نمودار خطی/سطحی */
    line(el, { labels = [], data = [], color = '#D4AF37', area = true, emptyText = '' } = {}) {
        const host = resolve(el);
        if (!host) return;
        if (!data.length || data.every((d) => !d)) { host.innerHTML = emptyHTML(emptyText); return; }
        const max = niceMax(Math.max(...data, 1));
        const plotW = W - PAD.left - PAD.right;
        const plotH = H - PAD.top - PAD.bottom;
        const stepX = data.length > 1 ? plotW / (data.length - 1) : plotW;

        const points = data.map((v, i) => {
            const x = W - PAD.right - i * stepX;
            const y = PAD.top + plotH - (v / max) * plotH;
            return { x, y, v, label: labels[i] };
        });

        const grid = [0, 0.25, 0.5, 0.75, 1].map((r) => {
            const y = PAD.top + plotH - plotH * r;
            return `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="3 4"/>
                    <text x="${W - PAD.right + 6}" y="${y + 4}" font-size="11" fill="currentColor" fill-opacity="0.55">${compact(max * r)}</text>`;
        }).join('');

        const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        const areaPath = `${path} L${points[points.length - 1].x},${PAD.top + plotH} L${points[0].x},${PAD.top + plotH} Z`;

        const dots = points.map((p) => `<circle class="bar-hover" cx="${p.x}" cy="${p.y}" r="4" fill="${color}"
            data-tip="${escapeHTML(String(p.label ?? ''))} : ${formatNumber(p.v)}"><title>${formatNumber(p.v)}</title></circle>`).join('');

        const xLabels = points.map((p, i) => (data.length > 8 && i % 2 ? '' :
            `<text x="${p.x}" y="${PAD.top + plotH + 16}" font-size="11" text-anchor="middle" fill="currentColor" fill-opacity="0.7">${escapeHTML(String(p.label ?? ''))}</text>`)).join('');

        host.innerHTML = svgWrap(`
            ${grid}
            ${area ? `<path d="${areaPath}" fill="${color}" fill-opacity="0.12"/>` : ''}
            <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
            ${dots}${xLabels}`);
        attachTips(host);
    },

    /** نمودار دایره‌ای/دونات */
    pie(el, { labels = [], data = [], colors = ['#D4AF37', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b'], donut = true, emptyText = '' } = {}) {
        const host = resolve(el);
        if (!host) return;
        const sum = data.reduce((s, v) => s + (Number(v) || 0), 0);
        if (!sum) { host.innerHTML = emptyHTML(emptyText); return; }

        const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 26;
        const inner = donut ? r * 0.58 : 0;
        let angle = -Math.PI / 2;
        const arcs = data.map((v, i) => {
            const val = Number(v) || 0;
            if (!val) return '';
            const sweep = (val / sum) * Math.PI * 2;
            const a0 = angle;
            const a1 = angle + sweep;
            angle = a1;
            const large = sweep > Math.PI ? 1 : 0;
            const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
            const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
            const color = colors[i % colors.length];
            const pct = Math.round((val / sum) * 100);
            if (!donut) {
                return `<path class="bar-hover" d="M${cx},${cy} L${p0[0]},${p0[1]} A${r},${r} 0 ${large} 1 ${p1[0]},${p1[1]} Z"
                    fill="${color}" fill-opacity="0.9" data-tip="${escapeHTML(labels[i] || '')} : ${formatNumber(val)} (${toFa(pct)}٪)">
                    <title>${escapeHTML(labels[i] || '')}: ${formatNumber(val)}</title></path>`;
            }
            const i0 = [cx + inner * Math.cos(a0), cy + inner * Math.sin(a0)];
            const i1 = [cx + inner * Math.cos(a1), cy + inner * Math.sin(a1)];
            return `<path class="bar-hover" d="M${p0[0]},${p0[1]} A${r},${r} 0 ${large} 1 ${p1[0]},${p1[1]} L${i1[0]},${i1[1]} A${inner},${inner} 0 ${large} 0 ${i0[0]},${i0[1]} Z"
                fill="${color}" fill-opacity="0.9" data-tip="${escapeHTML(labels[i] || '')} : ${formatNumber(val)} (${toFa(pct)}٪)">
                <title>${escapeHTML(labels[i] || '')}: ${formatNumber(val)}</title></path>`;
        }).join('');

        const totalText = donut
            ? `<text x="${cx}" y="${cy - 2}" font-size="14" text-anchor="middle" fill="currentColor" fill-opacity="0.6">جمع</text>
               <text x="${cx}" y="${cy + 18}" font-size="15" font-weight="700" text-anchor="middle" fill="#D4AF37">${compact(sum)}</text>`
            : '';

        const legend = `<div class="chart-legend">${labels.map((l, i) => `<span><i style="background:${colors[i % colors.length]}"></i>${escapeHTML(l)}</span>`).join('')}</div>`;
        host.innerHTML = svgWrap(`${arcs}${totalText}`) + legend;
        attachTips(host);
    },

    /** نوار پیشرفت افقی برای گزارش‌های رتبه‌بندی */
    bars(el, { items = [], color = '#D4AF37', emptyText = '' } = {}) {
        const host = resolve(el);
        if (!host) return;
        if (!items.length) { host.innerHTML = emptyHTML(emptyText); return; }
        const max = Math.max(...items.map((i) => i.value), 1);
        host.innerHTML = items.map((i) => `
            <div style="margin-bottom:10px">
              <div style="display:flex; justify-content:space-between; font-size:0.74rem; gap:8px">
                <span>${escapeHTML(i.label)}</span>
                <span class="text-bold" style="color:${i.color || color}">${escapeHTML(i.text || formatNumber(i.value))}</span>
              </div>
              <div class="progress"><i style="width:${Math.max(2, (i.value / max) * 100)}%; background:${i.color || color}"></i></div>
            </div>`).join('');
    }
};

export default Charts;
