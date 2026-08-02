import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  DollarSign,
  CreditCard,
  Banknote,
  CheckCircle2,
  Circle,
  CalendarDays,
  TrendingDown,
  TrendingUp,
  Receipt,
  Settings2,
  Trash2,
  X,
  AlertTriangle,
  CheckSquare,
  Square,
  RefreshCcw,
  Coins,
  Search,
  ChevronDown,
  Plus,
  CalendarPlus,
  Tag,
  Hash,
  Sun,
  Moon,
  Wallet,
  Lock,
} from "lucide-react";

// ─────────────────────────────────────────────
//  DATA TYPES
// ─────────────────────────────────────────────

type ItemType = "bill" | "loan" | "income";
type Frequency = "monthly" | "bimonthly" | "custom" | "once" | "weekly";

interface BillOrLoan {
  id: string;
  title: string;
  amount: number;
  type: ItemType;
  frequency: Frequency;
  /** monthly: single due day */
  due_day?: number;
  /** bimonthly: exactly two due days per month */
  due_days?: [number, number];
  /** custom: list of specific ISO-date strings */
  custom_dates?: string[];
  /** once: single ISO-date string */
  specific_date?: string;
  /** weekly: day of week (0-6) */
  due_day_of_week?: number;
  /** monthly/bimonthly/weekly: the month the item becomes active (0-indexed) */
  start_month?: number;
  /** monthly/bimonthly/weekly: the year the item becomes active */
  start_year?: number;
  /** monthly/bimonthly/weekly: optional end month (0-indexed) */
  end_month?: number;
  /** monthly/bimonthly/weekly: optional end year */
  end_year?: number;
}

interface PaymentRecord {
  item_id: string;
  payment_month: number; // 1-12
  payment_year: number;
  status: "paid";
}

export interface CutOffRange {
  start: number;
  end: number;
}

export interface WorkProfile {
  hourlyRate: number;
  shiftStart: string; // "22:00"
  shiftEnd: string; // "07:00"
  unpaidBreakHours: number;
  restDays: number[]; // 0 for Sunday, 6 for Saturday
  hasNightDiff: boolean;
  nightDiffStart: string; // "22:00"
  nightDiffEnd: string; // "06:00"
  nightDiffRate: number;
  monthlyAllowance: number;
  cutOffs?: number[]; // deprecated
  cutOffRanges: CutOffRange[]; // e.g. [{start: 21, end: 5}, {start: 6, end: 20}]
  salaryDates: number[]; // e.g. [15, 30]
}

export type ShiftStatus = "work" | "rest" | "pto" | "vto" | "holiday";

export interface ShiftOverride {
  status: ShiftStatus;
  customHours?: number; // optionally override total hours worked
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
  locale: string;
}

// ─────────────────────────────────────────────
//  CURRENCIES
// ─────────────────────────────────────────────

const CURRENCIES: Currency[] = [
  { code: "USD", name: "US Dollar",          symbol: "$",  locale: "en-US" },
  { code: "EUR", name: "Euro",               symbol: "€",  locale: "de-DE" },
  { code: "GBP", name: "British Pound",      symbol: "£",  locale: "en-GB" },
  { code: "JPY", name: "Japanese Yen",       symbol: "¥",  locale: "ja-JP" },
  { code: "CNY", name: "Chinese Yuan",       symbol: "¥",  locale: "zh-CN" },
  { code: "INR", name: "Indian Rupee",       symbol: "₹",  locale: "en-IN" },
  { code: "AUD", name: "Australian Dollar",  symbol: "A$", locale: "en-AU" },
  { code: "CAD", name: "Canadian Dollar",    symbol: "C$", locale: "en-CA" },
  { code: "SGD", name: "Singapore Dollar",   symbol: "S$", locale: "en-SG" },
  { code: "HKD", name: "Hong Kong Dollar",   symbol: "HK$",locale: "zh-HK" },
  { code: "KRW", name: "South Korean Won",   symbol: "₩",  locale: "ko-KR" },
  { code: "PHP", name: "Philippine Peso",    symbol: "₱",  locale: "en-PH" },
  { code: "THB", name: "Thai Baht",          symbol: "฿",  locale: "th-TH" },
  { code: "IDR", name: "Indonesian Rupiah",  symbol: "Rp", locale: "id-ID" },
  { code: "MYR", name: "Malaysian Ringgit",  symbol: "RM", locale: "ms-MY" },
  { code: "VND", name: "Vietnamese Dong",    symbol: "₫",  locale: "vi-VN" },
  { code: "CHF", name: "Swiss Franc",        symbol: "Fr", locale: "de-CH" },
  { code: "SEK", name: "Swedish Krona",      symbol: "kr", locale: "sv-SE" },
  { code: "NOK", name: "Norwegian Krone",    symbol: "kr", locale: "nb-NO" },
  { code: "DKK", name: "Danish Krone",       symbol: "kr", locale: "da-DK" },
  { code: "PLN", name: "Polish Złoty",       symbol: "zł", locale: "pl-PL" },
  { code: "CZK", name: "Czech Koruna",       symbol: "Kč", locale: "cs-CZ" },
  { code: "HUF", name: "Hungarian Forint",   symbol: "Ft", locale: "hu-HU" },
  { code: "BRL", name: "Brazilian Real",     symbol: "R$", locale: "pt-BR" },
  { code: "MXN", name: "Mexican Peso",       symbol: "$",  locale: "es-MX" },
  { code: "ARS", name: "Argentine Peso",     symbol: "$",  locale: "es-AR" },
  { code: "ZAR", name: "South African Rand", symbol: "R",  locale: "en-ZA" },
  { code: "AED", name: "UAE Dirham",         symbol: "د.إ",locale: "ar-AE" },
  { code: "SAR", name: "Saudi Riyal",        symbol: "﷼",  locale: "ar-SA" },
  { code: "TRY", name: "Turkish Lira",       symbol: "₺",  locale: "tr-TR" },
  { code: "RUB", name: "Russian Ruble",      symbol: "₽",  locale: "ru-RU" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$",locale: "en-NZ" },
];

// ─────────────────────────────────────────────
//  INITIAL MOCK DATA
// ─────────────────────────────────────────────

const INITIAL_BILLS_AND_LOANS: BillOrLoan[] = [
  // Bills
  { id: "b1", title: "Rent", amount: 1850, type: "bill", frequency: "monthly", due_day: 1 },
  { id: "b2", title: "Electricity", amount: 120, type: "bill", frequency: "monthly", due_day: 8 },
  { id: "b3", title: "Internet", amount: 65, type: "bill", frequency: "monthly", due_day: 12 },
  { id: "b4", title: "Netflix", amount: 18, type: "bill", frequency: "monthly", due_day: 15 },
  { id: "b5", title: "Spotify", amount: 12, type: "bill", frequency: "monthly", due_day: 15 },
  { id: "b6", title: "Health Insurance", amount: 340, type: "bill", frequency: "monthly", due_day: 20 },
  { id: "b7", title: "Gym Membership", amount: 45, type: "bill", frequency: "monthly", due_day: 22 },
  { id: "b8", title: "Phone Plan", amount: 75, type: "bill", frequency: "monthly", due_day: 25 },
  { id: "b9", title: "Cloud Storage", amount: 10, type: "bill", frequency: "monthly", due_day: 28 },
  // One-time bills
  { id: "b10", title: "Car Registration", amount: 225, type: "bill", frequency: "once", specific_date: "2026-06-10" },
  { id: "b11", title: "HVAC Service", amount: 180, type: "bill", frequency: "once", specific_date: "2026-05-19" },
  // Loans
  { id: "l1", title: "Car Loan", amount: 420, type: "loan", frequency: "monthly", due_day: 5 },
  { id: "l2", title: "Student Loan", amount: 280, type: "loan", frequency: "monthly", due_day: 10 },
  { id: "l3", title: "Personal Loan", amount: 190, type: "loan", frequency: "monthly", due_day: 18 },
  { id: "l4", title: "Home Equity", amount: 510, type: "loan", frequency: "monthly", due_day: 23 },
  // One-time loan payment
  { id: "l5", title: "Friend Repayment", amount: 300, type: "loan", frequency: "once", specific_date: "2026-05-31" },
  // Income
  { id: "i1", title: "Salary", amount: 4500, type: "income", frequency: "bimonthly", due_days: [1, 15] },
  { id: "i2", title: "Side Hustle", amount: 200, type: "income", frequency: "weekly", due_day_of_week: 5 }, // Friday
];

const INITIAL_PAYMENT_HISTORY: PaymentRecord[] = [
  { item_id: "b1", payment_month: 5, payment_year: 2026, status: "paid" },
  { item_id: "b2", payment_month: 5, payment_year: 2026, status: "paid" },
  { item_id: "l1", payment_month: 5, payment_year: 2026, status: "paid" },
  { item_id: "b4", payment_month: 5, payment_year: 2026, status: "paid" },
  { item_id: "b3", payment_month: 6, payment_year: 2026, status: "paid" },
];

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Returns true if the current month/year is on or after the item's start date and before or equal to the end date */
function isItemActive(item: BillOrLoan, month: number, year: number): boolean {
  if (item.start_year !== undefined && item.start_month !== undefined) {
    if (year < item.start_year || (year === item.start_year && month < item.start_month)) return false;
  }
  if (item.end_year !== undefined && item.end_month !== undefined) {
    if (year > item.end_year || (year === item.end_year && month > item.end_month)) return false;
  }
  return true;
}

function getItemsForDay(items: BillOrLoan[], day: number, month: number, year: number): BillOrLoan[] {
  return items.filter((item) => {
    if (!isItemActive(item, month, year)) return false;
    if (item.frequency === "monthly") return item.due_day === day;
    if (item.frequency === "bimonthly" && item.due_days)
      return item.due_days[0] === day || item.due_days[1] === day;
    if (item.frequency === "weekly" && item.due_day_of_week !== undefined) {
      const d = new Date(year, month, day);
      return d.getDay() === item.due_day_of_week;
    }
    if (item.frequency === "once" && item.specific_date) {
      const d = new Date(item.specific_date + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    }
    if (item.frequency === "custom" && item.custom_dates) {
      return item.custom_dates.some((iso) => {
        const d = new Date(iso + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
      });
    }
    return false;
  });
}

function isPaid(itemId: string, month: number, year: number, history: PaymentRecord[]): boolean {
  return history.some(
    (r) => r.item_id === itemId && r.payment_month === month + 1 && r.payment_year === year && r.status === "paid"
  );
}

function computeMonthlyTotal(items: BillOrLoan[], month: number, year: number, filterType?: "bill+loan" | "income"): number {
  return items.reduce((sum, item) => {
    if (filterType === "bill+loan" && item.type === "income") return sum;
    if (filterType === "income" && item.type !== "income") return sum;

    let due = false;
    if ((item.frequency === "monthly" || item.frequency === "bimonthly") && isItemActive(item, month, year)) { due = true; }
    else if (item.frequency === "weekly" && isItemActive(item, month, year)) {
      // Need to count how many times this weekday occurs in the month
      if (item.due_day_of_week !== undefined) {
        let count = 0;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          if (new Date(year, month, d).getDay() === item.due_day_of_week) count++;
        }
        return sum + (item.amount * count);
      }
    }
    else if (item.frequency === "once" && item.specific_date) {
      const d = new Date(item.specific_date + "T00:00:00");
      due = d.getFullYear() === year && d.getMonth() === month;
    } else if (item.frequency === "custom" && item.custom_dates) {
      // Amount is per date, so count matches
      const count = item.custom_dates.filter(iso => {
        const d = new Date(iso + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === month;
      }).length;
      return sum + (item.amount * count);
    }
    return due ? sum + item.amount : sum;
  }, 0);
}

function computePaidTotal(items: BillOrLoan[], month: number, year: number, history: PaymentRecord[], filterType?: "bill+loan" | "income"): number {
  return items.reduce((sum, item) => {
    if (filterType === "bill+loan" && item.type === "income") return sum;
    if (filterType === "income" && item.type !== "income") return sum;
    return isPaid(item.id, month, year, history) ? sum + item.amount : sum;
  }, 0);
}

function formatCurrency(amount: number, currency: Currency): string {
  // JPY, KRW, VND, IDR, HUF typically shown without decimals
  const noDecimals = ["JPY", "KRW", "VND", "IDR", "HUF"].includes(currency.code);
  return new Intl.NumberFormat(currency.locale, {
    style: "currency",
    currency: currency.code,
    maximumFractionDigits: noDecimals ? 0 : 0,
  }).format(amount);
}

// ─────────────────────────────────────────────
//  CURRENCY PICKER COMPONENT
// ─────────────────────────────────────────────

interface CurrencyPickerProps {
  selected: Currency;
  onChange: (c: Currency) => void;
}

function CurrencyPicker({ selected, onChange }: CurrencyPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQuery("");
  }, [open]);

  const filtered = CURRENCIES.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.code.toLowerCase().includes(query.toLowerCase()) ||
      c.symbol.includes(query)
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700/60 hover:border-slate-600 text-slate-300 hover:text-slate-100 text-xs font-semibold transition-all duration-200 group"
      >
        <Coins size={14} className="text-amber-400" />
        <span className="font-bold text-amber-300">{selected.symbol}</span>
        <span className="hidden sm:inline text-slate-400">{selected.code}</span>
        <ChevronDown size={12} className={`text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-800">
            <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2">
              <Search size={13} className="text-slate-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search currency…"
                className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-600 outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-slate-600 hover:text-slate-300 transition-colors">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-600 text-xs">No currencies found</div>
            ) : (
              filtered.map((c) => {
                const isActive = c.code === selected.code;
                return (
                  <button
                    key={c.code}
                    onClick={() => { onChange(c); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150
                      ${isActive ? "bg-indigo-600/20 text-indigo-200" : "hover:bg-slate-800 text-slate-300"}`}
                  >
                    <span className={`w-8 text-center text-sm font-bold shrink-0 ${isActive ? "text-amber-300" : "text-slate-500"}`}>
                      {c.symbol}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{c.name}</p>
                      <p className="text-[10px] text-slate-500">{c.code}</p>
                    </div>
                    {isActive && <CheckCircle2 size={13} className="text-indigo-400 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getItemDueLabel(item: BillOrLoan): string {
  if (item.frequency === "monthly") return `Monthly · Day ${item.due_day}`;
  if (item.frequency === "bimonthly" && item.due_days)
    return `Bi-monthly · Days ${item.due_days[0]} & ${item.due_days[1]}`;
  if (item.frequency === "weekly") {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `Weekly · Every ${item.due_day_of_week !== undefined ? days[item.due_day_of_week] : "Day"}`;
  }
  if (item.frequency === "custom" && item.custom_dates)
    return `Custom · ${item.custom_dates.length} date${item.custom_dates.length !== 1 ? "s" : ""}`;
  if (item.specific_date)
    return new Date(item.specific_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return "One-time";
}

// ─────────────────────────────────────────────
//  EVENT CARD
// ─────────────────────────────────────────────

interface EventCardProps {
  item: BillOrLoan;
  paid: boolean;
  missed?: boolean;
  currency: Currency;
  onToggle: (id: string) => void;
  theme?: "light" | "dark";
}

function EventCard({ item, paid, missed, currency, onToggle, theme = "dark" }: EventCardProps) {
  const isDark = theme === "dark";
  const isLoan = item.type === "loan";
  const isIncome = item.type === "income";

  let base = "";
  let iconColor = "";
  let textColor = "";
  let amountColor = "";

  if (isIncome) {
    base = isDark
      ? "bg-emerald-500/10 border border-emerald-500/25 hover:border-emerald-500/45"
      : "bg-emerald-50 border border-emerald-200 hover:border-emerald-450 hover:bg-emerald-50/50";
    iconColor = isDark ? "text-emerald-400" : "text-emerald-600";
    textColor = isDark ? "text-emerald-300" : "text-emerald-700";
    amountColor = isDark ? "text-emerald-200" : "text-emerald-800";
  } else if (isLoan) {
    base = isDark
      ? "bg-orange-500/10 border border-orange-500/25 hover:border-orange-500/45"
      : "bg-orange-50 border border-orange-200 hover:border-orange-450 hover:bg-orange-50/50";
    iconColor = isDark ? "text-orange-400" : "text-orange-600";
    textColor = isDark ? "text-orange-300" : "text-orange-700";
    amountColor = isDark ? "text-orange-200" : "text-orange-800";
  } else {
    base = isDark
      ? "bg-indigo-500/10 border border-indigo-500/25 hover:border-indigo-500/45"
      : "bg-indigo-50 border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/50";
    iconColor = isDark ? "text-indigo-400" : "text-indigo-600";
    textColor = isDark ? "text-indigo-300" : "text-indigo-700";
    amountColor = isDark ? "text-indigo-200" : "text-indigo-800";
  }

  return (
    <button
      onClick={() => onToggle(item.id)}
      title={paid ? "Mark as unpaid" : "Mark as paid"}
      className={`w-full text-left rounded-lg p-1.5 transition-all duration-200 cursor-pointer group ${base} ${paid ? "opacity-50" : "opacity-100"} ${missed ? "border-rose-500 ring-1 ring-rose-500/50" : ""}`}
    >
      <div className="flex items-start gap-1">
        <div className={`mt-0.5 shrink-0 ${iconColor}`}>
          {isIncome ? <Banknote size={10} /> : isLoan ? <CreditCard size={10} /> : <Receipt size={10} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-semibold leading-tight truncate ${paid ? "line-through" : ""} ${textColor}`}>
            {item.title}
          </p>
          <p className={`text-[10px] font-bold ${amountColor}`}>{formatCurrency(item.amount, currency)}</p>
        </div>
        <div className={`shrink-0 ${paid ? (isDark ? "text-emerald-450" : "text-emerald-600") : (isDark ? "text-zinc-600 group-hover:text-zinc-400" : "text-slate-400 group-hover:text-slate-600")} transition-colors`}>
          {missed && !paid ? (
            <AlertTriangle size={12} className="text-rose-500" />
          ) : paid ? (
            <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l5-5z" clipRule="evenodd" />
            </svg>
          ) : (
            <Circle size={12} />
          )}
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────
//  DAY CELL
// ─────────────────────────────────────────────

interface DayCellProps {
  day: number | null;
  isToday: boolean;
  items: BillOrLoan[];
  month: number;
  year: number;
  paymentHistory: PaymentRecord[];
  missedBills: Set<string>;
  onToggle: (id: string) => void;
  currency: Currency;
  theme: "light" | "dark";
  viewMode: "expenses" | "income";
  shiftEarnings?: { base: number; nd: number; total: number; isWork: boolean; status: ShiftStatus };
  payoutAmount?: number;
  onEditShift?: (day: number) => void;
  dailyBalance?: number;
}

function DayCell({ day, isToday, items, month, year, paymentHistory, missedBills, onToggle, currency, theme, viewMode, shiftEarnings, payoutAmount, onEditShift, dailyBalance }: DayCellProps) {
  if (day === null) {
    return <div className={`min-h-24 md:min-h-28 rounded-xl border-2 ${
      theme === "dark" ? "bg-zinc-950/20 border-zinc-800/40" : "bg-slate-100/50 border-slate-300"
    }`} />;
  }

  const dayItems = getItemsForDay(items, day, month, year);
  let visibleItems = dayItems;
  if (viewMode === "income") {
    visibleItems = dayItems.filter(i => i.type === "income");
  }
  
  const hasDue = visibleItems.length > 0 || (viewMode === "income" && shiftEarnings && shiftEarnings.status !== "rest" && shiftEarnings.status !== "vto");
  const isDark = theme === "dark";

  return (
    <div 
      onClick={() => { if (viewMode === "income" && onEditShift) onEditShift(day); }}
      className={`min-h-24 md:min-h-28 rounded-xl border-2 p-1.5 md:p-2 flex flex-col gap-1 transition-all duration-200
      ${viewMode === "income" ? "cursor-pointer hover:border-emerald-400/60" : ""}
      ${isToday 
        ? "border-pink-500 bg-pink-500/5 shadow-lg shadow-pink-500/5"
        : hasDue 
          ? isDark ? "border-zinc-700/80 bg-zinc-900/40" : "border-pink-400/80 bg-pink-50/25"
          : isDark ? "border-zinc-800/80 bg-zinc-950/60" : "border-slate-350 bg-slate-50/60"}`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className={`text-xs md:text-sm font-bold leading-none
          ${isToday 
            ? "bg-pink-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-md shadow-pink-500/20"
            : hasDue 
              ? isDark ? "text-zinc-300" : "text-slate-800" 
              : isDark ? "text-zinc-500" : "text-slate-400"}`}>
          {day}
        </span>
        {dayItems.length > 1 && (
          <span className={`text-[9px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{dayItems.length} items</span>
        )}
      </div>
      <div className="flex flex-col gap-1 flex-1 overflow-y-auto max-h-[6.5rem] sm:max-h-none">
        {viewMode === "income" && shiftEarnings && (
          <div className={`p-1.5 rounded border flex items-center justify-between ${
            shiftEarnings.isWork 
              ? (isDark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700") 
              : (isDark ? "bg-zinc-800/50 border-zinc-700 text-zinc-400" : "bg-slate-100 border-slate-200 text-slate-500")
          }`}>
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-bold uppercase">{shiftEarnings.status}</span>
            </div>
            {shiftEarnings.total > 0 && (
              <span className="text-[10px] font-bold">
                {new Intl.NumberFormat(currency.locale, { style: "currency", currency: currency.code, maximumFractionDigits: 0 }).format(shiftEarnings.total)}
              </span>
            )}
          </div>
        )}
        {payoutAmount !== undefined && payoutAmount > 0 && (
          <div className="mt-1 px-1.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-bold text-[10px] leading-tight flex items-center justify-between shadow-sm">
            <span className="flex items-center gap-1"><Coins size={10} /> PAYOUT</span>
            <span>{formatCurrency(payoutAmount, currency)}</span>
          </div>
        )}
        {visibleItems.map((item) => (
          <EventCard
            key={item.id}
            item={item}
            currency={currency}
            paid={isPaid(item.id, month, year, paymentHistory)}
            missed={missedBills.has(item.id)}
            onToggle={onToggle}
            theme={theme}
          />
        ))}
      </div>
      {dailyBalance !== undefined && (
        <div className="mt-auto pt-1 flex justify-end shrink-0">
          <span className={`text-[9px] font-bold tracking-tight px-1.5 py-0.5 rounded transition-all duration-200
            ${dailyBalance < 0 
              ? isDark 
                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                : "bg-rose-55 text-rose-700 border border-rose-200" 
              : isDark 
                ? "text-zinc-500 hover:text-zinc-400" 
                : "text-slate-400 hover:text-slate-650"
            }`}
          >
            {formatCurrency(dailyBalance, currency)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  ADD ITEM MODAL
// ─────────────────────────────────────────────

interface AddItemModalProps {
  open: boolean;
  currency: Currency;
  theme: "light" | "dark";
  onClose: () => void;
  onAdd: (item: BillOrLoan) => void;
}

const TODAY = new Date();

const EMPTY_FORM = {
  title: "",
  amount: "",
  type: "bill" as ItemType,
  frequency: "monthly" as Frequency,
  // monthly
  due_day: "1",
  // bimonthly
  due_day_a: "1",
  due_day_b: "15",
  // weekly
  due_day_of_week: "5", // 5 = Friday
  // once
  specific_date: "",
  // monthly + bimonthly + weekly start/end dates
  start_month: String(TODAY.getMonth()),      // 0-indexed
  start_year:  String(TODAY.getFullYear()),
  has_end_date: false,
  end_month: String(TODAY.getMonth()),
  end_year: String(TODAY.getFullYear() + 1),
  // Duration properties
  duration_mode: "ongoing" as "ongoing" | "preset" | "custom",
  duration_preset: "12",
  duration_custom: "12",
};

function AddItemModal({ open, currency, theme, onClose, onAdd }: AddItemModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isDark = theme === "dark";
  const s = {
    bg: isDark ? "bg-[#0c0c0e] text-zinc-100 border-zinc-800" : "bg-white text-slate-800 border-slate-200/80",
    bgSub: isDark ? "bg-zinc-900" : "bg-slate-50/70",
    border: isDark ? "border-zinc-800" : "border-slate-200/60",
    textMuted: isDark ? "text-zinc-400" : "text-slate-400",
    textSub: isDark ? "text-zinc-300" : "text-slate-500",
    textTitle: isDark ? "text-white" : "text-slate-800",
    primaryBtn: "bg-pink-600 hover:bg-pink-500 text-white shadow-lg shadow-pink-500/10 active:scale-[0.98] transition-all",
    secondaryBtn: isDark 
      ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-200 hover:text-white" 
      : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700 hover:text-slate-900",
    input: isDark
      ? "bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-550 focus:ring-pink-500/40 focus:border-pink-500/60"
      : "bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:ring-pink-500/30 focus:border-pink-500/50",
  };
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // custom dates list
  const [customDates, setCustomDates] = useState<string[]>([]);
  const [customDateInput, setCustomDateInput] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setErrors({});
      setCustomDates([]);
      setCustomDateInput("");
      setTimeout(() => titleRef.current?.focus(), 80);
    }
  }, [open]);

  // Reactive duration calculator
  useEffect(() => {
    const sy = parseInt(form.start_year);
    const sm = parseInt(form.start_month);
    if (isNaN(sy) || isNaN(sm)) return;

    if (form.duration_mode === "ongoing") {
      setForm((f) => ({ ...f, has_end_date: false }));
    } else {
      const months = form.duration_mode === "preset"
        ? parseInt(form.duration_preset)
        : parseInt(form.duration_custom);
      
      if (!isNaN(months) && months > 0) {
        const totalStartMonths = sy * 12 + sm;
        const totalEndMonths = totalStartMonths + months - 1;
        const ey = Math.floor(totalEndMonths / 12);
        const em = totalEndMonths % 12;

        setForm((f) => ({
          ...f,
          has_end_date: true,
          end_month: String(em),
          end_year: String(ey),
        }));
      }
    }
  }, [form.start_month, form.start_year, form.duration_mode, form.duration_preset, form.duration_custom]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const isFormDirty = form.title.trim() !== "" || form.amount !== "" || customDates.length > 0;
        if (isFormDirty) {
          setShowExitConfirm(true);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, form.title, form.amount, customDates]);

  const addCustomDate = () => {
    if (!customDateInput) return;
    if (customDates.includes(customDateInput)) return; // no duplicates
    setCustomDates((d) => [...d, customDateInput].sort());
    setCustomDateInput("");
    setErrors((e) => { const n = { ...e }; delete n.custom_dates; return n; });
  };

  const removeCustomDate = (iso: string) =>
    setCustomDates((d) => d.filter((x) => x !== iso));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Title is required";
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) errs.amount = "Enter a valid amount greater than 0";
    if (form.frequency === "monthly") {
      const day = parseInt(form.due_day);
      if (isNaN(day) || day < 1 || day > 31) errs.due_day = "Day must be between 1 and 31";
    } else if (form.frequency === "bimonthly") {
      const a = parseInt(form.due_day_a), b = parseInt(form.due_day_b);
      if (isNaN(a) || a < 1 || a > 31) errs.due_day_a = "Day must be 1–31";
      if (isNaN(b) || b < 1 || b > 31) errs.due_day_b = "Day must be 1–31";
      if (!isNaN(a) && !isNaN(b) && a === b) errs.due_day_b = "The two days must be different";
    } else if (form.frequency === "weekly") {
      const dow = parseInt(form.due_day_of_week);
      if (isNaN(dow) || dow < 0 || dow > 6) errs.due_day_of_week = "Select a valid day of the week";
    } else if (form.frequency === "custom") {
      if (customDates.length === 0) errs.custom_dates = "Add at least one date";
    } else {
      if (!form.specific_date) errs.specific_date = "Please pick a date";
    }

    if (form.frequency === "monthly" || form.frequency === "bimonthly" || form.frequency === "custom" || form.frequency === "weekly") {
      if (form.duration_mode === "custom") {
        const months = parseInt(form.duration_custom);
        if (isNaN(months) || months <= 0) {
          errs.end_date = "Please enter a valid duration of 1 month or more";
        }
      }
      if (form.has_end_date) {
        const sy = parseInt(form.start_year), sm = parseInt(form.start_month);
        const ey = parseInt(form.end_year), em = parseInt(form.end_month);
        if (ey < sy || (ey === sy && em < sm)) {
          errs.end_date = "End date must be after start date";
        }
      }
    }
    return errs;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const base = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: form.title.trim(),
      amount: parseFloat(form.amount),
      type: form.type,
      frequency: form.frequency,
    };
    const startFields = (form.frequency === "monthly" || form.frequency === "bimonthly" || form.frequency === "custom" || form.frequency === "weekly")
      ? { 
          start_month: parseInt(form.start_month), 
          start_year: parseInt(form.start_year),
          ...(form.has_end_date ? { end_month: parseInt(form.end_month), end_year: parseInt(form.end_year) } : {})
        }
      : {};
    let newItem: BillOrLoan;
    if (form.frequency === "monthly") {
      newItem = { ...base, ...startFields, due_day: parseInt(form.due_day) };
    } else if (form.frequency === "bimonthly") {
      const a = parseInt(form.due_day_a), b = parseInt(form.due_day_b);
      newItem = { ...base, ...startFields, due_days: [Math.min(a, b), Math.max(a, b)] };
    } else if (form.frequency === "weekly") {
      newItem = { ...base, ...startFields, due_day_of_week: parseInt(form.due_day_of_week) };
    } else if (form.frequency === "custom") {
      newItem = { ...base, ...startFields, custom_dates: customDates };
    } else {
      newItem = { ...base, specific_date: form.specific_date };
    }
    onAdd(newItem);
    onClose();
  };

  const setField = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((err) => { const next = { ...err }; delete next[field]; return next; });
  };

  const inputCls = (field: string) =>
    `w-full border rounded-xl px-3 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2 ${
      isDark 
        ? `bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus:ring-pink-500/40 ${errors[field] ? "border-rose-500/60 focus:border-rose-500" : "border-zinc-800 focus:border-pink-500/60"}`
        : `bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:ring-pink-500/30 ${errors[field] ? "border-rose-500/60 focus:border-rose-500" : "border-slate-200 focus:border-pink-500/50"}`
    }`;

  // Frequency option metadata
  const freqOptions: { value: Frequency; label: string; sub: string }[] = [
    { value: "monthly",   label: "Monthly",    sub: "Same day each month" },
    { value: "bimonthly", label: "Bi-monthly", sub: "Two days per month" },
    { value: "weekly",    label: "Weekly",     sub: "Same day each week" },
    { value: "custom",    label: "Custom",     sub: "Pick specific dates" },
    { value: "once",      label: "One-time",   sub: "Single date" },
  ];

  // Preview label for the chip
  const previewFreqLabel = () => {
    let startStr = "";
    if (form.frequency === "monthly" || form.frequency === "bimonthly" || form.frequency === "custom" || form.frequency === "weekly") {
      startStr = ` · from ${MONTH_NAMES[parseInt(form.start_month)].slice(0, 3)} ${form.start_year}`;
      if (form.has_end_date) startStr += ` to ${MONTH_NAMES[parseInt(form.end_month)].slice(0, 3)} ${form.end_year}`;
    }
    if (form.frequency === "monthly") return `Monthly · Day ${form.due_day}${startStr}`;
    if (form.frequency === "bimonthly") return `Bi-monthly · Days ${form.due_day_a} & ${form.due_day_b}${startStr}`;
    if (form.frequency === "weekly") {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return `Weekly · Every ${days[parseInt(form.due_day_of_week)]}${startStr}`;
    }
    if (form.frequency === "custom") return `Custom · ${customDates.length} date${customDates.length !== 1 ? "s" : ""}`;
    if (form.specific_date) return new Date(form.specific_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return "One-time";
  };

  const renderDateRange = () => (
    <div className={`space-y-4 mt-4 border-t pt-4 animate-in fade-in duration-300 ${isDark ? "border-zinc-900" : "border-slate-150"}`}>
      <div>
        <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          <span className="flex items-center gap-1.5"><CalendarDays size={11} /> Starts From</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.start_month} onChange={(e) => setForm((f) => ({ ...f, start_month: e.target.value }))}
            className={`border rounded-xl px-3 py-2.5 text-sm outline-none transition-all ${
              isDark 
                ? "bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-pink-500/60 [color-scheme:dark]" 
                : "bg-slate-50 border-slate-200 text-slate-800 focus:border-pink-500/50"
            }`}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={form.start_year} onChange={(e) => setForm((f) => ({ ...f, start_year: e.target.value }))}
            className={`border rounded-xl px-3 py-2.5 text-sm outline-none transition-all ${
              isDark 
                ? "bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-pink-500/60 [color-scheme:dark]" 
                : "bg-slate-50 border-slate-200 text-slate-800 focus:border-pink-500/50"
            }`}>
            {Array.from({ length: 8 }, (_, i) => TODAY.getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={`block text-xs font-semibold mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          <span className="flex items-center gap-1.5"><CalendarDays size={11} /> Select Duration</span>
        </label>
        
        {/* Presets and options button grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, duration_mode: "ongoing", has_end_date: false }))}
            className={`py-2 text-xs font-bold rounded-xl border transition-all duration-200 ${
              form.duration_mode === "ongoing"
                ? "bg-pink-500/10 border-pink-500 text-pink-550 shadow-sm"
                : isDark
                  ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  : "bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
          >
            Ongoing
          </button>
          
          {[3, 6, 12].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setForm((f) => ({ ...f, duration_mode: "preset", duration_preset: String(m), has_end_date: true }))}
              className={`py-2 text-xs font-bold rounded-xl border transition-all duration-200 ${
                form.duration_mode === "preset" && form.duration_preset === String(m)
                  ? "bg-pink-500/10 border-pink-500 text-pink-550 shadow-sm"
                  : isDark
                    ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    : "bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-700"
              }`}
            >
              {m} Mos
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[24, 36, 60].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setForm((f) => ({ ...f, duration_mode: "preset", duration_preset: String(m), has_end_date: true }))}
              className={`py-2 text-xs font-bold rounded-xl border transition-all duration-200 ${
                form.duration_mode === "preset" && form.duration_preset === String(m)
                  ? "bg-pink-500/10 border-pink-500 text-pink-550 shadow-sm"
                  : isDark
                    ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    : "bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-700"
              }`}
            >
              {m} Mos
            </button>
          ))}

          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, duration_mode: "custom", has_end_date: true }))}
            className={`py-2 text-xs font-bold rounded-xl border transition-all duration-200 ${
              form.duration_mode === "custom"
                ? "bg-pink-500/10 border-pink-500 text-pink-550 shadow-sm"
                : isDark
                  ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  : "bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
          >
            Custom
          </button>
        </div>

        {/* Custom duration input field */}
        {form.duration_mode === "custom" && (
          <div className="flex items-center gap-2.5 mb-2.5 animate-in slide-in-from-top-1 duration-200">
            <input
              type="number"
              min="1"
              max="600"
              value={form.duration_custom}
              onChange={(e) => setForm((f) => ({ ...f, duration_custom: e.target.value }))}
              className={`w-24 border rounded-xl px-3 py-2 text-sm outline-none transition-all ${
                isDark 
                  ? "bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-pink-500/60" 
                  : "bg-slate-50 border-slate-200 text-slate-800 focus:border-pink-500/50"
              }`}
              placeholder="Months"
            />
            <span className={`text-xs ${isDark ? "text-zinc-500" : "text-slate-400"}`}>months duration</span>
          </div>
        )}
      </div>

      {errors.end_date && <p className="text-xs text-rose-500">{errors.end_date}</p>}
      
      <div className={`p-3 rounded-xl border text-xs ${
        isDark ? "bg-zinc-950/40 border-zinc-900" : "bg-slate-50/70 border-slate-150"
      }`}>
        <p className={`font-semibold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
          Active Period:
        </p>
        <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-450"}`}>
          Starts in <strong className="text-pink-600 font-bold">{MONTH_NAMES[parseInt(form.start_month)]} {form.start_year}</strong>
          {form.has_end_date ? (
            <> and ends in <strong className="text-pink-600 font-bold">{MONTH_NAMES[parseInt(form.end_month)]} {form.end_year}</strong> (duration of {form.duration_mode === "preset" ? form.duration_preset : form.duration_custom} months).</>
          ) : (
            " and continues indefinitely."
          )}
        </p>
      </div>
    </div>
  );

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          const isFormDirty = form.title.trim() !== "" || form.amount !== "" || customDates.length > 0;
          if (isFormDirty) {
            setShowExitConfirm(true);
          } else {
            onClose();
          }
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm"
      style={{ animation: "fadeIn 0.15s ease" }}
    >
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(16px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>

      <div
        className={`w-full max-w-md border rounded-2xl shadow-2xl flex flex-col max-h-[96vh] sm:max-h-[92vh] overflow-hidden ${s.bg}`}
        style={{ animation: "slideUp 0.2s cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* Modal header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${isDark ? "border-zinc-900 bg-zinc-950" : "border-slate-150 bg-white"}`}>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? "bg-pink-950/20 border border-pink-500/20" : "bg-pink-100 border border-pink-200"}`}>
              <CalendarPlus size={15} className="text-pink-600" />
            </div>
            <h2 className={`text-base font-bold ${s.textTitle}`}>Add New Item</h2>
          </div>
          <button
            onClick={() => {
              const isFormDirty = form.title.trim() !== "" || form.amount !== "" || customDates.length > 0;
              if (isFormDirty) {
                setShowExitConfirm(true);
              } else {
                onClose();
              }
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isDark ? "bg-zinc-900 text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200" : "bg-slate-100 text-slate-550 hover:bg-slate-200 hover:text-slate-800"
            }`}
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">

          {/* ── Type toggle ── */}
          <div>
            <label className={`block text-xs font-semibold mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["bill", "loan", "income"] as ItemType[]).map((t) => (
                <button key={t} type="button"
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold capitalize transition-all duration-200
                    ${form.type === t
                      ? t === "bill" ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-500" : t === "loan" ? "bg-orange-500/10 border-orange-500/50 text-orange-500" : "bg-emerald-500/10 border-emerald-500/50 text-emerald-500"
                      : isDark ? "bg-zinc-900 border-zinc-800 text-zinc-450 hover:text-zinc-200" : "bg-slate-50 border-slate-200 text-slate-450 hover:text-slate-700"}`}
                >
                  {t === "bill" ? <Receipt size={14} /> : t === "loan" ? <CreditCard size={14} /> : <Banknote size={14} />} {t}
                </button>
              ))}
            </div>
          </div>

          {/* ── Title ── */}
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <span className="flex items-center gap-1.5"><Tag size={11} /> Title</span>
            </label>
            <input ref={titleRef} type="text" value={form.title} onChange={setField("title")}
              placeholder={form.type === "bill" ? "e.g. Netflix, Rent…" : form.type === "loan" ? "e.g. Car Loan, Mortgage…" : "e.g. Salary, Side Hustle…"}
              className={inputCls("title")} maxLength={60} />
            {errors.title && <p className="text-xs text-rose-500 mt-1">{errors.title}</p>}
          </div>

          {/* ── Amount ── */}
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <span className="flex items-center gap-1.5"><Coins size={11} /> Amount ({currency.code})</span>
            </label>
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold ${isDark ? "text-zinc-550" : "text-slate-400"}`}>{currency.symbol}</span>
              <input type="number" value={form.amount} onChange={setField("amount")}
                placeholder="0" min="0.01" step="0.01" className={`${inputCls("amount")} pl-8`} />
            </div>
            {errors.amount && <p className="text-xs text-rose-500 mt-1">{errors.amount}</p>}
          </div>

          {/* ── Frequency – 4 option grid ── */}
          <div>
            <label className={`block text-xs font-semibold mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>Frequency</label>
            <div className="grid grid-cols-2 gap-2">
              {freqOptions.map(({ value, label, sub }) => (
                <button key={value} type="button"
                  onClick={() => { setForm((f) => ({ ...f, frequency: value })); setErrors({}); }}
                  className={`flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition-all duration-200
                    ${form.frequency === value
                      ? "bg-pink-500/10 border-pink-500 text-pink-550 shadow-sm"
                      : isDark ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200" : "bg-slate-50 border-slate-200 text-slate-550 hover:text-slate-700"}`}
                >
                  <span className={`text-xs font-bold ${ form.frequency === value ? "text-pink-550" : isDark ? "text-zinc-300" : "text-slate-700"}`}>{label}</span>
                  <span className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Frequency-specific inputs ── */}

          {/* MONTHLY */}
          {form.frequency === "monthly" && (
            <div className="space-y-3">
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  <span className="flex items-center gap-1.5"><Hash size={11} /> {form.type === "income" ? "Day of Month" : "Due Day of Month"}</span>
                </label>
                <input type="number" value={form.due_day} onChange={setField("due_day")}
                  min="1" max="31" placeholder="e.g. 15" className={inputCls("due_day")} />
                {errors.due_day && <p className="text-xs text-rose-500 mt-1">{errors.due_day}</p>}
                <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-550" : "text-slate-450"}`}>Appears on day <strong className={isDark ? "text-zinc-300" : "text-slate-600"}>{form.due_day || "?"}</strong> of every month.</p>
              </div>
              {/* Start Month */}
              {renderDateRange()}
            </div>
          )}

          {/* BI-MONTHLY */}
          {form.frequency === "bimonthly" && (
            <div className="space-y-3">
              <p className={`text-xs ${isDark ? "text-zinc-500" : "text-slate-450"}`}>Enter the two days of the month this item {form.type === "income" ? "occurs" : "is due"}.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    <span className="flex items-center gap-1.5"><Hash size={11} /> First {form.type === "income" ? "Day" : "Due Day"}</span>
                  </label>
                  <input type="number" value={form.due_day_a} onChange={setField("due_day_a")}
                    min="1" max="31" placeholder="e.g. 1" className={inputCls("due_day_a")} />
                  {errors.due_day_a && <p className="text-xs text-rose-500 mt-1">{errors.due_day_a}</p>}
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    <span className="flex items-center gap-1.5"><Hash size={11} /> Second {form.type === "income" ? "Day" : "Due Day"}</span>
                  </label>
                  <input type="number" value={form.due_day_b} onChange={setField("due_day_b")}
                    min="1" max="31" placeholder="e.g. 15" className={inputCls("due_day_b")} />
                  {errors.due_day_b && <p className="text-xs text-rose-500 mt-1">{errors.due_day_b}</p>}
                </div>
              </div>
              <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-550" : "text-slate-450"}`}>Appears on days <strong className={isDark ? "text-zinc-300" : "text-slate-600"}>{form.due_day_a}</strong> and <strong className={isDark ? "text-zinc-300" : "text-slate-600"}>{form.due_day_b}</strong> every month.</p>
              {/* Start Month */}
              {renderDateRange()}
            </div>
          )}

          {/* WEEKLY */}
          {form.frequency === "weekly" && (
            <div className="space-y-3">
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  <span className="flex items-center gap-1.5"><CalendarDays size={11} /> Day of the Week</span>
                </label>
                <select value={form.due_day_of_week} onChange={setField("due_day_of_week")}
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none transition-all ${
                    isDark 
                      ? "bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-pink-500/60 [color-scheme:dark]" 
                      : "bg-slate-50 border-slate-200 text-slate-800 focus:border-pink-500/50"
                  }`}>
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
                {errors.due_day_of_week && <p className="text-xs text-rose-500 mt-1">{errors.due_day_of_week}</p>}
                <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-550" : "text-slate-450"}`}>Appears every <strong className={isDark ? "text-zinc-300" : "text-slate-600"}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][parseInt(form.due_day_of_week)]}</strong> of the month.</p>
              </div>
              {/* Start Month */}
              {renderDateRange()}
            </div>
          )}

          {/* CUSTOM DATES */}
          {form.frequency === "custom" && (
            <div className="space-y-2">
              <label className={`block text-xs font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                <span className="flex items-center gap-1.5"><CalendarDays size={11} /> Specific {form.type === "income" ? "Dates" : "Due Dates"}</span>
              </label>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-450"}`}>Add each date this item {form.type === "income" ? "occurs" : "is due"}. These appear once on the calendar.</p>

              {/* Date adder row */}
              <div className="flex gap-2">
                <input
                  type="date"
                  value={customDateInput}
                  onChange={(e) => setCustomDateInput(e.target.value)}
                  className={`flex-1 border rounded-xl px-3 py-2 text-sm outline-none transition-all ${
                    isDark 
                      ? "bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-pink-500/60 focus:ring-1 focus:ring-pink-550/40 [color-scheme:dark]" 
                      : "bg-slate-50 border-slate-300 text-slate-800 focus:border-pink-500/50"
                  }`}
                />
                <button
                  type="button"
                  onClick={addCustomDate}
                  disabled={!customDateInput}
                  className="flex items-center gap-1.5 px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-pink-600/10 cursor-pointer"
                >
                  <Plus size={13} /> Add
                </button>
              </div>

              {/* Added dates list */}
              {customDates.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {customDates.map((iso) => (
                    <div key={iso} className={`flex items-center justify-between border rounded-lg px-3 py-2 ${
                      isDark ? "bg-zinc-900/60 border-zinc-800/40 text-zinc-100" : "bg-slate-50 border-slate-150 text-slate-800"
                    }`}>
                      <div className="flex items-center gap-2">
                        <CalendarDays size={12} className="text-pink-600 shrink-0" />
                        <span className={`text-xs font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                          {new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                      <button type="button" onClick={() => removeCustomDate(iso)}
                        className={`transition-colors ml-2 cursor-pointer ${isDark ? "text-zinc-500 hover:text-rose-400" : "text-slate-400 hover:text-rose-500"}`}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`flex items-center justify-center h-16 border border-dashed rounded-xl text-xs ${
                  isDark ? "border-zinc-800 text-zinc-550" : "border-slate-350 text-slate-500"
                }`}>
                  No dates added yet
                </div>
              )}
              {errors.custom_dates && <p className="text-xs text-rose-500">{errors.custom_dates}</p>}
              {/* Start/End Months active range selections */}
              {renderDateRange()}
            </div>
          )}

          {/* ONE-TIME */}
          {form.frequency === "once" && (
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                <span className="flex items-center gap-1.5"><CalendarDays size={11} /> {form.type === "income" ? "Date" : "Due Date"}</span>
              </label>
              <input type="date" value={form.specific_date} onChange={setField("specific_date")}
                className={`${inputCls("specific_date")} [color-scheme:dark]`} />
              {errors.specific_date && <p className="text-xs text-rose-500 mt-1">{errors.specific_date}</p>}
            </div>
          )}

          {/* ── Live preview chip ── */}
          {form.title && form.amount && (
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${
              form.type === "bill" ? "bg-indigo-900/10 border-indigo-500/25" : form.type === "loan" ? "bg-orange-900/10 border-orange-500/25" : "bg-emerald-900/10 border-emerald-500/25"
            }`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                form.type === "bill" ? "bg-indigo-500/20" : form.type === "loan" ? "bg-orange-500/20" : "bg-emerald-500/20"
              }`}>
                {form.type === "bill" ? <Receipt size={14} className="text-indigo-500" /> : form.type === "loan" ? <CreditCard size={14} className="text-orange-500" /> : <Banknote size={14} className="text-emerald-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${form.type === "bill" ? "text-indigo-650 dark:text-indigo-400" : form.type === "loan" ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {form.title}
                </p>
                <p className={`text-[10px] ${s.textMuted}`}>{previewFreqLabel()}</p>
              </div>
              <span className={`text-sm font-bold shrink-0 ${form.type === "bill" ? "text-indigo-550" : form.type === "loan" ? "text-orange-500" : "text-emerald-500"}`}>
                {formatCurrency(parseFloat(form.amount) || 0, currency)}
              </span>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                const isFormDirty = form.title.trim() !== "" || form.amount !== "" || customDates.length > 0;
                if (isFormDirty) {
                  setShowExitConfirm(true);
                } else {
                  onClose();
                }
              }}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${s.secondaryBtn}`}
            >
              Cancel
            </button>
            <button type="submit"
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                form.type === "bill"
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                  : form.type === "loan" ? "bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-600/20" : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
              }`}>
              <Plus size={15} />
              Add {form.type === "bill" ? "Bill" : form.type === "loan" ? "Loan" : "Income"}
            </button>
          </div>
        </form>
      </div>

      {showExitConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-sm border rounded-2xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 ${
            isDark ? "bg-zinc-950 border-zinc-900 text-zinc-100" : "bg-white border-slate-200 text-slate-800"
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle size={18} className="text-rose-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Discard Unsaved Changes?</h3>
                <p className={`text-xs mt-1 leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-450"}`}>
                  You have unsaved changes in your new item. Are you sure you want to close and lose them?
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-colors ${s.secondaryBtn}`}
              >
                No, Keep Editing
              </button>
              <button
                type="button"
                onClick={() => { setShowExitConfirm(false); onClose(); }}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-600/10"
              >
                Yes, Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  MANAGE DRAWER
// ─────────────────────────────────────────────

interface ManageDrawerProps {
  open: boolean;
  items: BillOrLoan[];
  currency: Currency;
  theme: "light" | "dark";
  onClose: () => void;
  onDeleteOne: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  onDeleteAll: () => void;
  onReset: () => void;
}

function ManageDrawer({ open, items, currency, theme, onClose, onDeleteOne, onDeleteMany, onDeleteAll, onReset }: ManageDrawerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAll, setConfirmAll] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "bill" | "loan">("all");
  const drawerRef = useRef<HTMLDivElement>(null);
  const isDark = theme === "dark";
  const s = {
    bg: isDark ? "bg-[#09090b] text-zinc-150 sm:border-l border-zinc-900/80" : "bg-white text-slate-800 sm:border-l border-slate-200",
    border: isDark ? "border-zinc-900 bg-zinc-950" : "border-slate-150 bg-slate-50/50",
    cardBg: isDark ? "bg-zinc-900/30 border-zinc-850/50 hover:border-zinc-800" : "bg-slate-50 border-slate-200/60 hover:bg-slate-100/50 hover:border-slate-300",
    textSub: isDark ? "text-zinc-500" : "text-slate-400",
    textTitle: isDark ? "text-zinc-100" : "text-slate-800",
    secondaryBtn: isDark 
      ? "bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-300 hover:text-zinc-100" 
      : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700 hover:text-slate-900",
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  // Reset selection when drawer closes
  useEffect(() => {
    if (!open) { setSelected(new Set()); setConfirmAll(false); setFilterType("all"); }
  }, [open]);

  const filtered = items.filter(i => filterType === "all" || i.type === filterType);
  const allFilteredSelected = filtered.length > 0 && filtered.every(i => selected.has(i.id));

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected(prev => { const next = new Set(prev); filtered.forEach(i => next.delete(i.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); filtered.forEach(i => next.add(i.id)); return next; });
    }
  };

  const handleDeleteSelected = () => {
    onDeleteMany(Array.from(selected));
    setSelected(new Set());
  };

  const handleDeleteAll = () => {
    onDeleteAll();
    setConfirmAll(false);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 z-40 h-full w-full max-w-md shadow-2xl flex flex-col transition-transform duration-300 ease-out ${s.bg} ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 sm:px-5 py-4 border-b ${isDark ? "border-zinc-900/80 bg-zinc-950" : "border-slate-150 bg-white"}`}>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? "bg-pink-950/20 border border-pink-500/20" : "bg-pink-100 border border-pink-200"}`}>
              <Settings2 size={16} className="text-pink-600" />
            </div>
            <h2 className={`text-base font-bold ${s.textTitle}`}>Manage Items</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isDark ? "bg-zinc-900 text-zinc-400" : "bg-slate-100 text-slate-500"}`}>{items.length}</span>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isDark ? "bg-zinc-900 text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
            }`}
          >
            <X size={16} />
          </button>
        </div>

        {/* Actions bar */}
        <div className={`px-4 sm:px-5 py-3 border-b space-y-3 ${isDark ? "border-zinc-900/80" : "border-slate-150"}`}>
          {/* Filter tabs */}
          <div className={`flex gap-1 p-1 rounded-xl border ${isDark ? "bg-zinc-900 border-zinc-900" : "bg-slate-100 border-slate-150"}`}>
            {(["all", "bill", "loan"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all duration-200
                  ${filterType === f 
                    ? "bg-pink-600 text-white shadow-md shadow-pink-500/10" 
                    : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"}`}
              >
                {f === "all" ? `All (${items.length})` : f === "bill" ? `Bills (${items.filter(i => i.type === "bill").length})` : `Loans (${items.filter(i => i.type === "loan").length})`}
              </button>
            ))}
          </div>

          {/* Bulk action row */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className={`flex items-center gap-1.5 text-xs transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}
            >
              {allFilteredSelected
                ? <CheckSquare size={14} className="text-pink-600" />
                : <Square size={14} />}
              <span>{allFilteredSelected ? "Deselect all" : "Select all"}</span>
            </button>
            <div className="flex-1" />
            {selected.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/30 hover:border-rose-500 text-rose-500 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200"
              >
                <Trash2 size={12} />
                Remove {selected.size} selected
              </button>
            )}
          </div>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 space-y-2">
          {filtered.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-40 ${isDark ? "text-zinc-650" : "text-slate-400"}`}>
              <Receipt size={32} className="mb-2 opacity-40" />
              <p className="text-sm">No items to display</p>
            </div>
          ) : (
            filtered.map((item) => {
              const isLoan = item.type === "loan";
              const isSelected = selected.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 group ${
                    isSelected
                      ? isDark ? "border-pink-500/40 bg-pink-900/10" : "border-pink-500/30 bg-pink-50/15 shadow-sm"
                      : isLoan
                        ? isDark ? "border-orange-900/30 bg-orange-950/10 hover:border-orange-700/50" : "border-orange-100 bg-orange-50/20 hover:border-orange-200"
                        : isDark ? "border-indigo-900/30 bg-indigo-950/10 hover:border-indigo-700/50" : "border-indigo-100 bg-indigo-50/20 hover:border-indigo-200"}`}
                >
                  {/* Checkbox */}
                  <button onClick={() => toggleSelect(item.id)} className="shrink-0">
                    {isSelected
                      ? <CheckSquare size={16} className="text-pink-600" />
                      : <Square size={16} className={`transition-colors ${isDark ? "text-zinc-600 group-hover:text-zinc-400" : "text-slate-400 group-hover:text-slate-600"}`} />}
                  </button>

                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isLoan ? "bg-orange-500/10 border border-orange-500/15" : "bg-indigo-500/10 border border-indigo-500/15"}`}>
                    {isLoan ? <CreditCard size={14} className="text-orange-500" /> : <Receipt size={14} className="text-indigo-500" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isLoan ? "text-orange-500" : "text-indigo-500"}`}>
                      {item.title}
                    </p>
                    <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{getItemDueLabel(item)}</p>
                  </div>

                  {/* Amount */}
                  <span className={`text-sm font-bold shrink-0 ${isLoan ? "text-orange-500" : "text-indigo-600 dark:text-indigo-400"}`}>
                    {formatCurrency(item.amount, currency)}
                  </span>

                  {/* Delete single */}
                  <button
                    onClick={() => onDeleteOne(item.id)}
                    title="Remove this item"
                    className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 ${
                      isDark ? "text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10" : "text-slate-400 hover:text-rose-500 hover:bg-rose-500/5"
                    }`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer — danger zone */}
        <div className={`px-4 sm:px-5 py-4 border-t ${isDark ? "border-zinc-900/80 bg-zinc-950" : "border-slate-150 bg-white"}`}>
          {!confirmAll ? (
            <div className="flex items-center gap-3">
              <button
                onClick={onReset}
                className={`flex items-center gap-2 text-xs font-semibold transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}
              >
                <RefreshCcw size={13} />
                Reset defaults
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setConfirmAll(true)}
                disabled={items.length === 0}
                className={`flex items-center gap-2 border text-xs font-semibold px-4 py-2 rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
                  isDark 
                    ? "bg-zinc-900 hover:bg-rose-950/20 border-zinc-800 hover:border-rose-900/30 text-zinc-400 hover:text-rose-400" 
                    : "bg-slate-50 hover:bg-rose-50/50 border-slate-200 hover:border-rose-150 text-slate-500 hover:text-rose-500"
                }`}
              >
                <Trash2 size={13} />
                Remove All
              </button>
            </div>
          ) : (
            <div className={`border rounded-xl p-3 ${isDark ? "bg-rose-950/15 border-rose-900/40" : "bg-rose-50/30 border-rose-150"}`}>
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                <p className={`text-xs leading-snug ${isDark ? "text-rose-400" : "text-rose-600"}`}>
                  This will remove all <strong>{items.length} items</strong> from the calendar. This cannot be undone (use Reset to restore defaults).
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmAll(false)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-colors ${s.secondaryBtn}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAll}
                  className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-600/10"
                >
                  Yes, Remove All
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────
//  SHIFT EARNINGS CALCULATOR
// ─────────────────────────────────────────────

function parseTimeStr(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h + (m || 0) / 60;
}

export function computeShiftEarnings(dateIso: string, profile: WorkProfile, override?: ShiftOverride): { base: number; nd: number; total: number; isWork: boolean; status: ShiftStatus } {
  const dateObj = new Date(dateIso + "T00:00:00");
  const dow = dateObj.getDay();
  let status: ShiftStatus = profile.restDays.includes(dow) ? "rest" : "work";
  if (override?.status) status = override.status;

  if (status === "rest" || status === "vto") {
    return { base: 0, nd: 0, total: 0, isWork: false, status };
  }

  const sStart = parseTimeStr(profile.shiftStart);
  let sEnd = parseTimeStr(profile.shiftEnd);
  if (sEnd <= sStart) sEnd += 24;

  const totalShiftHours = (sEnd - sStart) - profile.unpaidBreakHours;
  const hoursToUse = override?.customHours !== undefined ? override.customHours : totalShiftHours;
  if (hoursToUse <= 0) return { base: 0, nd: 0, total: 0, isWork: false, status };

  const basePay = hoursToUse * profile.hourlyRate;
  
  let ndPay = 0;
  if (profile.hasNightDiff) {
    const ndStart = parseTimeStr(profile.nightDiffStart);
    let ndEnd = parseTimeStr(profile.nightDiffEnd);
    if (ndEnd <= ndStart) ndEnd += 24;

    let ndHoursOverlap = 0;
    const ndWindows = [
      [ndStart - 24, ndEnd - 24],
      [ndStart, ndEnd],
      [ndStart + 24, ndEnd + 24]
    ];
    for (const [winStart, winEnd] of ndWindows) {
      const overlapStart = Math.max(sStart, winStart);
      const overlapEnd = Math.min(sEnd, winEnd);
      if (overlapEnd > overlapStart) {
        ndHoursOverlap += (overlapEnd - overlapStart);
      }
    }

    const ratio = (totalShiftHours + profile.unpaidBreakHours > 0) ? (totalShiftHours / (totalShiftHours + profile.unpaidBreakHours)) : 1;
    let ndHours = ndHoursOverlap * ratio;

    const finalNdHours = override?.customHours !== undefined ? ndHours * (hoursToUse / totalShiftHours) : ndHours;
    ndPay = finalNdHours * profile.hourlyRate * profile.nightDiffRate;
  }
  
  let total = basePay + ndPay;
  if (status === "holiday") total *= 2;

  return { base: basePay, nd: ndPay, total, isWork: true, status };
}

export interface SalaryWindow {
  payoutDate: string; // ISO
  startDate: string; // ISO
  endDate: string; // ISO
}

export function getSalaryWindows(year: number, month: number, cutOffRanges: CutOffRange[], salaryDates: number[]): SalaryWindow[] {
  const windows: SalaryWindow[] = [];
  if (!cutOffRanges || !salaryDates || cutOffRanges.length === 0 || cutOffRanges.length !== salaryDates.length) return windows;

  for (let i = 0; i < salaryDates.length; i++) {
    const payDay = salaryDates[i];
    const range = cutOffRanges[i];
    
    let endMonth = month;
    let endYear = year;
    // If range ends after payday, it means this cycle happened in the previous month relative to payday
    if (range.end > payDay) {
      endMonth--;
      if (endMonth < 0) {
        endMonth = 11;
        endYear--;
      }
    }
    
    let startMonth = endMonth;
    let startYear = endYear;
    // If range starts after it ends, it means it crosses the month boundary
    if (range.start > range.end) {
      startMonth--;
      if (startMonth < 0) {
        startMonth = 11;
        startYear--;
      }
    }
    
    const startObj = new Date(startYear, startMonth, range.start);
    const endObj = new Date(endYear, endMonth, range.end);
    const payObj = new Date(year, month, payDay);
    
    windows.push({
      payoutDate: `${payObj.getFullYear()}-${String(payObj.getMonth()+1).padStart(2, '0')}-${String(payObj.getDate()).padStart(2, '0')}`,
      startDate: `${startObj.getFullYear()}-${String(startObj.getMonth()+1).padStart(2, '0')}-${String(startObj.getDate()).padStart(2, '0')}`,
      endDate: `${endObj.getFullYear()}-${String(endObj.getMonth()+1).padStart(2, '0')}-${String(endObj.getDate()).padStart(2, '0')}`,
    });
  }
  return windows;
}

export function computeWindowPayout(window: SalaryWindow, profile: WorkProfile, overrides: Record<string, ShiftOverride>, totalWindowsInMonth: number): number {
  let total = 0;
  const start = new Date(window.startDate + "T00:00:00");
  const end = new Date(window.endDate + "T00:00:00");
  const current = new Date(start);
  
  while (current <= end) {
    const iso = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
    total += computeShiftEarnings(iso, profile, overrides[iso]).total;
    current.setDate(current.getDate() + 1);
  }
  
  if (profile.monthlyAllowance) {
    total += profile.monthlyAllowance / totalWindowsInMonth;
  }
  
  return total;
}

// ─────────────────────────────────────────────
//  WORK PROFILE & SHIFT MODALS
// ─────────────────────────────────────────────

interface WorkProfileSetupModalProps {
  open: boolean;
  profile: WorkProfile;
  theme: "light" | "dark";
  onClose: () => void;
  onSave: (p: WorkProfile) => void;
}

function WorkProfileSetupModal({ open, profile, theme, onClose, onSave }: WorkProfileSetupModalProps) {
  const isDark = theme === "dark";
  const [form, setForm] = useState<WorkProfile>(profile);
  
  const [cutOffStr, setCutOffStr] = useState(() => (profile.cutOffRanges || []).map(r => `${r.start}-${r.end}`).join(", "));
  const [salaryDatesStr, setSalaryDatesStr] = useState(() => (profile.salaryDates || []).join(", "));
  const [hourlyRateStr, setHourlyRateStr] = useState(String(profile.hourlyRate || 0));
  const [ndRateStr, setNdRateStr] = useState(String((profile.nightDiffRate || 0) * 100));
  const [unpaidBreakStr, setUnpaidBreakStr] = useState(String(profile.unpaidBreakHours || 0));
  const [allowanceStr, setAllowanceStr] = useState(String(profile.monthlyAllowance || 0));

  const handleSave = () => {
    const finalForm = { ...form };
    finalForm.hourlyRate = parseFloat(hourlyRateStr) || 0;
    finalForm.nightDiffRate = (parseFloat(ndRateStr) || 0) / 100;
    finalForm.unpaidBreakHours = parseFloat(unpaidBreakStr) || 0;
    finalForm.monthlyAllowance = parseFloat(allowanceStr) || 0;

    const cutOffParts = cutOffStr.split(",");
    const newRanges = cutOffParts.map(p => {
      const [s, eDay] = p.split("-").map(n => parseInt(n.trim()));
      if (!isNaN(s) && !isNaN(eDay)) return { start: s, end: eDay };
      return null;
    }).filter(Boolean) as CutOffRange[];
    if (newRanges.length > 0) finalForm.cutOffRanges = newRanges;

    const newSalaryDates = salaryDatesStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    if (newSalaryDates.length > 0) finalForm.salaryDates = newSalaryDates;

    onSave(finalForm);
    onClose();
  };

  useEffect(() => { if (open) setForm(profile); }, [open, profile]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 ${isDark ? "bg-zinc-950 border border-zinc-800" : "bg-white border border-slate-200"}`}>
        <div className={`flex items-center justify-between p-4 border-b ${isDark ? "border-zinc-800" : "border-slate-150"}`}>
          <h2 className={`font-bold ${isDark ? "text-white" : "text-slate-800"}`}>Work Profile Setup</h2>
          <button onClick={onClose} className="p-1 rounded opacity-70 hover:opacity-100"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Hourly Rate</label>
              <input type="text" value={hourlyRateStr} onChange={e => setHourlyRateStr(e.target.value)} className={`w-full p-2 rounded-lg border outline-none ${isDark ? "bg-zinc-900 border-zinc-800 text-white" : "bg-slate-50 border-slate-200 text-black"}`} />
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1 flex items-center gap-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Monthly Allowance <span className="text-[9px] font-normal opacity-70">(Non-taxable)</span></label>
              <input type="text" value={allowanceStr} onChange={e => setAllowanceStr(e.target.value)} className={`w-full p-2 rounded-lg border outline-none ${isDark ? "bg-zinc-900 border-zinc-800 text-white" : "bg-slate-50 border-slate-200 text-black"}`} placeholder="e.g. 2000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Shift Start</label>
              <input type="time" value={form.shiftStart} onChange={e => setForm({ ...form, shiftStart: e.target.value })} className={`w-full p-2 rounded-lg border outline-none ${isDark ? "bg-zinc-900 border-zinc-800 text-white [color-scheme:dark]" : "bg-slate-50 border-slate-200 text-black"}`} />
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Shift End</label>
              <input type="time" value={form.shiftEnd} onChange={e => setForm({ ...form, shiftEnd: e.target.value })} className={`w-full p-2 rounded-lg border outline-none ${isDark ? "bg-zinc-900 border-zinc-800 text-white [color-scheme:dark]" : "bg-slate-50 border-slate-200 text-black"}`} />
            </div>
          </div>
          <div>
            <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Unpaid Break (Hours)</label>
            <input type="text" value={unpaidBreakStr} onChange={e => setUnpaidBreakStr(e.target.value)} className={`w-full p-2 rounded-lg border outline-none ${isDark ? "bg-zinc-900 border-zinc-800 text-white" : "bg-slate-50 border-slate-200 text-black"}`} />
          </div>

          <div className={`p-3 rounded-xl border ${isDark ? "bg-zinc-900/50 border-zinc-800" : "bg-slate-50 border-slate-200"}`}>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.hasNightDiff} onChange={e => setForm({ ...form, hasNightDiff: e.target.checked })} className="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500" />
              <span className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>Enable Night Differential</span>
            </label>
            <p className={`text-[10px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              Enable this if your account pays a premium for hours worked between late night and early morning.
            </p>
            
            {form.hasNightDiff && (
              <div className="mt-4 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Night Diff Start</label>
                    <input type="time" value={form.nightDiffStart} onChange={e => setForm({ ...form, nightDiffStart: e.target.value })} className={`w-full p-2 rounded-lg border outline-none ${isDark ? "bg-zinc-950 border-zinc-800 text-white [color-scheme:dark]" : "bg-white border-slate-200 text-black"}`} />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Night Diff End</label>
                    <input type="time" value={form.nightDiffEnd} onChange={e => setForm({ ...form, nightDiffEnd: e.target.value })} className={`w-full p-2 rounded-lg border outline-none ${isDark ? "bg-zinc-950 border-zinc-800 text-white [color-scheme:dark]" : "bg-white border-slate-200 text-black"}`} />
                  </div>
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Night Diff Rate (%)</label>
                  <input type="text" value={ndRateStr} onChange={e => setNdRateStr(e.target.value)} className={`w-full p-2 rounded-lg border outline-none ${isDark ? "bg-zinc-950 border-zinc-800 text-white" : "bg-white border-slate-200 text-black"}`} placeholder="e.g. 20" />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Cut-off Ranges (e.g. 21-5, 6-20)</label>
              <input 
                type="text" 
                value={cutOffStr} 
                onChange={e => setCutOffStr(e.target.value)} 
                className={`w-full p-2 rounded-lg border outline-none ${isDark ? "bg-zinc-900 border-zinc-800 text-white" : "bg-slate-50 border-slate-200 text-black"}`} 
                placeholder="21-5, 6-20" 
              />
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Salary Dates (e.g. 15, 30)</label>
              <input type="text" value={salaryDatesStr} onChange={e => setSalaryDatesStr(e.target.value)} className={`w-full p-2 rounded-lg border outline-none ${isDark ? "bg-zinc-900 border-zinc-800 text-white" : "bg-slate-50 border-slate-200 text-black"}`} placeholder="15, 30" />
            </div>
          </div>
          <div>
            <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Rest Days</label>
            <div className="flex flex-wrap gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                <button key={i} onClick={() => setForm(prev => ({ ...prev, restDays: (prev.restDays || []).includes(i) ? (prev.restDays || []).filter(d => d !== i) : [...(prev.restDays || []), i] }))} className={`px-2 py-1 text-xs rounded border transition-colors ${(form.restDays || []).includes(i) ? "bg-emerald-500 text-white border-emerald-600" : isDark ? "bg-zinc-900 border-zinc-800 text-zinc-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={`p-4 border-t flex gap-2 ${isDark ? "border-zinc-800" : "border-slate-150"}`}>
          <button onClick={handleSave} className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg transition-colors">Save Setup</button>
        </div>
      </div>
    </div>
  );
}

interface EditShiftModalProps {
  day: number | null;
  isoDate: string;
  override?: ShiftOverride;
  profile: WorkProfile;
  theme: "light" | "dark";
  onClose: () => void;
  onSave: (o: ShiftOverride | undefined) => void;
}

function EditShiftModal({ day, isoDate, override, profile, theme, onClose, onSave }: EditShiftModalProps) {
  const dateObj = new Date(isoDate + "T00:00:00");
  const dow = dateObj.getDay();
  const defaultStatus: ShiftStatus = profile.restDays.includes(dow) ? "rest" : "work";
  const [status, setStatus] = useState<ShiftStatus>(override?.status || defaultStatus);
  const [customHours, setCustomHours] = useState<string>(override?.customHours !== undefined ? String(override.customHours) : "");

  if (day === null) return null;
  const isDark = theme === "dark";

  const handleSave = () => {
    if (status === defaultStatus && customHours === "") {
      onSave(undefined);
    } else {
      onSave({ status, customHours: customHours ? parseFloat(customHours) : undefined });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 ${isDark ? "bg-zinc-950 border border-zinc-800" : "bg-white border border-slate-200"}`}>
        <div className={`flex items-center justify-between p-4 border-b ${isDark ? "border-zinc-800" : "border-slate-150"}`}>
          <h2 className={`font-bold ${isDark ? "text-white" : "text-slate-800"}`}>Edit Shift - Day {day}</h2>
          <button onClick={onClose} className="p-1 rounded opacity-70 hover:opacity-100"><X size={16} /></button>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div>
            <label className={`block text-xs font-semibold mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Status</label>
            <div className="grid grid-cols-2 gap-2">
              {(["work", "rest", "pto", "vto", "holiday"] as ShiftStatus[]).map(s => (
                <button key={s} onClick={() => setStatus(s)} className={`p-2 rounded-lg border text-xs font-bold uppercase transition-colors ${status === s ? "bg-emerald-500 text-white border-emerald-600" : isDark ? "bg-zinc-900 border-zinc-800 text-zinc-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Custom Hours (Optional)</label>
            <input type="number" step="0.5" value={customHours} onChange={e => setCustomHours(e.target.value)} placeholder="Leave blank for standard shift" className={`w-full p-2 rounded-lg border outline-none text-sm ${isDark ? "bg-zinc-900 border-zinc-800 text-white" : "bg-slate-50 border-slate-200 text-black"}`} />
          </div>
        </div>
        <div className={`p-4 border-t ${isDark ? "border-zinc-800" : "border-slate-150"}`}>
          <button onClick={handleSave} className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg transition-colors">Apply</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────

export default function App() {
  const today = new Date();

  // Active month state
  const [activeYear, setActiveYear] = useState(today.getFullYear());
  const [activeMonth, setActiveMonth] = useState(today.getMonth());

  // Theme state — persisted to localStorage
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("cashflow_theme");
      return (saved === "light" || saved === "dark") ? saved : "dark";
    } catch { return "dark"; }
  });

  // Items & payment history — persisted to localStorage
  const [billsAndLoans, setBillsAndLoans] = useState<BillOrLoan[]>(() => {
    try {
      const saved = localStorage.getItem("cashflow_bills");
      return saved ? (JSON.parse(saved) as BillOrLoan[]) : INITIAL_BILLS_AND_LOANS;
    } catch { return INITIAL_BILLS_AND_LOANS; }
  });

  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>(() => {
    try {
      const saved = localStorage.getItem("cashflow_payments");
      return saved ? (JSON.parse(saved) as PaymentRecord[]) : INITIAL_PAYMENT_HISTORY;
    } catch { return INITIAL_PAYMENT_HISTORY; }
  });

  // Currency — persisted to localStorage
  const [currency, setCurrency] = useState<Currency>(() => {
    try {
      const saved = localStorage.getItem("cashflow_currency");
      if (saved) {
        const code = JSON.parse(saved) as string;
        return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
      }
    } catch { /* fall through */ }
    return CURRENCIES[0];
  });

  // Sync to localStorage whenever data changes
  useEffect(() => { localStorage.setItem("cashflow_bills", JSON.stringify(billsAndLoans)); }, [billsAndLoans]);
  useEffect(() => { localStorage.setItem("cashflow_payments", JSON.stringify(paymentHistory)); }, [paymentHistory]);
  useEffect(() => { localStorage.setItem("cashflow_currency", JSON.stringify(currency.code)); }, [currency]);
  useEffect(() => { localStorage.setItem("cashflow_theme", theme); }, [theme]);

  // UI state
  const [viewMode, setViewMode] = useState<"expenses" | "income">("expenses");
  const [startingBalance, setStartingBalance] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("cashflow_starting_balance");
      return saved || "0";
    } catch { return "0"; }
  });
  useEffect(() => { localStorage.setItem("cashflow_starting_balance", startingBalance); }, [startingBalance]);

  const [currentBankBalance, setCurrentBankBalance] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("cashflow_bank_balance");
      return saved ? parseFloat(saved) : 0;
    } catch { return 0; }
  });
  useEffect(() => { localStorage.setItem("cashflow_bank_balance", String(currentBankBalance)); }, [currentBankBalance]);
  const [isEditingCash, setIsEditingCash] = useState(false);

  const [workProfile, setWorkProfile] = useState<WorkProfile>(() => {
    const defaults: WorkProfile = {
      hourlyRate: 250,
      shiftStart: "22:00",
      shiftEnd: "07:00",
      unpaidBreakHours: 1,
      restDays: [0, 6], // Sun, Sat
      hasNightDiff: true,
      nightDiffStart: "22:00",
      nightDiffEnd: "06:00",
      nightDiffRate: 0.20,
      monthlyAllowance: 2000,
      cutOffRanges: [
        { start: 26, end: 10 },
        { start: 11, end: 25 }
      ],
      salaryDates: [15, 30]
    };
    try {
      const saved = localStorage.getItem("cashflow_work_profile");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.hasNightDiff === undefined) {
          parsed.hasNightDiff = true; // Backward compatibility
        }
        if (parsed.cutOffs && !parsed.cutOffRanges) {
          parsed.cutOffRanges = parsed.cutOffs.map((endDay: number, i: number, arr: number[]) => {
            const startDay = i === 0 ? (arr[arr.length - 1] + 1) : (arr[i - 1] + 1);
            return { start: startDay > 31 ? 1 : startDay, end: endDay };
          });
        }
        return { ...defaults, ...parsed };
      }
      return defaults;
    } catch { return defaults; }
  });
  useEffect(() => { localStorage.setItem("cashflow_work_profile", JSON.stringify(workProfile)); }, [workProfile]);

  const [shiftOverrides, setShiftOverrides] = useState<Record<string, ShiftOverride>>(() => {
    try {
      const saved = localStorage.getItem("cashflow_shift_overrides");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem("cashflow_shift_overrides", JSON.stringify(shiftOverrides)); }, [shiftOverrides]);

  const [manageOpen, setManageOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [workProfileOpen, setWorkProfileOpen] = useState(false);
  const [editShiftDay, setEditShiftDay] = useState<number | null>(null);
  const [resetDataConfirmOpen, setResetDataConfirmOpen] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);

  const [hasSetupWorkProfile, setHasSetupWorkProfile] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("cashflow_has_setup_work");
      return saved === "true";
    } catch { return false; }
  });
  useEffect(() => { localStorage.setItem("cashflow_has_setup_work", String(hasSetupWorkProfile)); }, [hasSetupWorkProfile]);

  // ── Add item ─────────────────────────────────
  const handleAddItem = useCallback((item: BillOrLoan) => {
    setBillsAndLoans((prev) => [...prev, item]);
  }, []);

  // ── Navigation ───────────────────────────────
  const prevMonth = useCallback(() => {
    setActiveMonth((m) => { if (m === 0) { setActiveYear((y) => y - 1); return 11; } return m - 1; });
  }, []);
  const nextMonth = useCallback(() => {
    setActiveMonth((m) => { if (m === 11) { setActiveYear((y) => y + 1); return 0; } return m + 1; });
  }, []);

  // ── Payment toggle ───────────────────────────
  const togglePayment = useCallback((itemId: string) => {
    setPaymentHistory((prev) => {
      const idx = prev.findIndex(
        (r) => r.item_id === itemId && r.payment_month === activeMonth + 1 && r.payment_year === activeYear
      );
      if (idx !== -1) return prev.filter((_, i) => i !== idx);
      return [...prev, { item_id: itemId, payment_month: activeMonth + 1, payment_year: activeYear, status: "paid" }];
    });
  }, [activeMonth, activeYear]);

  // ── Delete handlers ──────────────────────────
  const handleDeleteOne = useCallback((id: string) => {
    setBillsAndLoans((prev) => prev.filter((i) => i.id !== id));
    setPaymentHistory((prev) => prev.filter((r) => r.item_id !== id));
  }, []);

  const handleDeleteMany = useCallback((ids: string[]) => {
    const set = new Set(ids);
    setBillsAndLoans((prev) => prev.filter((i) => !set.has(i.id)));
    setPaymentHistory((prev) => prev.filter((r) => !set.has(r.item_id)));
  }, []);

  const handleDeleteAll = useCallback(() => {
    setBillsAndLoans([]);
    setPaymentHistory([]);
  }, []);

  const handleReset = useCallback(() => {
    setBillsAndLoans(INITIAL_BILLS_AND_LOANS);
    setPaymentHistory(INITIAL_PAYMENT_HISTORY);
    setManageOpen(false);
  }, []);

  // ── Calendar grid ────────────────────────────
  const { firstDayOfWeek, totalDays } = useMemo(() => {
    const firstDay = new Date(activeYear, activeMonth, 1).getDay();
    const lastDay = new Date(activeYear, activeMonth + 1, 0).getDate();
    return { firstDayOfWeek: firstDay, totalDays: lastDay };
  }, [activeMonth, activeYear]);

  const gridCells = useMemo(() => {
    const cells: (number | null)[] = Array(firstDayOfWeek).fill(null);
    for (let d = 1; d <= totalDays; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [firstDayOfWeek, totalDays]);

  const isToday = (day: number | null) =>
    day !== null && activeYear === today.getFullYear() && activeMonth === today.getMonth() && day === today.getDate();

  // ── Metrics ──────────────────────────────────
  const activeItems = useMemo(() => billsAndLoans.filter((item) => {
    if ((item.frequency === "monthly" || item.frequency === "bimonthly" || item.frequency === "weekly") && isItemActive(item, activeMonth, activeYear)) {
      return true;
    }
    if (item.frequency === "once" && item.specific_date) {
      const d = new Date(item.specific_date + "T00:00:00");
      return d.getFullYear() === activeYear && d.getMonth() === activeMonth;
    }
    if (item.frequency === "custom" && item.custom_dates) {
      return item.custom_dates.some((iso) => {
        const d = new Date(iso + "T00:00:00");
        return d.getFullYear() === activeYear && d.getMonth() === activeMonth;
      });
    }
    return false;
  }), [billsAndLoans, activeMonth, activeYear]);

  const [appStartDate] = useState(() => {
    try {
      let saved = localStorage.getItem("cashflow_start_date");
      if (!saved) {
        const d = new Date();
        saved = `${d.getFullYear()}-${d.getMonth()}`;
        localStorage.setItem("cashflow_start_date", saved);
      }
      return saved;
    } catch { return `${new Date().getFullYear()}-${new Date().getMonth()}`; }
  });

  const { missedBills, currentBalance, projectedBalance, shiftIncomeTotal, activePayouts, dailyBalances, lowestProjectedBalance } = useMemo(() => {
    let bal = parseFloat(startingBalance) || 0;
    let earliestYear = activeYear;
    billsAndLoans.forEach(i => { if (i.start_year !== undefined && i.start_year < earliestYear) earliestYear = i.start_year; });

    const [startY, startM] = appStartDate.split("-").map(Number);
    
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();

    for (let y = earliestYear; y <= activeYear; y++) {
      const endM = (y === activeYear) ? activeMonth - 1 : 11;
      for (let m = 0; m <= endM; m++) {
        if (y === todayYear && m === todayMonth) {
          // Current month - calculate daily with pivot and paid overlap bypass
          let running = bal;
          const totalDaysInMonth = new Date(y, m + 1, 0).getDate();
          const monthWindows = getSalaryWindows(y, m, workProfile.cutOffRanges, workProfile.salaryDates);
          const payoutMap = new Map<number, number>();
          for (const w of monthWindows) {
            const pDay = parseInt(w.payoutDate.split("-")[2]);
            payoutMap.set(pDay, (payoutMap.get(pDay) || 0) + computeWindowPayout(w, workProfile, shiftOverrides, workProfile.salaryDates.length));
          }
          for (let d = 1; d <= totalDaysInMonth; d++) {
            if (d === todayDay) {
              running = currentBankBalance;
            }
            if (payoutMap.has(d)) {
              running += payoutMap.get(d)!;
            }
            const dayItems = getItemsForDay(billsAndLoans, d, m, y);
            dayItems.forEach(i => {
              if (d === todayDay && isPaid(i.id, m, y, paymentHistory)) {
                return; // Overlap Fix: Bypass paid item
              }
              if (i.type === "income") running += i.amount;
              else running -= i.amount;
            });
          }
          bal = running;
        } else if (y > todayYear || (y === todayYear && m > todayMonth)) {
          // Future month - project daily and carry forward
          let running = bal;
          const totalDaysInMonth = new Date(y, m + 1, 0).getDate();
          const monthWindows = getSalaryWindows(y, m, workProfile.cutOffRanges, workProfile.salaryDates);
          const payoutMap = new Map<number, number>();
          for (const w of monthWindows) {
            const pDay = parseInt(w.payoutDate.split("-")[2]);
            payoutMap.set(pDay, (payoutMap.get(pDay) || 0) + computeWindowPayout(w, workProfile, shiftOverrides, workProfile.salaryDates.length));
          }
          for (let d = 1; d <= totalDaysInMonth; d++) {
            if (payoutMap.has(d)) {
              running += payoutMap.get(d)!;
            }
            const dayItems = getItemsForDay(billsAndLoans, d, m, y);
            dayItems.forEach(i => {
              if (i.type === "income") running += i.amount;
              else running -= i.amount;
            });
          }
          bal = running;
        } else {
          // Historical past month
          const inc = computeMonthlyTotal(billsAndLoans, m, y, "income");
          const exp = computeMonthlyTotal(billsAndLoans, m, y, "bill+loan");
          bal += (inc - exp);
          if (y > startY || (y === startY && m >= startM)) {
            const windows = getSalaryWindows(y, m, workProfile.cutOffRanges, workProfile.salaryDates);
            for (const w of windows) {
              bal += computeWindowPayout(w, workProfile, shiftOverrides, workProfile.salaryDates.length);
            }
          }
        }
      }
    }

    const missed = new Set<string>();
    let runningBal = bal;
    let currentBal = bal;
    let shiftTotal = 0;
    const dailyBalances = new Map<number, number>();
    
    // Compute current month salary payouts
    const currentMonthWindows = getSalaryWindows(activeYear, activeMonth, workProfile.cutOffRanges, workProfile.salaryDates);
    const payoutMap = new Map<number, number>();
    for (const w of currentMonthWindows) {
      const pDay = parseInt(w.payoutDate.split("-")[2]);
      payoutMap.set(pDay, (payoutMap.get(pDay) || 0) + computeWindowPayout(w, workProfile, shiftOverrides, workProfile.salaryDates.length));
    }
    
    const isCurrentActiveMonth = activeYear === todayYear && activeMonth === todayMonth;
    const isFutureActiveMonth = activeYear > todayYear || (activeYear === todayYear && activeMonth > todayMonth);

    for (let d = 1; d <= totalDays; d++) {
      const iso = `${activeYear}-${String(activeMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const shift = computeShiftEarnings(iso, workProfile, shiftOverrides[iso]);
      shiftTotal += shift.total;

      // Pivot check for current active month
      if (isCurrentActiveMonth && d === todayDay) {
        runningBal = currentBankBalance;
      }

      // Inject salary payout
      if (payoutMap.has(d)) {
        runningBal += payoutMap.get(d)!;
      }

      const dayItems = getItemsForDay(billsAndLoans, d, activeMonth, activeYear);
      const incItems = dayItems.filter(i => i.type === "income");
      const expItems = dayItems.filter(i => i.type !== "income");

      incItems.forEach(i => {
        if (isCurrentActiveMonth && d === todayDay && isPaid(i.id, activeMonth, activeYear, paymentHistory)) {
          return; // Overlap Fix: Bypass paid item
        }
        runningBal += i.amount;
      });

      expItems.forEach(i => {
        if (isCurrentActiveMonth && d === todayDay && isPaid(i.id, activeMonth, activeYear, paymentHistory)) {
          return; // Overlap Fix: Bypass paid item
        }
        runningBal -= i.amount;
        if (runningBal < 0) {
          missed.add(i.id);
        }
      });

      dailyBalances.set(d, runningBal);

      if (activeYear < todayYear || 
         (activeYear === todayYear && activeMonth < todayMonth) ||
         (activeYear === todayYear && activeMonth === todayMonth && d <= todayDay)) {
        currentBal = runningBal;
      }
    }

    // Compute lowestProjectedBalance from today to the end of the month
    let lowestProjectedBalance: number | null = null;
    if (isCurrentActiveMonth) {
      let minBal = Infinity;
      for (let d = todayDay; d <= totalDays; d++) {
        const val = dailyBalances.get(d);
        if (val !== undefined && val < minBal) {
          minBal = val;
        }
      }
      lowestProjectedBalance = minBal === Infinity ? currentBankBalance : minBal;
    } else if (isFutureActiveMonth) {
      let minBal = Infinity;
      for (let d = 1; d <= totalDays; d++) {
        const val = dailyBalances.get(d);
        if (val !== undefined && val < minBal) {
          minBal = val;
        }
      }
      lowestProjectedBalance = minBal === Infinity ? bal : minBal;
    }

    return { 
      missedBills: missed, 
      currentBalance: currentBal, 
      projectedBalance: runningBal, 
      shiftIncomeTotal: shiftTotal, 
      activePayouts: payoutMap, 
      dailyBalances, 
      lowestProjectedBalance 
    };
  }, [startingBalance, billsAndLoans, activeMonth, activeYear, totalDays, workProfile, shiftOverrides, currentBankBalance, paymentHistory]);

  const totalCommitments = useMemo(() => computeMonthlyTotal(billsAndLoans, activeMonth, activeYear, "bill+loan"), [billsAndLoans, activeMonth, activeYear]);
  const paidAmount = useMemo(() => computePaidTotal(billsAndLoans, activeMonth, activeYear, paymentHistory, "bill+loan"), [billsAndLoans, activeMonth, activeYear, paymentHistory]);
  const totalIncome = useMemo(() => computeMonthlyTotal(billsAndLoans, activeMonth, activeYear, "income") + shiftIncomeTotal, [billsAndLoans, activeMonth, activeYear, shiftIncomeTotal]);

  const remaining = totalCommitments - paidAmount;
  const expItems = activeItems.filter(i => i.type !== "income");
  const paidCount = paymentHistory.filter((r) => r.payment_month === activeMonth + 1 && r.payment_year === activeYear && billsAndLoans.find(b => b.id === r.item_id)?.type !== "income").length;
  const totalCount = expItems.length;
  const progressPct = totalCommitments > 0 ? (paidAmount / totalCommitments) * 100 : 0;

  // Convenience formatter bound to selected currency
  const fmt = useCallback((amount: number) => formatCurrency(amount, currency), [currency]);

  const isDark = theme === "dark";

  // Dynamic Theme Class Tokens
  const s = {
    bg: isDark ? "bg-[#09090b] text-zinc-150" : "bg-gradient-to-tr from-[#f4f5f7] via-pink-50/20 to-[#f1f3f6] text-black",
    border: isDark ? "border-zinc-900/60" : "border-black/50",
    cardBg: isDark 
      ? "bg-gradient-to-br from-pink-950/20 to-pink-900/10 border-pink-500/50 text-pink-500" 
      : "bg-white border-black/50 shadow-sm text-black",
    headerBg: isDark ? "bg-[#09090b]/85 border-zinc-900/60" : "bg-[#f4f5f7]/85 border-black/50",
    textMuted: isDark ? "text-pink-400" : "text-black/60",
    textSub: isDark ? "text-pink-500 font-bold" : "text-black font-bold",
    textTitle: isDark ? "text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]" : "text-black",
    primaryBtn: "bg-pink-600 hover:bg-pink-500 text-white shadow-lg shadow-pink-500/10 active:scale-[0.98] transition-all",
    secondaryBtn: isDark 
      ? "bg-zinc-900 hover:bg-zinc-850 border-pink-500/40 text-pink-500 hover:text-pink-400" 
      : "bg-slate-100 hover:bg-slate-200 border-black/50 text-black",
  };

  return (
    <div className={`min-h-screen relative overflow-hidden font-sans transition-colors duration-300 ${s.bg}`}>
      {/* Dynamic radial gradient glow overlays */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {isDark ? (
          <>
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[50%] rounded-full bg-pink-900/5 blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-pink-950/5 blur-[100px]" />
          </>
        ) : (
          <>
            <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[60%] rounded-full bg-pink-300/10 blur-[130px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-pink-400/5 blur-[120px]" />
          </>
        )}
      </div>

      {/* ── HEADER ─────────────────────────────── */}
      <header className={`sticky top-0 z-20 backdrop-blur-xl border-b transition-colors duration-300 ${s.headerBg}`}>
        <div className="max-w-7xl mx-auto px-4 py-4 relative z-10">
          {/* Title row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? "bg-pink-950/20 border border-pink-500/20" : "bg-pink-100 border border-pink-200"}`}>
                <CalendarDays size={18} className="text-pink-600" />
              </div>
              <div>
                <h1 className={`text-lg font-extrabold leading-none tracking-tight ${isDark ? "text-pink-600" : "text-slate-800"}`}>Billz &amp; Utangz</h1>
                <p className={`text-xs mt-0.5 font-medium ${s.textMuted}`}>by Ydnar</p>
              </div>
            </div>

            {/* Right controls: stacks vertically on mobile, single row on sm+ */}
            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
              {/* Action buttons row */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Currency picker */}
                <CurrencyPicker selected={currency} onChange={setCurrency} />

                {/* Reset Data Button */}
                <button
                  onClick={() => setResetDataConfirmOpen(true)}
                  title="Reset All Data"
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isDark ? "bg-zinc-800/80 text-rose-400 hover:bg-zinc-700 hover:text-rose-300" : "bg-rose-100/50 text-rose-500 hover:bg-rose-200/50"}`}
                >
                  <Trash2 size={15} />
                </button>

                {/* Theme Selector Button */}
                <button
                  onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                  title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                  className={`p-2.5 rounded-xl border flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 ${
                    isDark
                      ? "bg-zinc-900 border-zinc-800 text-pink-400 hover:text-pink-300 hover:bg-zinc-850"
                      : "bg-white border-slate-200 text-pink-650 hover:text-pink-550 hover:bg-slate-50 shadow-sm"
                  }`}
                >
                  {isDark ? <Sun size={15} /> : <Moon size={15} />}
                </button>

                {/* Work Profile Setup Button */}
                {viewMode === "income" && (
                  <button
                    onClick={() => setWorkProfileOpen(true)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${isDark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-slate-200 text-slate-700 hover:bg-slate-300"}`}
                  >
                    <Settings2 size={14} />
                    <span className="hidden sm:inline">Work Profile</span>
                  </button>
                )}

                {/* Add item button */}
                <button
                  onClick={() => setAddOpen(true)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${s.primaryBtn}`}
                >
                  <Plus size={14} />
                  <span className="hidden sm:inline">Add Item</span>
                </button>

                {/* Manage button */}
                <button
                  onClick={() => setManageOpen(true)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 group border ${s.secondaryBtn}`}
                >
                  <Settings2 size={14} className="group-hover:rotate-45 transition-transform duration-300" />
                  <span className="hidden sm:inline">Manage</span>
                  {billsAndLoans.length > 0 && (
                    <span className="bg-pink-600/20 text-pink-550 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {billsAndLoans.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Month navigation row */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={prevMonth}
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all duration-200 hover:scale-105 ${s.secondaryBtn}`}
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="text-center min-w-[5rem] sm:min-w-32">
                  <p className={`text-sm sm:text-base font-extrabold tracking-tight ${s.textTitle}`}>{MONTH_NAMES[activeMonth]}</p>
                  <p className={`text-xs ${s.textMuted}`}>{activeYear}</p>
                </div>
                <button
                  onClick={nextMonth}
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all duration-200 hover:scale-105 ${s.secondaryBtn}`}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* View Toggle */}
          <div className={`mt-4 flex items-center gap-2 relative z-10 p-1 rounded-xl w-full sm:w-fit ${isDark ? "bg-zinc-900 border border-zinc-800" : "bg-slate-100 border border-slate-200"}`}>
             <button onClick={() => setViewMode("expenses")} className={`flex-1 sm:flex-none px-4 py-2 sm:py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === "expenses" ? isDark ? "bg-zinc-800 text-zinc-100 shadow-sm" : "bg-white text-slate-800 shadow-sm" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"}`}>Expenses</button>
             {/* Income & Balance — locked while under improvement */}
             <button
               onClick={() => setShowComingSoon(true)}
               title="Coming Soon"
               className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 sm:py-1.5 text-xs font-bold rounded-lg transition-all cursor-not-allowed select-none ${isDark ? "text-zinc-600 hover:text-zinc-500" : "text-slate-400 hover:text-slate-500"}`}
             >
               <Lock size={10} className="shrink-0" />
               <span>Income &amp; Balance</span>
             </button>
          </div>

          {/* Metric cards */}
          {viewMode === "expenses" ? (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10 animate-in fade-in zoom-in-95 duration-300">
              <div className={`col-span-2 md:col-span-1 rounded-xl p-3 border transition-colors duration-300 ${s.cardBg}`}>
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={14} className="text-pink-600" />
                  <span className={`text-xs font-semibold ${isDark ? "text-pink-400" : "text-slate-700"}`}>Total Commitments</span>
                </div>
                <p className="text-2xl font-black">{fmt(totalCommitments)}</p>
                <p className={`text-[10px] mt-0.5 font-medium ${isDark ? "text-pink-500/70" : "text-slate-500"}`}>{totalCount} items active</p>
              </div>

              <div className={`rounded-xl p-3 border transition-colors duration-300 ${s.cardBg}`}>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className={`text-xs font-semibold ${s.textSub}`}>Paid</span>
                </div>
                <p className="text-2xl font-black text-emerald-500">{fmt(paidAmount)}</p>
                <p className={`text-[10px] mt-0.5 font-medium ${s.textMuted}`}>{paidCount} of {totalCount} items</p>
              </div>

              <div className={`rounded-xl p-3 border transition-colors duration-300 ${s.cardBg}`}>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown size={14} className="text-rose-500" />
                  <span className={`text-xs font-semibold ${s.textSub}`}>Remaining</span>
                </div>
                <p className="text-2xl font-black text-rose-500">{fmt(remaining)}</p>
                <p className={`text-[10px] mt-0.5 font-medium ${s.textMuted}`}>{totalCount - paidCount} items unpaid</p>
              </div>

              <div className={`rounded-xl p-3 border flex flex-col justify-between transition-colors duration-300 ${s.cardBg}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt size={14} className="text-pink-500" />
                    <span className={`text-xs font-semibold ${s.textSub}`}>Progress</span>
                  </div>
                  <span className="text-xs font-extrabold text-pink-600">{Math.round(progressPct)}%</span>
                </div>
                <div className="mt-2">
                  <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                    <div
                      className="h-full bg-gradient-to-r from-pink-500 to-pink-650 rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
                <p className={`text-[9px] mt-1 font-medium ${s.textMuted}`}>cleared this active month</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 relative z-10 animate-in fade-in zoom-in-95 duration-300">
              <div className={`rounded-xl p-3 border transition-colors duration-300 ${s.cardBg}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Banknote size={14} className="text-blue-500" />
                  <span className={`text-xs font-semibold ${isDark ? "text-blue-400" : "text-slate-700"}`}>Total Income</span>
                </div>
                <p className="text-2xl font-black">{fmt(totalIncome)}</p>
                <p className={`text-[10px] mt-0.5 font-medium ${isDark ? "text-blue-500/70" : "text-slate-500"}`}>{activeItems.filter(i => i.type === "income").length} items active</p>
              </div>
              <div className={`rounded-xl p-3 border transition-colors duration-300 flex flex-col justify-between ${s.cardBg}`}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet size={14} className="text-emerald-500" />
                    <span className={`text-xs font-semibold ${isDark ? "text-emerald-400" : "text-slate-700"}`}>Month Start Balance</span>
                  </div>
                  <p className="text-2xl font-black text-emerald-500">{fmt(currentBalance)}</p>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-[10px] font-medium ${s.textMuted}`}>Base:</span>
                  <input type="number" value={startingBalance} onChange={e => setStartingBalance(e.target.value)} className={`w-20 text-[10px] px-1.5 py-0.5 rounded border outline-none bg-transparent focus:ring-1 transition-all ${isDark ? "border-zinc-700 text-zinc-300 focus:border-emerald-500" : "border-slate-300 text-slate-700 focus:border-emerald-400"}`} placeholder="0" />
                </div>
              </div>
              <div className={`rounded-xl p-3 border transition-colors duration-300 ${s.cardBg}`}>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={14} className={projectedBalance < 0 ? "text-rose-500" : "text-purple-500"} />
                  <span className={`text-xs font-semibold ${isDark ? "text-purple-400" : "text-slate-700"}`}>Projected EOM Balance</span>
                </div>
                <p className={`text-2xl font-black ${projectedBalance < 0 ? "text-rose-500" : "text-purple-500"}`}>{fmt(projectedBalance)}</p>
                <p className={`text-[10px] mt-0.5 font-medium ${s.textMuted}`}>End of Month Projection</p>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium ${s.textSub}`}>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-indigo-500/20 border border-indigo-500/50" />
              <span>Bills</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-orange-500/20 border border-orange-500/50" />
              <span>Loans</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-emerald-500/20 border border-emerald-500/50" />
              <span>Income / Shifts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Circle size={12} className={s.textMuted} />
              <span>Click items on calendar to toggle paid status</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── CALENDAR GRID ──────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 py-6 relative z-10">
        {/* Forecasting & Cash Flow Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Current Cash on Hand (Today) Card */}
          <div className={`rounded-2xl p-4 border transition-all duration-300 ${
            isDark ? "bg-zinc-950 border-zinc-900 shadow-sm" : "bg-white border-slate-200 shadow-sm"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                Current Cash on Hand (Today)
              </span>
              <Wallet size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
            </div>
            
            {isEditingCash ? (
              <input
                type="number"
                value={currentBankBalance}
                onChange={(e) => setCurrentBankBalance(parseFloat(e.target.value) || 0)}
                onBlur={() => setIsEditingCash(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setIsEditingCash(false);
                }}
                className={`text-2xl font-black w-full bg-transparent border-b outline-none pb-1 ${
                  isDark ? "text-white border-zinc-700" : "text-slate-800 border-slate-300"
                }`}
                autoFocus
              />
            ) : (
              <div 
                onClick={() => setIsEditingCash(true)}
                className={`text-2xl font-black cursor-pointer hover:opacity-80 transition-opacity flex items-baseline gap-1.5 ${
                  isDark ? "text-white" : "text-slate-800"
                }`}
                title="Click to edit balance"
              >
                <span>{formatCurrency(currentBankBalance, currency)}</span>
                <span className={`text-[10px] font-semibold flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                  isDark ? "text-zinc-650" : "text-slate-400"
                }`}>
                  Edit
                </span>
              </div>
            )}
            <p className={`text-[10px] mt-1.5 font-medium ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              Your live bank/wallet balance today. Used as the anchor for all future balance projections.
            </p>
          </div>

          {/* Lowest Projected Balance Card */}
          <div className={`rounded-2xl p-4 border transition-all duration-300 ${
            lowestProjectedBalance === null || lowestProjectedBalance === undefined
              ? isDark ? "bg-zinc-950 border-zinc-900" : "bg-white border-slate-200"
              : lowestProjectedBalance < 0
                ? isDark
                  ? "bg-rose-950/10 border-rose-900/40 shadow-[0_0_12px_rgba(244,63,94,0.06)]"
                  : "bg-rose-50/20 border-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.04)]"
                : isDark
                  ? "bg-emerald-950/10 border-emerald-900/40 shadow-[0_0_12px_rgba(16,185,129,0.06)]"
                  : "bg-emerald-50/20 border-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.04)]"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${
                lowestProjectedBalance === null || lowestProjectedBalance === undefined
                  ? isDark ? "text-zinc-500" : "text-slate-400"
                  : lowestProjectedBalance < 0 ? "text-rose-500" : "text-emerald-500"
              }`}>
                Lowest Projected Balance
              </span>
              <TrendingDown size={16} className={
                lowestProjectedBalance === null || lowestProjectedBalance === undefined
                  ? isDark ? "text-zinc-500" : "text-slate-400"
                  : lowestProjectedBalance < 0 ? "text-rose-500" : "text-emerald-500"
              } />
            </div>

            <p className={`text-2xl font-black ${
              lowestProjectedBalance === null || lowestProjectedBalance === undefined
                ? isDark ? "text-zinc-600" : "text-slate-400"
                : lowestProjectedBalance < 0 ? "text-rose-500" : "text-emerald-500"
            }`}>
              {lowestProjectedBalance === null || lowestProjectedBalance === undefined
                ? "N/A"
                : formatCurrency(lowestProjectedBalance, currency)}
            </p>

            <p className={`text-[10px] mt-1.5 font-medium ${isDark ? "text-zinc-650" : "text-slate-400"}`}>
              {lowestProjectedBalance === null || lowestProjectedBalance === undefined
                ? "Viewing a past month. Forecasting is only active for current and future months."
                : lowestProjectedBalance < 0
                  ? "Warning: Cash deficit projected before payday! Review upcoming expenses."
                  : "Safe: Your projected balance remains positive throughout the forecast period."}
            </p>
          </div>
        </div>
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1.5 md:gap-2 mb-1.5">
          {DAY_LABELS.map((label) => (
            <div key={label} className={`text-center text-xs font-bold py-1 tracking-wide uppercase ${isDark ? "text-zinc-600" : "text-slate-450"}`}>
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label[0]}</span>
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1.5 md:gap-2">
          {gridCells.map((day, idx) => {
            const iso = day !== null ? `${activeYear}-${String(activeMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
            const shiftEarnings = day !== null ? computeShiftEarnings(iso, workProfile, shiftOverrides[iso]) : undefined;
            return (
              <DayCell
                key={idx}
                day={day}
                isToday={isToday(day)}
                items={billsAndLoans}
                month={activeMonth}
                year={activeYear}
                paymentHistory={paymentHistory}
                missedBills={missedBills}
                onToggle={togglePayment}
                currency={currency}
                theme={theme}
                viewMode={viewMode}
                shiftEarnings={shiftEarnings}
                payoutAmount={day !== null ? activePayouts.get(day) : undefined}
                onEditShift={setEditShiftDay}
                dailyBalance={day !== null ? dailyBalances.get(day) : undefined}
              />
            );
          })}
        </div>

        {/* Empty state */}
        {billsAndLoans.length === 0 && (
          <div className="mt-12 flex flex-col items-center justify-center text-center gap-4 animate-in fade-in duration-300">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border ${
              isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-slate-200 shadow-sm"
            }`}>
              <CalendarDays size={28} className={isDark ? "text-zinc-650" : "text-slate-400"} />
            </div>
            <div>
              <p className={`font-bold ${s.textTitle}`}>No items on your calendar</p>
              <p className={`text-sm mt-1 ${s.textMuted}`}>Open <strong className="text-pink-600 font-bold">Manage Items</strong> to load defaults or get started adding new ones.</p>
            </div>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 bg-pink-600/10 hover:bg-pink-600/20 border border-pink-500/35 hover:border-pink-500 text-pink-600 text-sm font-bold px-4 py-2.5 rounded-xl transition-all duration-200"
            >
              <RefreshCcw size={14} />
              Reset Default Items
            </button>
          </div>
        )}

        {/* Footer summary */}
        {billsAndLoans.length > 0 && (
          <div className={`mt-8 p-4 border-2 rounded-2xl ${
            isDark ? "bg-zinc-950/40 border-zinc-900" : "bg-white border-slate-350 shadow-sm"
          }`}>
            <h2 className={`text-sm font-extrabold mb-3 flex items-center gap-2 ${s.textTitle}`}>
              <Receipt size={14} className="text-pink-600" />
              {MONTH_NAMES[activeMonth]} {activeYear} — Monthly Overview
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeItems.map((item) => {
                const paid = isPaid(item.id, activeMonth, activeYear, paymentHistory);
                const isLoan = item.type === "loan";
                const isIncome = item.type === "income";

                let cardStyles = "";
                let iconWrapperStyles = "";
                let textTitleStyles = "";
                let amountStyles = "";
                let iconComponent = null;

                if (isIncome) {
                  cardStyles = isDark 
                    ? "bg-emerald-500/10 border-emerald-500/25 hover:border-emerald-500/45 text-emerald-400" 
                    : "bg-emerald-50/20 border-emerald-200 hover:border-emerald-450 hover:bg-emerald-50/40 text-emerald-700";
                  iconWrapperStyles = "bg-emerald-500/10 border border-emerald-500/15 text-emerald-500";
                  textTitleStyles = "text-emerald-600 dark:text-emerald-400";
                  amountStyles = "text-emerald-500";
                  iconComponent = <Banknote size={14} className="text-emerald-500" />;
                } else if (isLoan) {
                  cardStyles = isDark 
                    ? "bg-orange-500/10 border-orange-500/25 hover:border-orange-500/45 text-orange-400" 
                    : "bg-orange-50/20 border-orange-200 hover:border-orange-450 hover:bg-orange-50/40 text-orange-700";
                  iconWrapperStyles = "bg-orange-500/10 border border-orange-500/15 text-orange-500";
                  textTitleStyles = "text-orange-600 dark:text-orange-400";
                  amountStyles = "text-orange-500";
                  iconComponent = <CreditCard size={14} className="text-orange-500" />;
                } else {
                  cardStyles = isDark 
                    ? "bg-indigo-500/10 border-indigo-500/25 hover:border-indigo-500/45 text-indigo-400" 
                    : "bg-indigo-50/20 border-indigo-200 hover:border-indigo-455 hover:bg-indigo-50/40 text-indigo-700";
                  iconWrapperStyles = "bg-indigo-500/10 border border-indigo-500/15 text-indigo-500";
                  textTitleStyles = "text-indigo-600 dark:text-indigo-400";
                  amountStyles = "text-indigo-650 dark:text-indigo-400";
                  iconComponent = <Receipt size={14} className="text-indigo-500" />;
                }

                return (
                  <button
                    key={item.id}
                    onClick={() => togglePayment(item.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all duration-200 ${cardStyles} ${paid ? "opacity-35 scale-98" : ""}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconWrapperStyles}`}>
                      {iconComponent}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${paid ? "line-through opacity-70" : ""} ${textTitleStyles}`}>
                        {item.title}
                      </p>
                      <p className={`text-[10px] ${s.textMuted}`}>{getItemDueLabel(item)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-black ${amountStyles}`}>
                        {fmt(item.amount)}
                      </span>
                      {paid ? (
                        <svg className="w-4 h-4 fill-current text-emerald-500 animate-in zoom-in duration-200" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l5-5z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <Circle size={16} className={isDark ? "text-zinc-800" : "text-slate-300"} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* ── MANAGE DRAWER ──────────────────────── */}
      <ManageDrawer
        open={manageOpen}
        items={billsAndLoans}
        currency={currency}
        theme={theme}
        onClose={() => setManageOpen(false)}
        onDeleteOne={handleDeleteOne}
        onDeleteMany={handleDeleteMany}
        onDeleteAll={handleDeleteAll}
        onReset={handleReset}
      />

      {/* ── ADD ITEM MODAL ─────────────────────── */}
      <AddItemModal
        open={addOpen}
        currency={currency}
        theme={theme}
        onClose={() => setAddOpen(false)}
        onAdd={handleAddItem}
      />

      <WorkProfileSetupModal
        open={workProfileOpen}
        profile={workProfile}
        theme={theme}
        onClose={() => setWorkProfileOpen(false)}
        onSave={setWorkProfile}
      />

      {editShiftDay !== null && (
        <EditShiftModal
          day={editShiftDay}
          isoDate={`${activeYear}-${String(activeMonth + 1).padStart(2, "0")}-${String(editShiftDay).padStart(2, "0")}`}
          override={shiftOverrides[`${activeYear}-${String(activeMonth + 1).padStart(2, "0")}-${String(editShiftDay).padStart(2, "0")}`]}
          profile={workProfile}
          theme={theme}
          onClose={() => setEditShiftDay(null)}
          onSave={(override) => {
            const iso = `${activeYear}-${String(activeMonth + 1).padStart(2, "0")}-${String(editShiftDay).padStart(2, "0")}`;
            setShiftOverrides(prev => {
              const newOverrides = { ...prev };
              if (override) {
                newOverrides[iso] = override;
              } else {
                delete newOverrides[iso];
              }
              return newOverrides;
            });
            setEditShiftDay(null);
          }}
        />
      )}

      {resetDataConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 ${isDark ? "bg-zinc-950 border border-zinc-800" : "bg-white border border-slate-200"}`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? "border-zinc-800" : "border-slate-150"}`}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-rose-500" />
                <h2 className={`font-bold ${isDark ? "text-white" : "text-slate-800"}`}>Reset All Data</h2>
              </div>
              <button onClick={() => setResetDataConfirmOpen(false)} className="p-1 rounded opacity-70 hover:opacity-100"><X size={16} /></button>
            </div>
            <div className="p-4">
              <p className={`text-sm ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                Are you absolutely sure you want to reset all your inputs? This will clear all your bills, loans, income entries, and shift overrides permanently.
              </p>
            </div>
            <div className={`p-4 flex gap-3 border-t ${isDark ? "border-zinc-800" : "border-slate-150"}`}>
              <button onClick={() => setResetDataConfirmOpen(false)} className={`flex-1 py-2 font-bold rounded-lg transition-colors ${isDark ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>Cancel</button>
              <button onClick={() => {
                setBillsAndLoans([]);
                setPaymentHistory([]);
                setShiftOverrides({});
                setStartingBalance("0");
                setHasSetupWorkProfile(false);
                setResetDataConfirmOpen(false);
              }} className="flex-1 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-lg transition-colors">Yes, Reset</button>
            </div>
          </div>
        </div>
      )}
      {/* ── COMING SOON MODAL ─────────────────────────────── */}
      {showComingSoon && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowComingSoon(false)}
          style={{ animation: "fadeIn 0.15s ease" }}
        >
          <div
            className={`w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${
              isDark ? "bg-zinc-950 border border-zinc-800" : "bg-white border border-slate-200"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top accent bar */}
            <div className="h-1 w-full bg-gradient-to-r from-pink-600 via-pink-500 to-rose-400" />

            {/* Content */}
            <div className="p-6 flex flex-col items-center text-center">
              {/* Icon badge */}
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${
                isDark ? "bg-pink-950/30 border border-pink-500/20" : "bg-pink-50 border border-pink-200"
              }`}>
                <Lock size={24} className="text-pink-500" />
              </div>

              <h2 className={`text-lg font-extrabold mb-1 ${
                isDark ? "text-zinc-100" : "text-slate-800"
              }`}>Feature Under Construction</h2>

              <p className={`text-sm leading-relaxed mb-5 ${
                isDark ? "text-zinc-400" : "text-slate-500"
              }`}>
                We&apos;re actively rebuilding the <strong className={isDark ? "text-pink-400" : "text-pink-600"}>Income &amp; Balance</strong> section
                to give you a smarter, more accurate forecasting experience.
                Hang tight — it&apos;s going to be worth the wait.
              </p>

              {/* Tag */}
              <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 ${
                isDark ? "bg-pink-950/30 text-pink-400 border border-pink-500/20" : "bg-pink-50 text-pink-600 border border-pink-200"
              }`}>
                <RefreshCcw size={11} className="animate-spin [animation-duration:3s]" />
                Improvements in progress
              </div>

              <button
                onClick={() => setShowComingSoon(false)}
                className="w-full py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 active:scale-[0.98] text-white text-sm font-bold transition-all shadow-lg shadow-pink-500/20"
              >
                Got it, thanks!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
