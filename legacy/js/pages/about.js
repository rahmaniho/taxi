/* ==========================================================================
 * js/pages/about.js — دربارهٔ سامانه، نسخه‌ها و امکانات
 * ========================================================================== */

import { icon, brandSVG } from '../components/icons.js';
import { pageHeader } from '../components/ui.js';
import { DB, SCHEMA_VERSION } from '../db.js';
import { escapeHTML, toFa, formatJalali, todayJalali } from '../utils.js';

export const APP_VERSION = '5.1.0';
export const APP_BUILD = '1405-07';

const FEATURES = [
    ['تلفن‌خانه و صف انتظار', 'phone', 'ثبت سفر تلفنی، صف هوشمند (فوری بالاتر از رزرو)، زمان انتظار و هشدار تأخیر.'],
    ['مدیریت رانندگان', 'car', 'وضعیت زندهٔ آزاد/در سفر/آفلاین/استراحت، تخصیص عادلانه بر اساس تعداد سفر و امتیاز.'],
    ['مشترکین و بدهی', 'users', 'مشتریان حقیقی و حقوقی، بدهی محاسبه‌شده از سفرها، ثبت پرداخت، سنّ بدهی و صورت‌حساب.'],
    ['حسابداری راننده', 'calculator', 'کمیسیون، سهم راننده، طلب آژانس از راننده، طلب راننده از آژانس و تسویه.'],
    ['گزارش‌ها و PDF', 'bar-chart', 'گزارش اپراتور، لغو، بدهکاران، عملکرد رانندگان، گزارش مالی و چاپ همه‌جانبه.'],
    ['کرایهٔ پلکانی', 'clock', 'کرایهٔ پایه + نرخ کیلومتر، ضریب شب (۲۲ تا ۶) و ضریب تعطیلات رسمی، با گِرد کردن به هزار تومان.'],
    ['کاربران و نقش‌ها', 'shield', 'رمزهای هش‌شده (SHA-256 + نمک)، سه نقش مدیر/اپراتور/حسابدار و فیلتر خودکار منو.'],
    ['گزارش تغییرات', 'clipboard', 'حسابرسی کامل: چه کسی، چه زمانی، چه چیزی را تغییر داد + حذف نرم و بازیابی.'],
    ['بدون نیاز به اینترنت', 'wifi-off', 'PWA قابل نصب؛ فونت‌ها و منابع محلی؛ مناسب آژانس‌هایی با اینترنت ضعیف.'],
    ['آمادهٔ اتصال به سرور', 'cloud', 'لایهٔ داده Adapter دارد و بدون تغییر رابط کاربری به PocketBase یا Supabase وصل می‌شود.']
];

const CHANGES = [
    ['۵٫۰٫۰', 'فاز ۴', ['گزارش مالی ماهانه با خروجی PDF', 'گزارش سنّ بدهی مشتریان (۰-۳۰/۳۱-۶۰/۶۰+)', 'یادآوری متنی مشتریان بدهکار', 'کارت عملکرد ۳۰ روزهٔ رانندگان']],
    ['۴٫۹٫۰', 'فاز ۳', ['ورود محلی با رمز هش‌شده و سه نقش', 'گزارش تغییرات (Audit Log) و بازیابی حذف‌شده‌ها', 'حذف نرم (Soft Delete) در همهٔ موجودیت‌ها', 'شیفت‌ها و نسبت‌دادن سفر به شیفت/اپراتور']],
    ['۴٫۸٫۰', 'فاز ۲', ['صف انتظار سفرها و تخصیص هوشمند راننده', 'وضعیت زندهٔ راننده با چهار حالت رنگی', 'کرایهٔ پلکانی شب و تعطیلات', 'ثبت دلیل لغو سفر', 'چاپ رسید راننده']],
    ['۴٫۷٫۰', 'فاز ۱', ['رفع باگ‌های بحرانی نسخهٔ نمایشی', 'تقویم شمسی برای همهٔ فیلدهای تاریخ', 'رفع اشکال بدهی مشترکین و تسویهٔ رانندگان', 'اعتبارسنجی تلفن، کد ملی و پلاک', 'Service Worker واقعی و نصب PWA', 'فونت‌ها از CDN پایدار (jsDelivr)']]
];

export default {
    id: 'about',
    title: 'درباره',

    render(view) {
        const stats = DB.stats();
        const totalRecords = Object.values(stats).reduce((a, s) => a + s.active, 0);

        view.innerHTML = `
        <section class="page-section active">
          ${pageHeader({
            title: 'دربارهٔ سامانه', iconName: 'info',
            subtitle: 'تاکسی تلفنی — سامانهٔ مدیریت و اتوماسیون آژانس تلفنی، نسخهٔ تک‌فایلی تحت مرورگر.'
          })}

          <div class="card about-card mb-16">
            <div class="about-head">
              <div class="about-logo">${brandSVG(72)}</div>
              <div>
                <h2 class="about-title">آژانس تلفنی <span class="text-gold">کیمیا</span></h2>
                <p class="about-version">
                  نسخهٔ <b>${toFa(APP_VERSION)}</b> — ساخت ${toFa(APP_BUILD)} ·
                  ساختار داده: نسخهٔ ${toFa(SCHEMA_VERSION)} ·
                  ${toFa(totalRecords)} رکورد فعال ·
                  امروز: ${formatJalali(todayJalali())}
                </p>
              </div>
            </div>
            <p>
              این سامانه به‌صورت یک برنامهٔ تک‌صفحه‌ای (SPA) کاملاً فارسی و راست‌به‌چپ روی مرورگر اجرا می‌شود؛
              نیازی به نصب سرور یا اینترنت ندارد و همهٔ داده‌ها در همین دستگاه نگهداری می‌شود.
              ساختار لایهٔ داده به‌گونه‌ای طراحی شده که در آینده بدون هیچ تغییری در رابط کاربری،
              به سرویس‌های ابری مانند PocketBase یا Supabase متصل شود.
            </p>
          </div>

          <div class="card mb-16">
            <div class="card-header"><div class="card-title">${icon('star')} امکانات کلیدی</div></div>
            <div class="features-grid">
              ${FEATURES.map(([t, ic, d]) => `
                <div class="feature-box">
                  <div class="feature-icon">${icon(ic)}</div>
                  <div>
                    <div class="feature-title">${escapeHTML(t)}</div>
                    <div class="feature-text">${escapeHTML(d)}</div>
                  </div>
                </div>`).join('')}
            </div>
          </div>

          <div class="grid-2 mb-16">
            <div class="card">
              <div class="card-header"><div class="card-title">${icon('list')} تاریخچهٔ نسخه‌ها</div></div>
              ${CHANGES.map(([v, phase, items]) => `
                <div class="version-box">
                  <div class="version-head"><span class="chip chip-gold">نسخهٔ ${toFa(v)}</span> <span class="chip">${escapeHTML(phase)}</span></div>
                  <ul class="version-list">${items.map((i) => `<li>${icon('check')} ${escapeHTML(i)}</li>`).join('')}</ul>
                </div>`).join('')}
            </div>
            <div class="card">
              <div class="card-header"><div class="card-title">${icon('cpu')} مشخصات فنی</div></div>
              <table class="mini-table">
                <tbody>
                  <tr><td>رابط کاربری</td><td class="num">HTML5 + CSS3 (RTL, فارسی)</td></tr>
                  <tr><td>زبان برنامه‌نویسی</td><td class="num">JavaScript خالص (ES Modules)</td></tr>
                  <tr><td>بدون کتابخانهٔ جانبی</td><td class="num">${icon('check')} هیچ وابستگی خارجی</td></tr>
                  <tr><td>تقویم</td><td class="num">شمسی (جلالی) اختصاصی</td></tr>
                  <tr><td>نقشه/ردیابی</td><td class="num">ندارد (طبق دامنهٔ پروژه)</td></tr>
                  <tr><td>ذخیره‌سازی</td><td class="num">${DB.adapterName() === 'rest' ? 'REST سرور' : 'LocalStorage مرورگر'}</td></tr>
                  <tr><td>فونت‌ها</td><td class="num">BNazanin · BTitr · BLotus · BCompset</td></tr>
                  <tr><td>نصب‌پذیری</td><td class="num">${icon('check')} PWA با Service Worker</td></tr>
                  <tr><td>طرح رنگی</td><td class="num"><span style="color:#D4AF37">■</span> طلایی #D4AF37 + تم تاریک/روشن</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><div class="card-title">${icon('heart')} قدردانی</div></div>
            <p class="mb-10">این سامانه با تکیه بر تجربهٔ کار آژانس‌های تلفنی ایران طراحی شده است: سرعت ثبت سفر، شفافیت تسویهٔ راننده و پیگیری بدهی مشتری، سه ستون اصلی کار روزانهٔ یک آژانس هستند.</p>
            <div class="flex gap-8" style="flex-wrap:wrap">
              <span class="chip">${icon('check')} بدون نیاز به اینترنت</span>
              <span class="chip">${icon('check')} موبایل، تبلت، دسکتاپ</span>
              <span class="chip">${icon('check')} پشتیبان‌گیری آسان با یک فایل</span>
              <span class="chip">${icon('check')} آمادهٔ رشد به سرویس ابری</span>
            </div>
          </div>
        </section>`;
    }
};
