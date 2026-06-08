import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightOnRectangleIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  UserCircleIcon
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { clearAuthToken, clearCurrentUser } from "../authSession";
import {
  API_BASE,
  apiFetch,
  getSelectedBuildingId,
  loadCachedJson,
  setSelectedBuildingId,
  withBuilding
} from "../buildingSelection";
import useSelectedBuilding from "../hooks/useSelectedBuilding";
import useShortError from "../hooks/useShortError";
import {
  formatEthiopianDate,
  gregorianToEthiopian
} from "../utils/dateUtils";
import "../style.css";

const ETHIOPIAN_MONTH_NAMES = [
  "Meskerem",
  "Tikimt",
  "Hidar",
  "Tahsas",
  "Tir",
  "Yekatit",
  "Megabit",
  "Miazia",
  "Ginbot",
  "Sene",
  "Hamle",
  "Nehase",
  "Pagume"
];

const emptyStatus = {
  summary: {
    totalTenants: 0,
    paid: 0,
    notPaid: 0,
    totalPaidAmount: 0,
    totalCollected: 0,
    totalOutstanding: 0
  },
  selectedPeriod: null,
  paid: [],
  notPaid: []
};

const formatCurrency = (amount) => `Br ${Number(amount || 0).toLocaleString()}`;

const formatEthiopianMonth = ({ year, month, isCurrentMonth = false }) => {
  const name = ETHIOPIAN_MONTH_NAMES[month - 1] || `Month ${month}`;
  return `${name} ${year} EC${isCurrentMonth ? " / Current" : ""}`;
};

const shiftEthiopianMonth = ({ year, month }, offset) => {
  let nextYear = year;
  let nextMonth = month + offset;

  while (nextMonth < 1) {
    nextYear -= 1;
    nextMonth += 13;
  }

  while (nextMonth > 13) {
    nextYear += 1;
    nextMonth -= 13;
  }

  return { year: nextYear, month: nextMonth };
};

const getCurrentEthiopianPeriod = () => {
  const today = gregorianToEthiopian(new Date());
  return {
    year: today?.year || new Date().getFullYear(),
    month: today?.month || 1
  };
};

const matchesSearch = (item, searchTerm) => {
  const query = searchTerm.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    item.tenantName,
    item.tenantUnit,
    item.invoiceNumber,
    item.invoiceStatus
  ].some((value) => String(value || "").toLowerCase().includes(query));
};

export default function PaymentStatus() {
  const navigate = useNavigate();
  const selectedBuildingId = useSelectedBuilding();
  const [buildings, setBuildings] = useState([]);
  const [statusData, setStatusData] = useState(emptyStatus);
  const [activeList, setActiveList] = useState("notPaid");
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentEthiopianPeriod);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useShortError();

  const fetchBuildings = useCallback(async () => {
    await loadCachedJson(
      `${API_BASE}/buildings`,
      (data) => {
        const buildingList = Array.isArray(data) ? data : [];
        setBuildings(buildingList);

        if (!getSelectedBuildingId() && buildingList.length > 0) {
          setSelectedBuildingId(buildingList[0]._id);
        }
      },
      setError,
      "Failed to load buildings",
      { cacheTtl: 15000 }
    );
  }, [setError]);

  const fetchPaymentStatus = useCallback(async () => {
    if (!selectedBuildingId) {
      setStatusData(emptyStatus);
      return;
    }

    const url = new URL(withBuilding("/payment-status", selectedBuildingId));
    url.searchParams.set("ethiopianYear", selectedPeriod.year);
    url.searchParams.set("ethiopianMonth", selectedPeriod.month);

    await loadCachedJson(
      url.toString(),
      (data) => setStatusData({
        summary: data?.summary || emptyStatus.summary,
        selectedPeriod: data?.selectedPeriod || null,
        paid: Array.isArray(data?.paid) ? data.paid : [],
        notPaid: Array.isArray(data?.notPaid) ? data.notPaid : []
      }),
      setError,
      "Failed to load payment status",
      { useCache: false }
    );
  }, [selectedBuildingId, selectedPeriod, setError]);

  useEffect(() => {
    fetchBuildings();
  }, [fetchBuildings]);

  useEffect(() => {
    fetchPaymentStatus();
  }, [fetchPaymentStatus]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (!document.hidden) {
        fetchPaymentStatus();
      }
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [fetchPaymentStatus]);

  const logout = async () => {
    await apiFetch(`${API_BASE}/logout`, { method: "POST" }).catch(() => {});
    clearAuthToken();
    clearCurrentUser();
    navigate("/login", { replace: true });
  };

  const activeItems = activeList === "paid" ? statusData.paid : statusData.notPaid;
  const periodOptions = useMemo(() => {
    const currentPeriod = getCurrentEthiopianPeriod();
    return Array.from({ length: 24 }, (_, index) => {
      const period = shiftEthiopianMonth(currentPeriod, -index);
      return {
        ...period,
        key: `${period.year}-${period.month}`,
        isCurrentMonth: index === 0
      };
    });
  }, []);
  const filteredItems = useMemo(
    () => activeItems.filter((item) => matchesSearch(item, searchTerm)),
    [activeItems, searchTerm]
  );

  const summary = statusData.summary || emptyStatus.summary;
  const selectedPeriodLabel = statusData.selectedPeriod
    ? formatEthiopianMonth({
      year: statusData.selectedPeriod.ethiopianYear,
      month: statusData.selectedPeriod.ethiopianMonth,
      isCurrentMonth: statusData.selectedPeriod.isCurrentMonth
    })
    : formatEthiopianMonth(selectedPeriod);
  const listTitle = activeList === "paid" ? "Paid / ተከፍሏል " : "Not Paid / አልተከፈለም ";

  return (
    <div className="payment-status-page">
      <header className="payment-status-header">
        <div>
          <span className="payment-status-eyebrow">Payment Status / የክፍያ ሁኔታ </span>
          <h1>Who paid and who did not pay</h1>
        </div>

        <div className="payment-status-actions">
          <label className="payment-building-select">
            Active Building / ህንፃ ምርጫ
            <select
              value={selectedBuildingId}
              onChange={(event) => setSelectedBuildingId(event.target.value)}
            >
              <option value="">Select Building / ህንፃ ይምረጡ</option>
              {buildings.map((building) => (
                <option key={building._id} value={building._id}>
                  {building.name}
                </option>
              ))}
            </select>
          </label>

          <label className="payment-building-select payment-period-select">
            Paid Month / የተከፈለበት ወር
            <select
              value={`${selectedPeriod.year}-${selectedPeriod.month}`}
              onChange={(event) => {
                const [year, month] = event.target.value.split("-").map(Number);
                setSelectedPeriod({ year, month });
              }}
            >
              {periodOptions.map((period) => (
                <option key={period.key} value={period.key}>
                  {formatEthiopianMonth(period)}
                </option>
              ))}
            </select>
          </label>

          <button className="secondary-btn payment-logout-btn" onClick={logout}>
            <ArrowRightOnRectangleIcon />
            Logout
          </button>
        </div>
      </header>

      {!selectedBuildingId && (
        <p className="error">Select a building / ህንፃ ይምረጡ </p>
      )}
      {error && <p className="error">{error}</p>}

      <section className="payment-status-summary" aria-label="Payment summary">
        <article className="payment-summary-card is-paid">
          <CheckCircleIcon />
          <span>Paid / የከፈለ </span>
          <strong>{summary.paid}</strong>
        </article>
        <article className="payment-summary-card is-paid">
          <CurrencyDollarIcon />
          <span>Total Paid / ጠቅላላ የተከፈለ </span>
          <strong>{formatCurrency(summary.totalPaidAmount ?? summary.totalCollected)}</strong>
        </article>
        <article className="payment-summary-card is-unpaid">
          <ExclamationTriangleIcon />
          <span>Not Paid / ያልከፈለ</span>
          <strong>{summary.notPaid}</strong>
        </article>
        <article className="payment-summary-card">
          <CurrencyDollarIcon />
          <span>Outstanding / የቀረ ክፍያ </span>
          <strong>{formatCurrency(summary.totalOutstanding)}</strong>
        </article>
      </section>

      <section className="payment-status-panel">
        <div className="payment-status-tools">
          <div className="payment-status-tabs" role="tablist" aria-label="Payment status filter">
            <button
              className={activeList === "notPaid" ? "active" : ""}
              onClick={() => setActiveList("notPaid")}
            >
              Not Paid / ያልተከፈለ  ({summary.notPaid})
            </button>
            <button
              className={activeList === "paid" ? "active" : ""}
              onClick={() => setActiveList("paid")}
            >
              Paid / የተከፈለ  ({summary.paid})
            </button>
          </div>

          <label className="payment-search">
            <MagnifyingGlassIcon />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search"
            />
          </label>
        </div>

        <div className="payment-status-list-heading">
          <h2>{listTitle}</h2>
          <span>{filteredItems.length} ተከራይ{filteredItems.length === 1 ? "" : "/ዎች"}</span>
        </div>

        {activeList === "paid" && (
          <div className="payment-period-row">
            <span>{selectedPeriodLabel}</span>
            <label className="payment-period-compact">
              <span>Month</span>
              <select
                value={`${selectedPeriod.year}-${selectedPeriod.month}`}
                onChange={(event) => {
                  const [year, month] = event.target.value.split("-").map(Number);
                  setSelectedPeriod({ year, month });
                }}
              >
                {periodOptions.map((period) => (
                  <option key={period.key} value={period.key}>
                    {formatEthiopianMonth(period)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="payment-status-list">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <article
                key={`${item.tenantId || item.invoiceId}-${item.invoiceNumber || "no-invoice"}`}
                className={`payment-status-row ${item.status === "paid" ? "is-paid" : "is-unpaid"}`}
              >
                <div className="payment-tenant-main">
                  <UserCircleIcon />
                  <div>
                    <h3>{item.tenantName || "Tenant"}</h3>
                    <p>
                      Unit / ሱቅ ቁጥር: <strong>{item.tenantUnit || "-"}</strong>
                    </p>
                  </div>
                </div>

                <div className="payment-row-facts payment-row-key-facts">
                  <span className="payment-row-fact-large">
                    <CurrencyDollarIcon />
                     {formatCurrency(item.amountDue ?? item.outstandingBalance ?? item.totalAmount)}
                  </span>
                  <span className="payment-row-fact-large">
                    <CalendarDaysIcon />
                    የክፍያ ቀን: {item.dueDate ? formatEthiopianDate(item.dueDate) : "No invoice"}
                  </span>
                  {item.status === "paid" && item.paymentDate && (
                    <span className="payment-row-fact-large">
                      <CalendarDaysIcon />
                      የተከፈለበት ቀን: {formatEthiopianDate(item.paymentDate)}
                    </span>
                  )}
                </div>

                <strong className={`payment-status-pill ${item.status === "paid" ? "is-paid" : "is-unpaid"}`}>
                  {item.status === "paid" ? "Paid / ተከፍሏል" : "Not Paid / አልተከፈለም"}
                </strong>
              </article>
            ))
          ) : (
            <p className="empty-state">
              {activeList === "paid"
                ? "No paid tenants found."
                : "Everyone is paid."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
