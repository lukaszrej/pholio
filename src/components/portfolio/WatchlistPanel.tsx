import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface WatchItem {
  ticker: string;
  name: string;
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
}

type QuoteData = Omit<WatchItem, "ticker">;

const MOCK_QUOTES: Record<string, QuoteData | undefined> = {
  AAPL: { name: "Apple Inc.", c: 189.3, d: 1.24, dp: 0.66, h: 190.12, l: 187.45, o: 188.1, pc: 188.06 },
  MSFT: { name: "Microsoft Corp.", c: 415.2, d: -2.1, dp: -0.5, h: 418.0, l: 413.2, o: 417.3, pc: 417.3 },
  GOOGL: { name: "Alphabet Inc.", c: 178.9, d: 3.45, dp: 1.97, h: 179.5, l: 174.8, o: 175.4, pc: 175.45 },
  NVDA: { name: "NVIDIA Corp.", c: 892.5, d: 15.3, dp: 1.74, h: 895.0, l: 876.2, o: 879.0, pc: 877.2 },
  AMZN: { name: "Amazon.com Inc.", c: 186.4, d: -0.85, dp: -0.45, h: 188.5, l: 185.2, o: 187.5, pc: 187.25 },
  META: { name: "Meta Platforms", c: 521.3, d: 7.8, dp: 1.52, h: 523.1, l: 513.4, o: 514.2, pc: 513.5 },
  TSLA: { name: "Tesla Inc.", c: 248.5, d: -4.2, dp: -1.66, h: 254.0, l: 246.1, o: 253.8, pc: 252.7 },
  JPM: { name: "JPMorgan Chase", c: 204.6, d: 1.05, dp: 0.52, h: 205.3, l: 202.8, o: 203.7, pc: 203.55 },
  V: { name: "Visa Inc.", c: 278.9, d: -0.65, dp: -0.23, h: 280.1, l: 277.4, o: 279.5, pc: 279.55 },
  BRKB: { name: "Berkshire Hathaway", c: 398.2, d: 2.15, dp: 0.54, h: 399.0, l: 396.1, o: 396.5, pc: 396.05 },
};

const STORAGE_KEY = "pholio_watchlist";
const COL_TEMPLATE = "28px 1fr 110px 90px 104px 176px 96px 32px";

function fetchQuote(ticker: string): Promise<WatchItem> {
  const t = ticker.toUpperCase();
  const q = MOCK_QUOTES[t];
  if (q) return Promise.resolve({ ticker: t, ...q });
  const pc = 50 + Math.random() * 500;
  const d = (Math.random() - 0.48) * pc * 0.03;
  const c = pc + d;
  const dp = (d / pc) * 100;
  return Promise.resolve({
    ticker: t,
    name: t,
    c: +c.toFixed(2),
    d: +d.toFixed(2),
    dp: +dp.toFixed(2),
    h: +(c + Math.random() * c * 0.014).toFixed(2),
    l: +(c - Math.random() * c * 0.014).toFixed(2),
    o: +(pc + (Math.random() - 0.5) * pc * 0.005).toFixed(2),
    pc: +pc.toFixed(2),
  });
}

function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
      {([3, 7, 11] as const).flatMap((cy) =>
        ([2, 8] as const).map((cx, j) => <circle key={`${cy}-${j}`} cx={cx} cy={cy} r={1.4} fill="currentColor" />),
      )}
    </svg>
  );
}

export default function WatchlistPanel() {
  const stored = useMemo<WatchItem[] | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as WatchItem[]) : null;
    } catch {
      return null;
    }
  }, []);

  const defaultItems: WatchItem[] = (["AAPL", "NVDA", "MSFT", "TSLA"] as const).flatMap((t) => {
    const q = MOCK_QUOTES[t];
    return q ? [{ ticker: t, ...q }] : [];
  });

  const [items, setItems] = useState<WatchItem[]>(stored ?? defaultItems);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const dragRef = useRef<number | null>(null);
  const overRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  function addTicker(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const t = input.trim().toUpperCase();
    if (!t) return;
    if (items.find((i) => i.ticker === t)) {
      setErr(`${t} already in list`);
      return;
    }
    setLoading(true);
    setErr("");
    void fetchQuote(t).then((q) => {
      setItems((prev) => [...prev, q]);
      setInput("");
      setLoading(false);
    });
  }

  function remove(ticker: string) {
    setItems((prev) => prev.filter((i) => i.ticker !== ticker));
  }

  function onDragStart(idx: number) {
    dragRef.current = idx;
  }

  function onDragEnter(idx: number) {
    if (idx === dragRef.current) return;
    overRef.current = idx;
    setDragOverIdx(idx);
  }

  function onDragEnd() {
    const from = dragRef.current;
    const to = overRef.current;
    dragRef.current = null;
    overRef.current = null;
    setDragOverIdx(null);
    if (from !== null && to !== null && from !== to) {
      setItems((prev) => {
        const arr = [...prev];
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        return arr;
      });
    }
  }

  return (
    <div style={{ marginTop: 22, marginBottom: 28 }}>
      <div className="wl-panel">
        <div className="wl-header">
          <span className="wl-title">Watchlist</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {err && <span className="wl-error">{err}</span>}
            <form onSubmit={addTicker} className="wl-form">
              <input
                className="wl-input"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value.toUpperCase());
                  setErr("");
                }}
                placeholder="Ticker symbol…"
                maxLength={10}
                disabled={loading}
                spellCheck={false}
              />
              <button type="submit" className="wl-btn" disabled={loading || !input.trim()}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                <span>{loading ? "Loading" : "Add"}</span>
              </button>
            </form>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="wl-empty">No symbols yet — add a ticker above.</div>
        ) : (
          <div>
            <div className="wl-col-header" style={{ gridTemplateColumns: COL_TEMPLATE }}>
              <span></span>
              <span style={{ textAlign: "left" }}>Symbol</span>
              <span>Price</span>
              <span>Change</span>
              <span>% Change</span>
              <span>Day Range</span>
              <span>Prev Close</span>
              <span></span>
            </div>
            {items.map((item, idx) => {
              const gain = item.d >= 0;
              const rangePct =
                item.h > item.l ? Math.max(0, Math.min(100, ((item.c - item.l) / (item.h - item.l)) * 100)) : 50;
              return (
                <div
                  key={item.ticker}
                  className={dragOverIdx === idx ? "wl-row wl-row-dragover" : "wl-row"}
                  style={{ gridTemplateColumns: COL_TEMPLATE }}
                  draggable
                  onDragStart={() => {
                    onDragStart(idx);
                  }}
                  onDragEnter={() => {
                    onDragEnter(idx);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDragEnd={onDragEnd}
                >
                  <span className="wl-grip">
                    <GripIcon />
                  </span>

                  <span className="wl-sym">
                    <span className="wl-ticker">{item.ticker}</span>
                    {item.name !== item.ticker && <span className="wl-name">{item.name}</span>}
                  </span>

                  <span className="wl-price">{item.c.toFixed(2)}</span>

                  <span className={`wl-change ${gain ? "text-gain" : "text-loss"}`}>
                    {gain ? "+" : ""}
                    {item.d.toFixed(2)}
                  </span>

                  <span className={`wl-pct-pill ${gain ? "gain" : "loss"}`}>
                    {gain ? "▲" : "▼"} {Math.abs(item.dp).toFixed(2)}%
                  </span>

                  <span className="wl-range">
                    <span className="wl-range-nums">
                      <span>{item.l.toFixed(2)}</span>
                      <span>{item.h.toFixed(2)}</span>
                    </span>
                    <span className="wl-range-track">
                      <span className="wl-range-dot" style={{ left: `${rangePct}%` }} />
                    </span>
                  </span>

                  <span className="wl-prev-close">{item.pc.toFixed(2)}</span>

                  <button
                    className="wl-remove"
                    onClick={() => {
                      remove(item.ticker);
                    }}
                    title="Remove"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
