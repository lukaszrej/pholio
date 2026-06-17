import { useState, useEffect, useRef } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface WatchItem {
  ticker: string;
  name: string;
  c: number;
  d: number | null;
  dp: number | null;
  h: number | null;
  l: number | null;
  o: number | null;
  pc: number | null;
  unavailable?: boolean;
}

type ApiQuoteEntry = Omit<WatchItem, "unavailable">;
type ApiData = Partial<Record<string, ApiQuoteEntry>>;

const DEFAULT_TICKERS = ["AAPL", "NVDA", "MSFT", "TSLA"];
const STORAGE_KEY = "pholio_watchlist";
const COL_TEMPLATE = "28px 1fr 110px 90px 104px 176px 96px 32px";

function readStoredTickers(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TICKERS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TICKERS;
    if (typeof parsed[0] === "object" && parsed[0] !== null && "ticker" in parsed[0]) {
      return (parsed as { ticker: string }[]).map((i) => i.ticker);
    }
    return parsed as string[];
  } catch {
    return DEFAULT_TICKERS;
  }
}

async function fetchQuotes(tickers: string[]): Promise<ApiData> {
  const r = await fetch(`/api/watchlist/quotes?tickers=${tickers.join(",")}`);
  const body = (await r.json()) as { data?: ApiData };
  return body.data ?? {};
}

function makeUnavailable(ticker: string): WatchItem {
  return { ticker, name: ticker, c: 0, d: null, dp: null, h: null, l: null, o: null, pc: null, unavailable: true };
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
  const [items, setItems] = useState<WatchItem[]>([]);
  // Start with DEFAULT_TICKERS so skeleton count is stable for SSR hydration.
  // The actual stored tickers are read in the mount effect for the fetch.
  const [skeletonTickers, setSkeletonTickers] = useState<string[]>(DEFAULT_TICKERS);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const dragRef = useRef<number | null>(null);
  const overRef = useRef<number | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const tickers = readStoredTickers();

    fetchQuotes(tickers)
      .then((data) => {
        setItems(
          tickers.map((t) => {
            const q = data[t];
            return q ? { ...q } : makeUnavailable(t);
          }),
        );
      })
      .catch(() => {
        setItems(tickers.map(makeUnavailable));
      })
      .finally(() => {
        setSkeletonTickers([]);
        hasLoadedRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map((i) => i.ticker)));
  }, [items]);

  async function addTicker(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const t = input.trim().toUpperCase();
    if (!t) return;
    if (items.find((i) => i.ticker === t)) {
      setErr(`${t} already in list`);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const data = await fetchQuotes([t]);
      const q = data[t];
      if (q === undefined) {
        setErr(`${t} not found`);
        return;
      }
      setItems((prev) => [...prev, { ...q }]);
      setInput("");
    } catch {
      setErr("Failed to fetch quote");
    } finally {
      setLoading(false);
    }
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

  const isInitialLoading = skeletonTickers.length > 0;

  return (
    <div style={{ marginBottom: 28 }}>
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
                disabled={loading || isInitialLoading}
                spellCheck={false}
              />
              <button type="submit" className="wl-btn" disabled={loading || isInitialLoading || !input.trim()}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                <span>{loading ? "Loading" : "Add"}</span>
              </button>
            </form>
          </div>
        </div>

        {isInitialLoading ? (
          <div>
            <div className="wl-col-header" style={{ gridTemplateColumns: COL_TEMPLATE }}>
              <span />
              <span style={{ textAlign: "left" }}>Symbol</span>
              <span>Price</span>
              <span>Change</span>
              <span>% Change</span>
              <span>Day Range</span>
              <span>Prev Close</span>
              <span />
            </div>
            {skeletonTickers.map((t) => (
              <div key={t} className="wl-row" style={{ gridTemplateColumns: COL_TEMPLATE, cursor: "default" }}>
                <span className="wl-grip" />
                <span className="wl-sym">
                  <span className="wl-skeleton wl-skeleton-sym" />
                </span>
                <span className="wl-price">
                  <span className="wl-skeleton wl-skeleton-num" />
                </span>
                <span className="wl-change">
                  <span className="wl-skeleton wl-skeleton-num" />
                </span>
                <span className="wl-pct-pill">
                  <span className="wl-skeleton wl-skeleton-pill" />
                </span>
                <span className="wl-range">
                  <span className="wl-skeleton wl-skeleton-range" />
                </span>
                <span className="wl-prev-close">
                  <span className="wl-skeleton wl-skeleton-num" />
                </span>
                <span />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="wl-empty">No symbols yet — add a ticker above.</div>
        ) : (
          <div>
            <div className="wl-col-header" style={{ gridTemplateColumns: COL_TEMPLATE }}>
              <span />
              <span style={{ textAlign: "left" }}>Symbol</span>
              <span>Price</span>
              <span>Change</span>
              <span>% Change</span>
              <span>Day Range</span>
              <span>Prev Close</span>
              <span />
            </div>
            {items.map((item, idx) => {
              if (item.unavailable) {
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
                      <span className="wl-name wl-unavailable-label">unavailable</span>
                    </span>
                    <span className="wl-price">—</span>
                    <span className="wl-change">—</span>
                    <span className="wl-pct-pill">—</span>
                    <span className="wl-range" />
                    <span className="wl-prev-close">—</span>
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
              }

              const gain = item.d !== null ? item.d >= 0 : null;
              const rangePct =
                item.h !== null && item.l !== null && item.h > item.l
                  ? Math.max(0, Math.min(100, ((item.c - item.l) / (item.h - item.l)) * 100))
                  : 50;

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

                  <span className={`wl-change ${gain === true ? "text-gain" : gain === false ? "text-loss" : ""}`}>
                    {item.d !== null ? `${gain === true ? "+" : ""}${item.d.toFixed(2)}` : "—"}
                  </span>

                  <span className={`wl-pct-pill ${gain === true ? "gain" : gain === false ? "loss" : ""}`}>
                    {item.dp !== null ? `${gain === true ? "▲" : "▼"} ${Math.abs(item.dp).toFixed(2)}%` : "—"}
                  </span>

                  <span className="wl-range">
                    {item.h !== null && item.l !== null ? (
                      <>
                        <span className="wl-range-nums">
                          <span>{item.l.toFixed(2)}</span>
                          <span>{item.h.toFixed(2)}</span>
                        </span>
                        <span className="wl-range-track">
                          <span className="wl-range-dot" style={{ left: `${rangePct}%` }} />
                        </span>
                      </>
                    ) : (
                      <span className="wl-range-nums">
                        <span>—</span>
                        <span>—</span>
                      </span>
                    )}
                  </span>

                  <span className="wl-prev-close">{item.pc !== null ? item.pc.toFixed(2) : "—"}</span>

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
