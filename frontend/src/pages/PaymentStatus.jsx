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
import { clearCurrentUser, getCurrentUser } from "../authSession";
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
import { formatEthiopianDate } from "../utils/dateUtils";
import "../style.css";

const emptyStatus = {
  summary: {
    totalTenants: 0,
    paid: 0,
    notPaid: 0,
    totalPaidAmount: 0,
    totalCollected: 0,
    totalOutstanding: 0
  },
  paid: [],
  notPaid: []
};

const formatCurrency = (amount) => `Br ${Number(amount || 0).toLocaleString()}`;

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
  const currentUser = getCurrentUser();
  const [buildings, setBuildings] = useState([]);
  const [statusData, setStatusData] = useState(emptyStatus);
  const [activeList, setActiveList] = useState("notPaid");
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

    await loadCachedJson(
      withBuilding("/payment-status", selectedBuildingId),
      (data) => setStatusData({
        summary: data?.summary || emptyStatus.summary,
        paid: Array.isArray(data?.paid) ? data.paid : [],
        notPaid: Array.isArray(data?.notPaid) ? data.notPaid : []
      }),
      setError,
      "Failed to load payment status",
      { cacheTtl: 15000 }
    );
  }, [selectedBuildingId, setError]);

  useEffect(() => {
    fetchBuildings();
  }, [fetchBuildings]);

  useEffect(() => {
    fetchPaymentStatus();
  }, [fetchPaymentStatus]);

  const logout = async () => {
    await apiFetch(`${API_BASE}/logout`, { method: "POST" }).catch(() => {});
    localStorage.removeItem("token");
    clearCurrentUser();
    navigate("/login", { replace: true });
  };

  const activeItems = activeList === "paid" ? statusData.paid : statusData.notPaid;
  const filteredItems = useMemo(
    () => activeItems.filter((item) => matchesSearch(item, searchTerm)),
    [activeItems, searchTerm]
  );

  const summary = statusData.summary || emptyStatus.summary;
  const listTitle = activeList === "paid" ? "Paid / ተከፍሏል " : "Not Paid / አልተከፈለም ";

  return (
    <div className="payment-status-page">
      <header className="payment-status-header">
        <div>
          <span className="payment-status-eyebrow">Payment Status / የክፍያ ሁኔታ </span>
          <h1>Who paid and who did not pay</h1>
          {currentUser && (
            <p>
              Logged in: <strong>{currentUser.name || currentUser.email}</strong>
            </p>
          )}
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
                    Amount / ብዛት: {formatCurrency(item.outstandingBalance || item.totalAmount)}
                  </span>
                  <span className="payment-row-fact-large">
                    <CalendarDaysIcon />
                    Due / የክፍያ ቀን: {item.dueDate ? formatEthiopianDate(item.dueDate) : "No invoice"}
                  </span>
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
