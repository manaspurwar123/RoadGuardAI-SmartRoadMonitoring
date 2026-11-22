import RepairManagement from "../components/RepairManagement";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from "recharts";

import {
    LayoutDashboard,
    AlertTriangle,
    CheckCircle2,
    Clock3,
    MapPin,
    Search,
    RefreshCw,
    Eye,
    Filter,
    BrainCircuit,
    LogOut,
} from "lucide-react";

// RoadGuard AI Backend
const API_URL = "http://127.0.0.1:8001";

const STATUS_COLORS = {
    Open: "#ef4444",
    "In Progress": "#f59e0b",
    Resolved: "#16a34a",
    Completed: "#16a34a",
};

const PRIORITY_COLORS = {
    High: "#ef4444",
    Medium: "#f59e0b",
    Low: "#16a34a",
};

function getPriority(report) {
    if (report.priority_level) {
        return report.priority_level;
    }

    const score = Number(report.priority_score ?? 50);

    if (score >= 70) return "High";
    if (score >= 40) return "Medium";
    return "Low";
}

function getImageUrl(path) {
    if (!path) return "";

    if (path.startsWith("http")) {
        return path;
    }

    return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

function AdminDashboard() {
    const navigate = useNavigate();

    const adminUsername =
        sessionStorage.getItem("roadguard_admin_username") ||
        "Administrator";

    const [reports, setReports] = useState([]);
    const [repairStats, setRepairStats] = useState(null);
    const [repairStatsError, setRepairStatsError] = useState("");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [updatingId, setUpdatingId] = useState(null);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [priorityFilter, setPriorityFilter] = useState("All");

    const [selectedReport, setSelectedReport] = useState(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // ===============================
    // ADMIN LOGOUT
    // ===============================

    function handleLogout() {
        sessionStorage.removeItem("roadguard_admin_token");
        sessionStorage.removeItem("roadguard_admin_username");

        navigate("/admin/login", { replace: true });
    }

    function handleUnauthorized() {
        handleLogout();
    }

    // ===============================
    // FETCH REPORTS
    // ===============================

    async function fetchReports(showRefresh = false) {
        if (showRefresh) {
            setRefreshing(true);
        }

        try {
            setError("");

            const token = sessionStorage.getItem(
                "roadguard_admin_token"
            );

            if (!token) {
                handleUnauthorized();
                return;
            }

            const response = await fetch(`${API_URL}/reports`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.status === 401 || response.status === 403) {
                handleUnauthorized();
                return;
            }

            if (!response.ok) {
                throw new Error("Failed to load road reports.");
            }

            const data = await response.json();

            setReports(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message || "Unable to fetch reports.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    // Phase 26: authenticated repair statistics
    async function fetchRepairStats() {
        const token = sessionStorage.getItem("roadguard_admin_token");
        if (!token) return;
        try {
            const response = await fetch(`${API_URL}/admin/repairs/stats`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.status === 401 || response.status === 403) {
                handleUnauthorized();
                return;
            }
            if (!response.ok) throw new Error("Unable to load repair team statistics.");
            const data = await response.json();
            setRepairStats(data);
            setRepairStatsError("");
        } catch (err) {
            setRepairStatsError(err.message || "Repair statistics unavailable.");
        }
    }

    function refreshDashboard(showRefresh = false) {
        fetchReports(showRefresh);
        fetchRepairStats();
    }

    useEffect(() => {
        refreshDashboard();
        const intervalId = setInterval(() => refreshDashboard(), 30000);
        return () => clearInterval(intervalId);
    }, []);

    // ===============================
    // UPDATE REPAIR STATUS
    // ===============================

    async function updateStatus(reportId, status) {
        setUpdatingId(reportId);
        setError("");
        setSuccess("");

        try {
            const token = sessionStorage.getItem(
                "roadguard_admin_token"
            );

            if (!token) {
                handleUnauthorized();
                return;
            }

            const response = await fetch(
                `${API_URL}/reports/${reportId}/status`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ status }),
                }
            );

            if (response.status === 401 || response.status === 403) {
                handleUnauthorized();
                return;
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    typeof data.detail === "string"
                        ? data.detail
                        : "Status update failed."
                );
            }

            setReports((previous) =>
                previous.map((report) =>
                    report.id === reportId
                        ? { ...report, ...data, status }
                        : report
                )
            );

            setSelectedReport((previous) =>
                previous?.id === reportId
                    ? { ...previous, ...data, status }
                    : previous
            );

            setSuccess(
                `Report #${reportId} updated to ${status}.`
            );
        } catch (err) {
            setError(err.message || "Unable to update status.");
        } finally {
            setUpdatingId(null);
        }
    }

    // ===============================
    // DASHBOARD STATISTICS
    // ===============================


    const stats = useMemo(() => {
        const total = reports.length;

        const open = reports.filter(
            (r) => r.status === "Open"
        ).length;

        const progress = reports.filter(
            (r) => r.status === "In Progress"
        ).length;

        const completed = reports.filter(
            (r) =>
                r.status === "Completed" ||
                r.status === "Resolved"
        ).length;

        const pending = reports.filter(
            (r) =>
                r.status !== "Completed" &&
                r.status !== "Resolved"
        ).length;

        const high = reports.filter(
            (r) =>
                r.status !== "Completed" &&
                r.status !== "Resolved" &&
                getPriority(r) === "High"
        ).length;

        const aiAnalyzed = reports.filter(
            (r) => r.ai_prediction
        ).length;

        const completionRate =
            total > 0
                ? Number(((completed / total) * 100).toFixed(1))
                : 0;

        return {
            total,
            open,
            progress,
            completed,
            pending,
            high,
            aiAnalyzed,
            completionRate,
        };
    }, [reports]);

    // ===============================
    // CHART DATA
    // ===============================

    const statusChartData = [
        { name: "Open", value: stats.open },
        { name: "In Progress", value: stats.progress },
        { name: "Completed", value: stats.completed },
    ];

    const priorityChartData = [
        {
            name: "High",
            value: reports.filter(
                (r) => getPriority(r) === "High"
            ).length,
        },
        {
            name: "Medium",
            value: reports.filter(
                (r) => getPriority(r) === "Medium"
            ).length,
        },
        {
            name: "Low",
            value: reports.filter(
                (r) => getPriority(r) === "Low"
            ).length,
        },
    ];

    // ===============================
    // SEARCH AND FILTER
    // ===============================

    const filteredReports = useMemo(() => {
        return reports
            .filter((report) => {
                const query = search.trim().toLowerCase();

                const matchesSearch =
                    !query ||
                    String(report.id).includes(query) ||
                    String(report.description || "")
                        .toLowerCase()
                        .includes(query) ||
                    String(report.ai_prediction || "")
                        .toLowerCase()
                        .includes(query);

                const matchesStatus =
                    statusFilter === "All" ||
                    report.status === statusFilter;

                const matchesPriority =
                    priorityFilter === "All" ||
                    getPriority(report) === priorityFilter;

                return (
                    matchesSearch &&
                    matchesStatus &&
                    matchesPriority
                );
            })
            .sort((a, b) => Number(b.id) - Number(a.id));
    }, [reports, search, statusFilter, priorityFilter]);

    // ===============================
    // STYLES
    // ===============================

    const styles = {
        page: {
            minHeight: "100vh",
            padding: "32px 5%",
            background: "#f5f8fc",
            color: "#0f172a",
            fontFamily: "Inter, Arial, sans-serif",
        },

        panel: {
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "18px",
            padding: "22px",
            boxShadow: "0 6px 25px rgba(15,23,42,0.04)",
        },

        stat: {
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "22px",
        },

        select: {
            padding: "10px 12px",
            borderRadius: "9px",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            color: "#0f172a",
            fontSize: "14px",
            maxWidth: "100%",
        },

        button: {
            padding: "10px 15px",
            border: "none",
            borderRadius: "9px",
            background: "#15803d",
            color: "#ffffff",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "7px",
            fontWeight: 600,
        },
    };

    // ===============================
    // STAT CARDS
    // ===============================


    const statCards = [
        {
            title: "Total Reports",
            value: stats.total,
            icon: MapPin,
            color: "#2563eb",
        },
        {
            title: "Open Reports",
            value: stats.open,
            icon: AlertTriangle,
            color: "#ef4444",
        },
        {
            title: "In Progress",
            value: stats.progress,
            icon: Clock3,
            color: "#f59e0b",
        },
        {
            title: "Completed Repairs",
            value: stats.completed,
            icon: CheckCircle2,
            color: "#16a34a",
        },
        {
            title: "Pending Repairs",
            value: stats.pending,
            icon: Clock3,
            color: "#d97706",
        },
        {
            title: "High Priority",
            value: stats.high,
            icon: AlertTriangle,
            color: "#dc2626",
        },
        {
            title: "AI Analyzed",
            value: stats.aiAnalyzed,
            icon: BrainCircuit,
            color: "#7c3aed",
        },
        {
            title: "Completion Rate",
            value: `${stats.completionRate}%`,
            icon: CheckCircle2,
            color: "#059669",
        },
    ];

    const repairStatCards = [
        { title: "Total Repair Teams", value: repairStats?.total_teams ?? "—", icon: MapPin, color: "#2563eb" },
        { title: "Available Teams", value: repairStats?.available_teams ?? "—", icon: CheckCircle2, color: "#16a34a" },
        { title: "Assigned Repairs", value: repairStats?.assigned_reports ?? "—", icon: Clock3, color: "#d97706" },
        { title: "Repair History Events", value: repairStats?.total_history_events ?? "—", icon: BrainCircuit, color: "#7c3aed" },
    ];

    // ===============================
    // DASHBOARD UI
    // ===============================

    return (
        <main style={styles.page}>

            {/* HEADER */}

            <header
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "16px",
                    marginBottom: "30px",
                }}
            >
                <div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            color: "#15803d",
                            fontWeight: 700,
                            marginBottom: "8px",
                        }}
                    >
                        <LayoutDashboard size={20} />
                        ROADGUARD AI ADMIN
                    </div>

                    <h1
                        style={{
                            margin: 0,
                            fontSize: "32px",
                        }}
                    >
                        Smart City Dashboard
                    </h1>

                    <p style={{ color: "#64748b" }}>
                        Monitor road damage, AI predictions and
                        maintenance progress.
                    </p>
                </div>

                {/* ADMIN CONTROLS */}

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "12px",
                    }}
                >
                    <span
                        style={{
                            color: "#64748b",
                            fontSize: "13px",
                        }}
                    >
                        Signed in: {adminUsername}
                    </span>

                    <button
                        style={styles.button}
                        onClick={() => refreshDashboard(true)}
                        disabled={refreshing}
                    >
                        <RefreshCw size={17} />

                        {refreshing
                            ? "Refreshing..."
                            : "Refresh"}
                    </button>

                    <button
                        type="button"
                        onClick={handleLogout}
                        style={{
                            ...styles.button,
                            background: "#dc2626",
                        }}
                    >
                        <LogOut size={17} />
                        Logout
                    </button>
                </div>
            </header>

            {/* ERROR MESSAGE */}

            {error && (
                <div
                    style={{
                        padding: "13px",
                        background: "#fee2e2",
                        color: "#991b1b",
                        borderRadius: "10px",
                        marginBottom: "15px",
                    }}
                >
                    {error}
                </div>
            )}

            {/* SUCCESS MESSAGE */}

            {success && (
                <div
                    style={{
                        padding: "13px",
                        background: "#dcfce7",
                        color: "#166534",
                        borderRadius: "10px",
                        marginBottom: "15px",
                    }}
                >
                    {success}
                </div>
            )}

            {/* STATISTICS */}

            <section
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: "16px",
                    marginBottom: "25px",
                }}
            >
                {statCards.map((card) => {
                    const Icon = card.icon;

                    return (
                        <div
                            key={card.title}
                            style={styles.stat}
                        >
                            <Icon
                                size={26}
                                color={card.color}
                            />

                            <h2
                                style={{
                                    fontSize: "30px",
                                    margin: "12px 0 5px",
                                }}
                            >
                                {card.value}
                            </h2>

                            <p
                                style={{
                                    margin: 0,
                                    color: "#64748b",
                                }}
                            >
                                {card.title}
                            </p>
                        </div>
                    );
                })}
            </section>

            {/* PHASE 26: LIVE REPAIR TEAM STATISTICS */}
            <section style={{ marginBottom: "25px" }}>
                <h2 style={{ marginBottom: "14px" }}>Live Repair Team Statistics</h2>
                {repairStatsError && (
                    <p role="alert" style={{ color: "#b91c1c" }}>{repairStatsError}</p>
                )}
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: "16px",
                }}>
                    {repairStatCards.map((card) => {
                        const Icon = card.icon;
                        return (
                            <div key={card.title} style={styles.stat}>
                                <Icon size={26} color={card.color} />
                                <h2 style={{ fontSize: "30px", margin: "12px 0 5px" }}>
                                    {card.value}
                                </h2>
                                <p style={{ margin: 0, color: "#64748b" }}>
                                    {card.title}
                                </p>
                            </div>
                        );
                    })}
                </div>
                <p style={{ fontSize: "12px", color: "#64748b", marginTop: "10px" }}>
                    Refreshes automatically every 30 seconds. Use Refresh for an immediate update.
                </p>
            </section>

            {/* ANALYTICS */}

            <section
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fit, minmax(min(100%, 350px), 1fr))",
                    gap: "20px",
                    marginBottom: "28px",
                }}
            >
                {/* STATUS PIE CHART */}

                <div style={styles.panel}>
                    <h3>Repair Status Analytics</h3>

                    <div
                        style={{
                            width: "100%",
                            height: 280,
                        }}
                    >
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={statusChartData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={95}
                                    label={({ name, value }) =>
                                        `${name}: ${value}`
                                    }
                                >
                                    {statusChartData.map((entry) => (
                                        <Cell
                                            key={entry.name}
                                            fill={
                                                STATUS_COLORS[entry.name]
                                            }
                                        />
                                    ))}
                                </Pie>

                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* PRIORITY BAR CHART */}

                <div style={styles.panel}>
                    <h3>Road Damage Priority</h3>

                    <div
                        style={{
                            width: "100%",
                            height: 280,
                        }}
                    >
                        <ResponsiveContainer>
                            <BarChart data={priorityChartData}>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                />

                                <XAxis dataKey="name" />

                                <YAxis allowDecimals={false} />

                                <Tooltip />

                                <Bar
                                    dataKey="value"
                                    name="Reports"
                                    radius={[7, 7, 0, 0]}
                                >
                                    {priorityChartData.map(
                                        (entry) => (
                                            <Cell
                                                key={entry.name}
                                                fill={
                                                    PRIORITY_COLORS[
                                                    entry.name
                                                    ]
                                                }
                                            />
                                        )
                                    )}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>

            {/* REPORT MANAGEMENT */}

            <section style={styles.panel}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "15px",
                        marginBottom: "20px",
                    }}
                >
                    <div>
                        <h2 style={{ margin: 0 }}>
                            Road Report Management
                        </h2>

                        <p style={{ color: "#64748b" }}>
                            Showing {filteredReports.length} of{" "}
                            {reports.length} reports
                        </p>
                    </div>

                    <Filter
                        size={23}
                        color="#64748b"
                    />
                </div>

                {/* SEARCH AND FILTERS */}

                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "12px",
                        marginBottom: "22px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            border: "1px solid #cbd5e1",
                            borderRadius: "9px",
                            padding: "0 12px",
                            flex: "1 1 220px",
                        }}
                    >
                        <Search
                            size={18}
                            color="#64748b"
                        />

                        <input
                            type="text"
                            placeholder="Search ID or description..."
                            value={search}
                            onChange={(e) =>
                                setSearch(e.target.value)
                            }
                            style={{
                                border: "none",
                                outline: "none",
                                padding: "12px 0",
                                width: "100%",
                                background: "transparent",
                                color: "#0f172a",
                            }}
                        />
                    </div>

                    <select
                        style={styles.select}
                        value={statusFilter}
                        onChange={(e) =>
                            setStatusFilter(e.target.value)
                        }
                    >
                        <option value="All">
                            All Status
                        </option>

                        <option value="Open">
                            Open
                        </option>

                        <option value="In Progress">
                            In Progress
                        </option>

                        <option value="Resolved">
                            Resolved
                        </option>
                        <option value="Completed">
                            Completed
                        </option>
                    </select>

                    <select
                        style={styles.select}
                        value={priorityFilter}
                        onChange={(e) =>
                            setPriorityFilter(e.target.value)
                        }
                    >
                        <option value="All">
                            All Priority
                        </option>

                        <option value="High">
                            High
                        </option>

                        <option value="Medium">
                            Medium
                        </option>

                        <option value="Low">
                            Low
                        </option>
                    </select>
                </div>

                {/* REPORT TABLE */}

                <div style={{ overflowX: "auto" }}>
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            minWidth: "850px",
                            textAlign: "left",
                        }}
                    >
                        <thead>
                            <tr
                                style={{
                                    background: "#f1f5f9",
                                }}
                            >
                                {[
                                    "ID",
                                    "Image",
                                    "Description",
                                    "Priority",
                                    "AI Prediction",
                                    "Confidence",
                                    "Repair Status",
                                    "Action",
                                ].map((heading) => (
                                    <th
                                        key={heading}
                                        style={{
                                            padding: "14px",
                                            fontSize: "13px",
                                        }}
                                    >
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {filteredReports.map((report) => {
                                const priority = getPriority(report);

                                return (
                                    <tr
                                        key={report.id}
                                        style={{
                                            borderBottom:
                                                "1px solid #e2e8f0",
                                        }}
                                    >
                                        {/* REPORT ID */}

                                        <td style={{ padding: "13px" }}>
                                            #{report.id}
                                        </td>

                                        {/* IMAGE */}

                                        <td style={{ padding: "13px" }}>
                                            {report.image_path ? (
                                                <img
                                                    src={getImageUrl(
                                                        report.image_path
                                                    )}
                                                    alt="Road damage"
                                                    style={{
                                                        width: "65px",
                                                        height: "50px",
                                                        objectFit: "cover",
                                                        borderRadius: "7px",
                                                    }}
                                                />
                                            ) : (
                                                "No image"
                                            )}
                                        </td>

                                        {/* DESCRIPTION */}

                                        <td
                                            style={{
                                                padding: "13px",
                                                maxWidth: "220px",
                                            }}
                                        >
                                            {report.description}
                                        </td>

                                        {/* PRIORITY */}

                                        <td style={{ padding: "13px" }}>
                                            <span
                                                style={{
                                                    color:
                                                        PRIORITY_COLORS[priority],
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {priority}
                                            </span>
                                        </td>

                                        {/* AI PREDICTION */}

                                        <td style={{ padding: "13px" }}>
                                            {report.ai_prediction ||
                                                "Pending"}
                                        </td>

                                        {/* AI CONFIDENCE */}

                                        <td style={{ padding: "13px" }}>
                                            {report.ai_confidence != null
                                                ? `${Number(
                                                    report.ai_confidence
                                                ).toFixed(2)}%`
                                                : "—"}
                                        </td>

                                        {/* STATUS UPDATE */}

                                        <td style={{ padding: "13px" }}>
                                            <select
                                                style={styles.select}
                                                value={report.status}
                                                disabled={
                                                    updatingId === report.id
                                                }
                                                onChange={(e) =>
                                                    updateStatus(
                                                        report.id,
                                                        e.target.value
                                                    )
                                                }
                                            >
                                                <option value="Open">
                                                    Open
                                                </option>

                                                <option value="In Progress">
                                                    In Progress
                                                </option>

                                                <option value="Resolved">
                                                    Resolved
                                                </option>
                                                <option value="Completed" disabled>
                                                    Completed
                                                </option>
                                            </select>
                                        </td>

                                        {/* VIEW DETAILS */}

                                        <td style={{ padding: "13px" }}>
                                            <button
                                                style={styles.button}
                                                onClick={() =>
                                                    setSelectedReport(report)
                                                }
                                            >
                                                <Eye size={16} />
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {loading && (
                        <p>Loading reports...</p>
                    )}

                    {!loading &&
                        filteredReports.length === 0 && (
                            <p style={{ padding: "20px" }}>
                                No matching reports found.
                            </p>
                        )}
                </div>
            </section>

            {/* REPORT DETAILS MODAL */}

            {selectedReport && (
                <div
                    onClick={() =>
                        setSelectedReport(null)
                    }
                    style={{
                        position: "fixed",
                        inset: 0,
                        background:
                            "rgba(15,23,42,0.65)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 9999,
                        padding: "20px",
                    }}
                >
                    <div
                        onClick={(e) =>
                            e.stopPropagation()
                        }
                        style={{
                            ...styles.panel,
                            width: "100%",
                            maxWidth: "520px",
                            maxHeight: "90vh",
                            overflowY: "auto",
                        }}
                    >
                        <h2>
                            Report #{selectedReport.id}
                        </h2>

                        {/* REPORT IMAGE */}

                        {selectedReport.image_path && (
                            <img
                                src={getImageUrl(
                                    selectedReport.image_path
                                )}
                                alt="Road damage"
                                style={{
                                    width: "100%",
                                    maxHeight: "280px",
                                    objectFit: "cover",
                                    borderRadius: "12px",
                                }}
                            />
                        )}

                        <p>
                            <strong>Description:</strong>{" "}
                            {selectedReport.description}
                        </p>

                        <p>
                            <strong>Status:</strong>{" "}
                            {selectedReport.status}
                        </p>

                        <p>
                            <strong>Priority:</strong>{" "}
                            {getPriority(selectedReport)}
                        </p>

                        <p>
                            <strong>Priority Score:</strong>{" "}
                            {selectedReport.priority_score ?? "—"}
                        </p>

                        <p>
                            <strong>AI Prediction:</strong>{" "}
                            {selectedReport.ai_prediction ||
                                "Not analyzed"}
                        </p>

                        <p>
                            <strong>AI Confidence:</strong>{" "}
                            {selectedReport.ai_confidence != null
                                ? `${Number(
                                    selectedReport.ai_confidence
                                ).toFixed(2)}%`
                                : "—"}
                        </p>

                        <p>
                            <strong>Coordinates:</strong>{" "}
                            {selectedReport.lat},{" "}
                            {selectedReport.lng}
                        </p>

                        <button
                            style={styles.button}
                            onClick={() =>
                                setSelectedReport(null)
                            }
                        >
                            Close Details
                        </button>
                    </div>
                </div>
            )}
            <RepairManagement reports={reports} onRepairUpdated={() => refreshDashboard()} />
        </main>
    );
}

export default AdminDashboard;
