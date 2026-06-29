import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { supabase } from "./supabaseClient";

const FIELDS = [
  { key: "stock_domestic", label: "국내주식 (키움)", group: "주식·연금", color: "#1D9E75" },
  { key: "stock_overseas", label: "해외주식 (한투)", group: "주식·연금", color: "#5DCAA5" },
  { key: "isa", label: "ISA (키움)", group: "주식·연금", color: "#085041" },
  { key: "irp", label: "퇴직연금 (IRP)", group: "주식·연금", color: "#9FE1CB" },
  { key: "pension_fund", label: "연금저축 (키움)", group: "주식·연금", color: "#04342C" },
  { key: "bitcoin", label: "비트코인 (업비트)", group: "비트코인", color: "#BA7517" },
  { key: "insurance_prudential", label: "보험 (푸르덴셜)", group: "보험", color: "#7F77DD" },
  { key: "bank_subscription", label: "주택청약예금", group: "은행", color: "#378ADD" },
  { key: "bank_jaeseong", label: "카카오 재성이 등록금", group: "은행", color: "#85B7EB" },
  { key: "bank_safebox", label: "세이프박스", group: "은행", color: "#0C447C" },
  { key: "bank_cash", label: "현금", group: "은행", color: "#B5D4F4" },
  { key: "real_estate", label: "부동산", group: "부동산", color: "#D85A30" },
];

const GROUP_ORDER = ["주식·연금", "비트코인", "보험", "은행", "부동산"];
const GROUP_COLOR = {
  "주식·연금": "#1D9E75",
  "비트코인": "#BA7517",
  "보험": "#7F77DD",
  "은행": "#378ADD",
  "부동산": "#D85A30",
};

const FIELD_KEYS = FIELDS.map((f) => f.key);

function formatWon(value) {
  if (value === null || value === undefined || isNaN(value)) return "-";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 100000000) {
    const eok = abs / 100000000;
    return `${sign}${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억`;
  }
  if (abs >= 10000) {
    const man = abs / 10000;
    return `${sign}${Math.round(man).toLocaleString("ko-KR")}만`;
  }
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}`;
}

function formatWonFull(value) {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return Math.round(value).toLocaleString("ko-KR") + "원";
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateFull(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function totalOf(rec) {
  return FIELD_KEYS.reduce((sum, k) => sum + (Number(rec[k]) || 0), 0);
}

function groupTotalsOf(rec) {
  const totals = {};
  GROUP_ORDER.forEach((g) => (totals[g] = 0));
  FIELDS.forEach((f) => {
    totals[f.group] += Number(rec[f.key]) || 0;
  });
  return totals;
}

export default function App() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("trend");
  const [rangeMonths, setRangeMonths] = useState(12);
  const [hiddenKeys, setHiddenKeys] = useState(() => new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [draft, setDraft] = useState(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("asset_records")
      .select("*")
      .order("record_date", { ascending: true });
    if (error) {
      setError(error.message);
    } else {
      setRecords(
        (data || []).map((r) => ({
          date: r.record_date,
          ...Object.fromEntries(FIELD_KEYS.map((k) => [k, Number(r[k]) || 0])),
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const sortedRecords = records;
  const latest = sortedRecords[sortedRecords.length - 1];
  const previous = sortedRecords[sortedRecords.length - 2];

  const latestTotal = latest ? totalOf(latest) : 0;
  const previousTotal = previous ? totalOf(previous) : null;
  const diff = previousTotal !== null ? latestTotal - previousTotal : null;
  const diffPct = previousTotal ? (diff / previousTotal) * 100 : null;

  const filteredRecords = useMemo(() => {
    if (rangeMonths === 0) return sortedRecords;
    if (!latest) return sortedRecords;
    const cutoff = new Date(latest.date);
    cutoff.setMonth(cutoff.getMonth() - rangeMonths);
    return sortedRecords.filter((r) => new Date(r.date) >= cutoff);
  }, [sortedRecords, rangeMonths, latest]);

  // 그래프(추이)에는 항상 세부 계좌 단위로 표시하고, 비트코인은 별도 카드로 분리한다.
  // hiddenKeys에 들어있는 항목은 범례 클릭으로 그래프에서 숨겨진 상태.
  const graphFields = useMemo(
    () => FIELDS.filter((f) => f.key !== "bitcoin" && !hiddenKeys.has(f.key)),
    [hiddenKeys]
  );
  const graphFieldKeys = useMemo(() => graphFields.map((f) => f.key), [graphFields]);

  function graphTotalOf(rec) {
    return graphFieldKeys.reduce((sum, k) => sum + (Number(rec[k]) || 0), 0);
  }

  const chartData = useMemo(
    () =>
      filteredRecords.map((r) => {
        const row = { date: r.date, label: formatDateLabel(r.date), total: graphTotalOf(r) };
        graphFieldKeys.forEach((k) => (row[k] = Number(r[k]) || 0));
        return row;
      }),
    [filteredRecords, graphFieldKeys]
  );

  const activeSeries = useMemo(
    () => graphFields.map((f) => ({ key: f.key, label: f.label, color: f.color })),
    [graphFields]
  );

  const allLegendSeries = useMemo(
    () => FIELDS.filter((f) => f.key !== "bitcoin").map((f) => ({ key: f.key, label: f.label, color: f.color })),
    []
  );

  const chartTotal = chartData.length ? chartData[chartData.length - 1].total : 0;

  const bitcoinLatest = latest ? Number(latest.bitcoin) || 0 : 0;
  const bitcoinPrevious = previous ? Number(previous.bitcoin) || 0 : null;
  const bitcoinDiff = bitcoinPrevious !== null ? bitcoinLatest - bitcoinPrevious : null;
  const bitcoinDiffPct =
    bitcoinPrevious && bitcoinPrevious !== 0 ? (bitcoinDiff / bitcoinPrevious) * 100 : null;

  const toggleLegendKey = (key) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const pieData = useMemo(() => {
    if (!latest) return [];
    return FIELDS.map((f) => {
      const value = Number(latest[f.key]) || 0;
      const prevValue = previous ? Number(previous[f.key]) || 0 : null;
      const itemDiff = prevValue !== null ? value - prevValue : null;
      return {
        name: f.label,
        key: f.key,
        value,
        diff: itemDiff,
        color: f.color,
      };
    }).filter((d) => d.value > 0);
  }, [latest, previous]);

  const handleDraftChange = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const handleAddRecord = async () => {
    setSaveStatus("saving");
    const payload = { record_date: draft.date };
    FIELD_KEYS.forEach((k) => {
      const n = Number(String(draft[k]).replace(/,/g, ""));
      payload[k] = isNaN(n) ? 0 : n;
    });

    const { error } = await supabase
      .from("asset_records")
      .upsert(payload, { onConflict: "record_date" });

    if (error) {
      setSaveStatus("error");
      setError(error.message);
      return;
    }

    setSaveStatus("saved");
    setShowAddForm(false);
    await fetchRecords();
    setTimeout(() => setSaveStatus("idle"), 1500);
  };

  const openAddForm = () => {
    const base = latest || Object.fromEntries(FIELD_KEYS.map((k) => [k, 0]));
    const init = { date: new Date().toISOString().slice(0, 10) };
    FIELD_KEYS.forEach((k) => (init[k] = String(base[k] ?? 0)));
    setDraft(init);
    setShowAddForm(true);
  };

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.loadingText}>불러오는 중...</div>
      </div>
    );
  }

  if (error && sortedRecords.length === 0) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.loadingText}>오류가 발생했어요: {error}</div>
      </div>
    );
  }

  if (sortedRecords.length === 0) {
    return (
      <div style={styles.app}>
        <div style={styles.emptyState}>
          <p>아직 입력된 자산 기록이 없어요.</p>
          <button style={styles.fabInline} onClick={openAddForm}>
            첫 기록 입력하기
          </button>
        </div>
        {showAddForm && (
          <AddRecordModal
            draft={draft}
            onChange={handleDraftChange}
            onCancel={() => setShowAddForm(false)}
            onSave={handleAddRecord}
            saveStatus={saveStatus}
          />
        )}
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <Header
        latestTotal={latestTotal}
        diff={diff}
        diffPct={diffPct}
        latestDate={latest?.date}
        saveStatus={saveStatus}
      />

      <div style={styles.tabRow}>
        <TabButton active={view === "trend"} onClick={() => setView("trend")} label="추이" />
        <TabButton active={view === "mix"} onClick={() => setView("mix")} label="비중" />
        <TabButton active={view === "history"} onClick={() => setView("history")} label="기록" />
      </div>

      {view === "trend" && (
        <TrendView
          chartData={chartData}
          activeSeries={activeSeries}
          allLegendSeries={allLegendSeries}
          hiddenKeys={hiddenKeys}
          toggleLegendKey={toggleLegendKey}
          rangeMonths={rangeMonths}
          setRangeMonths={setRangeMonths}
          bitcoinLatest={bitcoinLatest}
          bitcoinDiff={bitcoinDiff}
          bitcoinDiffPct={bitcoinDiffPct}
        />
      )}
      {view === "mix" && <MixView pieData={pieData} latestTotal={latestTotal} />}
      {view === "history" && <HistoryView records={sortedRecords} />}

      <button style={styles.fab} onClick={openAddForm} aria-label="이번 달 자산 입력">
        <span style={{ fontSize: 20, lineHeight: 1 }}>＋</span>
        <span style={{ fontSize: 14, fontWeight: 500 }}>이번 달 입력</span>
      </button>

      {showAddForm && (
        <AddRecordModal
          draft={draft}
          onChange={handleDraftChange}
          onCancel={() => setShowAddForm(false)}
          onSave={handleAddRecord}
          saveStatus={saveStatus}
        />
      )}
    </div>
  );
}

function Header({ latestTotal, diff, diffPct, latestDate, saveStatus }) {
  const positive = diff !== null && diff >= 0;
  return (
    <div style={styles.header}>
      <div style={styles.headerTop}>
        <span style={styles.headerLabel}>총 자산 · {latestDate ? formatDateFull(latestDate) : ""}</span>
        {saveStatus === "saving" && <span style={styles.saveTag}>저장 중...</span>}
        {saveStatus === "saved" && <span style={styles.saveTagOk}>저장됨 ✓</span>}
      </div>
      <div style={styles.headerTotal}>{formatWonFull(latestTotal)}</div>
      {diff !== null && (
        <div style={{ ...styles.diffRow, color: positive ? "#1D9E75" : "#D04A3C" }}>
          <span>{positive ? "▲" : "▼"}</span>
          <span>
            전월 대비 {positive ? "+" : ""}
            {formatWon(diff)} ({positive ? "+" : ""}
            {diffPct?.toFixed(1)}%)
          </span>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.tabButton,
        ...(active ? styles.tabButtonActive : {}),
      }}
    >
      {label}
    </button>
  );
}

function RangeSelector({ rangeMonths, setRangeMonths }) {
  const options = [
    { label: "6개월", value: 6 },
    { label: "1년", value: 12 },
    { label: "3년", value: 36 },
    { label: "전체", value: 0 },
  ];
  return (
    <div style={styles.rangeRow}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => setRangeMonths(o.value)}
          style={{
            ...styles.rangeButton,
            ...(rangeMonths === o.value ? styles.rangeButtonActive : {}),
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CustomTooltip({ active, payload, label, activeSeries }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div style={styles.tooltipBox}>
      <div style={styles.tooltipDate}>{label}</div>
      {activeSeries
        .filter((s) => row[s.key] > 0)
        .map((s) => (
          <div key={s.key} style={styles.tooltipRow}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }}></span>
              {s.label}
            </span>
            <span>{formatWon(row[s.key])}</span>
          </div>
        ))}
      <div style={styles.tooltipTotalRow}>
        <span>합계</span>
        <span>{formatWon(row.total)}</span>
      </div>
    </div>
  );
}

function TrendView({
  chartData,
  activeSeries,
  allLegendSeries,
  hiddenKeys,
  toggleLegendKey,
  rangeMonths,
  setRangeMonths,
  bitcoinLatest,
  bitcoinDiff,
  bitcoinDiffPct,
}) {
  return (
    <div>
      <RangeSelector rangeMonths={rangeMonths} setRangeMonths={setRangeMonths} />
      <div style={{ width: "100%", height: 280, marginTop: 8 }}>
        <ResponsiveContainer>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {activeSeries.map((s) => (
                <linearGradient id={`grad-${s.key}`} key={s.key} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#888" }}
              axisLine={{ stroke: "#eee" }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={30}
            />
            <YAxis
              tickFormatter={(v) => formatWon(v)}
              tick={{ fontSize: 11, fill: "#888" }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip content={<CustomTooltip activeSeries={activeSeries} />} />
            {activeSeries.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stackId="1"
                stroke={s.color}
                strokeWidth={1.5}
                fill={`url(#grad-${s.key})`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ToggleLegend allLegendSeries={allLegendSeries} hiddenKeys={hiddenKeys} toggleLegendKey={toggleLegendKey} />
      {bitcoinLatest > 0 && (
        <BitcoinCard latest={bitcoinLatest} diff={bitcoinDiff} diffPct={bitcoinDiffPct} />
      )}
    </div>
  );
}

function BitcoinCard({ latest, diff, diffPct }) {
  const positive = diff !== null && diff >= 0;
  return (
    <div style={styles.bitcoinCard}>
      <div style={styles.bitcoinCardLeft}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: "#BA7517", display: "inline-block" }}></span>
        <span style={{ fontSize: 13, color: "#888" }}>비트코인 (업비트)</span>
        <span style={styles.bitcoinNote}>그래프 제외 · 별도 표시</span>
      </div>
      <div style={styles.bitcoinCardRight}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{formatWonFull(latest)}</span>
        {diff !== null && (
          <span style={{ fontSize: 12, color: positive ? "#1D9E75" : "#D04A3C" }}>
            {positive ? "▲" : "▼"} {formatWon(diff)}
            {diffPct !== null ? ` (${positive ? "+" : ""}${diffPct.toFixed(1)}%)` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleLegend({ allLegendSeries, hiddenKeys, toggleLegendKey }) {
  return (
    <div style={styles.toggleLegendWrap}>
      <div style={styles.toggleLegendHint}>색을 눌러 그래프에서 켜고 끌 수 있어요</div>
      <div style={styles.legendWrap}>
        {allLegendSeries.map((s) => {
          const isHidden = hiddenKeys.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => toggleLegendKey(s.key)}
              style={{
                ...styles.legendItemButton,
                opacity: isHidden ? 0.4 : 1,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: isHidden ? "#ddd" : s.color,
                  display: "inline-block",
                }}
              ></span>
              <span style={{ textDecoration: isHidden ? "line-through" : "none" }}>{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MixView({ pieData, latestTotal }) {
  return (
    <div>
      <div style={{ width: "100%", height: 240, position: "relative" }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={92}
              paddingAngle={2}
              strokeWidth={0}
            >
              {pieData.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={styles.pieCenterLabel}>
          <div style={{ fontSize: 12, color: "#888" }}>총 자산</div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{formatWon(latestTotal)}</div>
        </div>
      </div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {pieData
          .slice()
          .sort((a, b) => b.value - a.value)
          .map((d) => {
            const pct = latestTotal ? (d.value / latestTotal) * 100 : 0;
            return (
              <div key={d.key} style={styles.mixRow}>
                <div style={styles.mixRowTop}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, display: "inline-block" }}></span>
                    <span style={{ fontSize: 14 }}>{d.name}</span>
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{pct.toFixed(1)}%</span>
                </div>
                <div style={styles.mixBarTrack}>
                  <div style={{ ...styles.mixBarFill, width: `${pct}%`, background: d.color }}></div>
                </div>
                <div style={{ ...styles.mixRowTop, marginTop: 2 }}>
                  <div style={{ fontSize: 12, color: "#888" }}>{formatWonFull(d.value)}</div>
                  {d.diff !== null && d.diff !== 0 && (
                    <div style={{ fontSize: 12, color: d.diff >= 0 ? "#1D9E75" : "#D04A3C" }}>
                      {d.diff >= 0 ? "+" : ""}
                      {formatWon(d.diff)} (전월 대비)
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function HistoryView({ records }) {
  const reversed = useMemo(() => [...records].reverse(), [records]);
  const [expandedDate, setExpandedDate] = useState(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {reversed.map((r, idx) => {
        const total = totalOf(r);
        const prevRec = reversed[idx + 1];
        const prevTotal = prevRec ? totalOf(prevRec) : null;
        const diff = prevTotal !== null ? total - prevTotal : null;
        const isExpanded = expandedDate === r.date;
        const itemsWithValue = FIELDS.filter((f) => (Number(r[f.key]) || 0) > 0);

        return (
          <div key={r.date} style={styles.historyCard}>
            <button
              style={styles.historyCardButton}
              onClick={() => setExpandedDate(isExpanded ? null : r.date)}
            >
              <div style={styles.historyTop}>
                <span style={{ fontSize: 13, color: "#888" }}>{formatDateFull(r.date)}</span>
                {diff !== null && (
                  <span style={{ fontSize: 12, color: diff >= 0 ? "#1D9E75" : "#D04A3C" }}>
                    {diff >= 0 ? "+" : ""}
                    {formatWon(diff)}
                  </span>
                )}
              </div>
              <div style={styles.historyBottomRow}>
                <div style={{ fontSize: 17, fontWeight: 500 }}>{formatWonFull(total)}</div>
                <span style={{ fontSize: 12, color: "#bbb" }}>{isExpanded ? "접기 ▲" : "세부 보기 ▼"}</span>
              </div>
            </button>

            {isExpanded && (
              <div style={styles.historyDetailList}>
                {itemsWithValue.map((f) => {
                  const value = Number(r[f.key]) || 0;
                  const prevValue = prevRec ? Number(prevRec[f.key]) || 0 : null;
                  const itemDiff = prevValue !== null ? value - prevValue : null;
                  return (
                    <div key={f.key} style={styles.historyDetailRow}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: f.color, display: "inline-block" }}></span>
                        {f.label}
                      </span>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontSize: 13 }}>{formatWonFull(value)}</span>
                        {itemDiff !== null && itemDiff !== 0 && (
                          <span style={{ fontSize: 11, color: itemDiff >= 0 ? "#1D9E75" : "#D04A3C" }}>
                            {itemDiff >= 0 ? "+" : ""}
                            {formatWon(itemDiff)}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddRecordModal({ draft, onChange, onCancel, onSave, saveStatus }) {
  let lastGroup = null;
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <div style={styles.modalHeader}>
          <span style={{ fontSize: 16, fontWeight: 500 }}>이번 달 자산 입력</span>
          <button onClick={onCancel} style={styles.iconButton} aria-label="닫기">
            ✕
          </button>
        </div>

        <div style={styles.modalBody}>
          <label style={styles.fieldLabel}>기준일</label>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => onChange("date", e.target.value)}
          />

          {FIELDS.map((f) => {
            const showGroupHeader = f.group !== lastGroup;
            lastGroup = f.group;
            return (
              <React.Fragment key={f.key}>
                {showGroupHeader && <div style={styles.groupHeader}>{f.group}</div>}
                <div style={{ marginTop: 10 }}>
                  <label style={styles.fieldLabel}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: f.color, display: "inline-block", marginRight: 6 }}></span>
                    {f.label}
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={draft[f.key]}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    placeholder="0"
                  />
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {saveStatus === "error" && (
          <div style={styles.errorBox}>저장 중 오류가 발생했어요. 다시 시도해주세요.</div>
        )}

        <button onClick={onSave} style={styles.saveButton} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  app: {
    padding: "1rem 1rem 5rem",
    maxWidth: 480,
    margin: "0 auto",
    color: "#2a2825",
    minHeight: "100vh",
  },
  emptyState: {
    textAlign: "center",
    padding: "4rem 1rem",
    color: "#888",
  },
  fabInline: {
    marginTop: 16,
    padding: "10px 20px",
    background: "#2a2825",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    cursor: "pointer",
  },
  loadingWrap: { padding: "3rem 1rem", textAlign: "center" },
  loadingText: { fontSize: 14, color: "#888" },
  header: {
    background: "#f1efe9",
    borderRadius: 16,
    padding: "1.1rem 1.25rem",
    marginBottom: "1rem",
  },
  headerTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerLabel: { fontSize: 13, color: "#888" },
  saveTag: { fontSize: 11, color: "#888" },
  saveTagOk: { fontSize: 11, color: "#1D9E75" },
  headerTotal: { fontSize: 28, fontWeight: 600, marginTop: 4 },
  diffRow: { display: "flex", alignItems: "center", gap: 4, fontSize: 13, marginTop: 6 },
  tabRow: {
    display: "flex",
    gap: 6,
    marginBottom: "0.75rem",
    background: "#f1efe9",
    borderRadius: 10,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    padding: "8px 0",
    fontSize: 13,
    fontWeight: 500,
    border: "none",
    background: "transparent",
    borderRadius: 8,
    color: "#888",
    cursor: "pointer",
  },
  tabButtonActive: {
    background: "#fff",
    color: "#2a2825",
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  },
  detailToggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailToggleLabel: { fontSize: 12, color: "#888" },
  detailToggleButtons: { display: "flex", gap: 6 },
  smallToggleButton: {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 8,
    border: "1px solid #e2ded5",
    background: "#fff",
    color: "#888",
    cursor: "pointer",
  },
  smallToggleButtonActive: {
    background: "#2a2825",
    color: "#fff",
    borderColor: "#2a2825",
  },
  rangeRow: { display: "flex", gap: 6 },
  rangeButton: {
    fontSize: 12,
    padding: "5px 12px",
    borderRadius: 8,
    border: "1px solid #e2ded5",
    background: "#fff",
    color: "#888",
    cursor: "pointer",
  },
  rangeButtonActive: {
    background: "#2a2825",
    color: "#fff",
    borderColor: "#2a2825",
  },
  tooltipBox: {
    background: "#fff",
    border: "1px solid #e2ded5",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 12,
    minWidth: 170,
    maxWidth: 220,
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  tooltipDate: { fontSize: 12, color: "#888", marginBottom: 4 },
  tooltipRow: { display: "flex", justifyContent: "space-between", gap: 12, padding: "2px 0" },
  tooltipTotalRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4,
    paddingTop: 4,
    borderTop: "1px solid #eee",
    fontWeight: 500,
  },
  legendWrap: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 },
  toggleLegendWrap: { marginTop: 12 },
  toggleLegendHint: { fontSize: 11, color: "#bbb", marginBottom: 6 },
  legendItemButton: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "#666",
    background: "#f7f5f1",
    border: "none",
    borderRadius: 999,
    padding: "5px 10px",
    cursor: "pointer",
  },
  bitcoinCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    padding: "0.85rem 1rem",
    background: "#fdf8ef",
    border: "1px solid #f0e4cc",
    borderRadius: 12,
  },
  bitcoinCardLeft: { display: "flex", alignItems: "center", gap: 6 },
  bitcoinNote: { fontSize: 11, color: "#bbb", marginLeft: 4 },
  bitcoinCardRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 },
  legendItem: { display: "flex", alignItems: "center", gap: 5 },
  pieCenterLabel: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    textAlign: "center",
  },
  mixRow: {},
  mixRowTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  mixBarTrack: {
    height: 6,
    background: "#f1efe9",
    borderRadius: 3,
    marginTop: 4,
    overflow: "hidden",
  },
  mixBarFill: { height: "100%", borderRadius: 3 },
  historyCard: {
    background: "#fff",
    border: "1px solid #f1efe9",
    borderRadius: 14,
    overflow: "hidden",
  },
  historyCardButton: {
    width: "100%",
    background: "transparent",
    border: "none",
    padding: "0.85rem 1rem",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  },
  historyTop: { display: "flex", justifyContent: "space-between", marginBottom: 4 },
  historyBottomRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  historyDetailList: {
    borderTop: "1px solid #f1efe9",
    padding: "0.5rem 1rem 0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  historyDetailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fab: {
    position: "fixed",
    bottom: 20,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#2a2825",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "12px 22px",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 50,
  },
  modalCard: {
    background: "#fff",
    borderRadius: "16px 16px 0 0",
    padding: "1.25rem",
    width: "100%",
    maxWidth: 480,
    maxHeight: "85vh",
    overflowY: "auto",
  },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  iconButton: { background: "transparent", border: "none", cursor: "pointer", color: "#888", fontSize: 16 },
  modalBody: { display: "flex", flexDirection: "column" },
  groupHeader: {
    fontSize: 12,
    fontWeight: 500,
    color: "#888",
    marginTop: 18,
    marginBottom: 4,
    paddingTop: 10,
    borderTop: "1px solid #f1efe9",
  },
  fieldLabel: { fontSize: 13, color: "#888", display: "flex", alignItems: "center", marginBottom: 6 },
  errorBox: {
    marginTop: 12,
    padding: "10px 12px",
    background: "#fdf0ee",
    color: "#D04A3C",
    borderRadius: 8,
    fontSize: 13,
  },
  saveButton: {
    marginTop: 18,
    width: "100%",
    padding: "12px 0",
    background: "#2a2825",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
  },
};
