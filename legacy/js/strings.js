/* ==========================================================================
 * js/strings.js — همه رشته‌های ثابت فارسی رابط کاربری
 * دلیل وجود: یکپارچگی واژگان، جلوگیری از پراکندگی متن در صفحات و آمادگی i18n.
 * ========================================================================== */

export const S = {
    appName: 'سیستم مدیریت تاکسی تلفنی',
    brand: 'کارن‌سافت',
    brandSub: 'مدیریت تاکسی تلفنی',

    /* ---- عمومی ---- */
    save: 'ذخیره',
    save2: 'ثبت',
    cancel: 'انصراف',
    close: 'بستن',
    edit: 'ویرایش',
    del: 'حذف',
    restore: 'بازیابی',
    search: 'جستجو...',
    confirm: 'تأیید',
    ok: 'باشه',
    print: 'چاپ',
    export: 'خروجی',
    choose: 'انتخاب کنید...',
    all: 'همه',
    none: '—',
    today: 'امروز',
    from: 'از تاریخ',
    to: 'تا تاریخ',
    amount: 'مبلغ',
    date: 'تاریخ',
    time: 'ساعت',
    status: 'وضعیت',
    actions: 'عملیات',
    details: 'جزئیات',
    total: 'جمع کل',
    count: 'تعداد',
    noData: 'داده‌ای برای نمایش وجود ندارد',
    loading: 'در حال بارگذاری...',
    yes: 'بله',
    no: 'خیر',
    required: 'این فیلد الزامی است',
    allRights: 'تمام حقوق محفوظ است',
    toman: 'تومان',
    km: 'کیلومتر',

    /* ---- ورود / نقش‌ها ---- */
    login: 'ورود به سامانه',
    logout: 'خروج از حساب',
    username: 'نام کاربری',
    password: 'رمز عبور',
    wrongCreds: 'نام کاربری یا رمز عبور نادرست است',
    accountDisabled: 'حساب کاربری غیرفعال است',
    loginSuccess: 'خوش آمدید',
    roles: { admin: 'مدیر سامانه', operator: 'اپراتور', accountant: 'حسابدار' },

    /* ---- شیفت ---- */
    shift: 'شیفت',
    shiftOpen: 'شیفت باز',
    shiftClosed: 'شیفت بسته',
    openShift: 'شروع شیفت',
    closeShift: 'پایان شیفت',
    openingCash: 'صندوق اولیه (تومان)',
    closingCash: 'صندوق پایانی (تومان)',
    openShiftHint: 'برای شروع کار، صندوق اولیه شیفت خود را ثبت کنید.',
    closeShiftHint: 'صندوق پایانی شیفت را ثبت کنید. گزارش شیفت به‌صورت خودکار محاسبه می‌شود.',
    shiftOpened: 'شیفت با موفقیت آغاز شد',
    shiftClosed: 'شیفت بسته شد',
    noOpenShift: 'شیفتی باز نیست',
    shiftReport: 'گزارش شیفت',

    /* ---- وضعیت سفر ---- */
    tripStatus: {
        pending: 'در انتظار',
        inProgress: 'در حال انجام',
        completed: 'تکمیل شده',
        cancelled: 'لغو شده'
    },
    tripSteps: ['در انتظار', 'در حال انجام', 'تکمیل شده'],
    priority: { urgent: 'فوری', reserved: 'رزرو' },
    paymentMethod: { cash: 'نقدی', card: 'کارتی', subscription: 'اشتراک', online: 'آنلاین' },
    billedTo: { driver: 'نقدی به راننده', company: 'پرداخت به آژانس' },
    cancelTitle: 'دلیل لغو سفر',
    cancelReasons: ['مشتری لغو کرد', 'راننده نرسید', 'آدرس اشتباه', 'سایر'],
    cancelReason: 'دلیل لغو',
    cancelNote: 'توضیح تکمیلی',

    /* ---- راننده ---- */
    availability: {
        available: 'آزاد',
        busy: 'در سفر',
        offline: 'آفلاین',
        rest: 'استراحت'
    },
    driverStatus: { active: 'فعال', inactive: 'غیرفعال', suspended: 'تعلیق' },
    vehicleStatus: { active: 'فعال', inactive: 'غیرفعال', inRepair: 'در تعمیر' },
    driver: 'راننده',
    drivers: 'رانندگان',
    vehicle: 'خودرو',
    vehicles: 'خودروها',
    freeDrivers: 'رانندگان آزاد',
    noFreeDriver: 'راننده آزادی موجود نیست',

    /* ---- مشترکین ---- */
    subscriber: 'مشترک',
    subscribers: 'مشترکین',
    subscriberTypes: { individual: 'حقیقی', corporate: 'حقوقی' },
    subscriptionTypes: { none: 'بدون اشتراک', monthly: 'ماهانه', weekly: 'هفتگی', custom: 'سفارشی' },
    debt: 'بدهی',
    payment: 'پرداخت',
    registerSubscriberPayment: 'ثبت پرداخت مشترک',
    subscriberPayments: 'تاریخچه پرداخت‌ها',
    paymentHistory: 'تاریخچه پرداخت',
    debtPaid: 'بدهی این مشترک تسویه شده است',

    /* ---- حسابداری ---- */
    driverStatement: 'صورت‌حساب راننده',
    registerDriverPayment: 'ثبت پرداخت به راننده',
    driverPayments: 'پرداخت‌های راننده',
    driverDebt: 'طلب آژانس از راننده',
    driverClaim: 'طلب راننده از آژانس',
    payable: 'مانده قابل پرداخت',
    paidToDriver: 'جمع پرداخت‌ها به راننده',
    commission: 'کمیسیون',
    driverShare: 'سهم راننده',
    fareSum: 'مجموع کرایه‌ها',
    printReceipt: 'چاپ رسید',
    printInvoice: 'چاپ فاکتور',
    financial: 'مالی',

    /* ---- خطاها ---- */
    errors: {
        required: 'تکمیل این فیلد الزامی است',
        mobile: 'شماره موبایل باید با ۰۹ شروع شده و ۱۱ رقم باشد',
        landline: 'شماره تلفن ثابت باید با ۰ شروع شده و ۱۱ رقم باشد',
        phone: 'شماره تماس نامعتبر است (موبایل ۱۱ رقم با ۰۹ یا ثابت ۱۱ رقم با ۰)',
        nationalCode: 'کد ملی وارد‌شده معتبر نیست',
        plate: 'شماره پلاک نامعتبر است (نمونه: ۱۲ب۳۴۵ یا ۴۵۶ج۷۸)',
        email: 'ایمیل نامعتبر است',
        number: 'عدد وارد‌شده نامعتبر است',
        positive: 'مقدار باید بزرگ‌تر از صفر باشد',
        jalaliDate: 'تاریخ شمسی نامعتبر است (نمونه: ۱۴۰۴/۰۷/۱۵)',
        duplicate: 'رکورد تکراری است',
        generic: 'خطای غیرمنتظره رخ داد',
        permission: 'شما به این بخش دسترسی ندارید'
    },

    /* ---- تأییدها ---- */
    confirmDelete: 'آیا از حذف این مورد مطمئن هستید؟',
    confirmDeleteHint: 'این حذف قابل بازیابی است (حذف نرم) و از بخش «گزارش تغییرات» می‌توانید بازیابی کنید.',
    deleted: 'با موفقیت حذف شد',
    restored: 'با موفقیت بازیابی شد',
    saved: 'تغییرات ذخیره شد',
    printBlocked: 'مرورگر اجازه چاپ نداد؛ لطفاً دسترسی را بررسی کنید',

    /* ---- منو ---- */
    nav: {
        dashboard: 'داشبورد',
        queue: 'صف انتظار',
        trips: 'سفرها',
        tripsNew: 'ثبت سفر جدید',
        tripsList: 'لیست سفرها',
        drivers: 'رانندگان و خودروها',
        addresses: 'آدرس‌ها',
        subscribers: 'مشترکین',
        accounting: 'حسابداری',
        accDriver: 'صورت‌حساب رانندگان',
        accReport: 'گزارش درآمد/هزینه',
        accCommissions: 'کمیسیون‌ها',
        accSubscribers: 'حسابداری مشترکین',
        accPayments: 'پرداخت‌ها',
        accExpenses: 'هزینه‌های جانبی',
        reports: 'گزارش‌ها',
        reportsOperator: 'گزارش اپراتور',
        reportsCancel: 'گزارش لغو سفرها',
        reportsDebtors: 'مشتریان بدهکار',
        reportsDrivers: 'عملکرد رانندگان',
        audit: 'گزارش تغییرات',
        settings: 'تنظیمات',
        operators: 'کاربران و شیفت‌ها',
        backup: 'پشتیبان‌گیری',
        training: 'آموزش',
        about: 'درباره ما'
    },
    sections: {
        operations: 'عملیات',
        drivers: 'ناوگان',
        people: 'اشخاص',
        finance: 'مالی و حسابداری',
        reports: 'گزارش‌ها',
        system: 'سیستم'
    }
};

/** دسترسی به رشته تودرتو: t('tripStatus.pending') */
export function t(path) {
    const parts = String(path).split('.');
    let cur = S;
    for (const p of parts) {
        if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
        else return path;
    }
    return cur;
}

export default S;
