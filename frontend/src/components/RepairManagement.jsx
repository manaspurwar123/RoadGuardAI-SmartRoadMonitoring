import RepairPhotoManager from "./RepairPhotoManager";
import { useEffect, useState } from "react";
import {
    Users,
    Plus,
    ClipboardList,
    History,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    X,
    Zap,
} from "lucide-react";

const API_URL = "http://127.0.0.1:8001";

export default function RepairManagement({ reports = [], onRepairUpdated }) {
    const [teams, setTeams] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [history, setHistory] = useState([]);

    const [teamName, setTeamName] = useState("");
    const [contact, setContact] = useState("");
    const [reportId, setReportId] = useState("");
    const [teamId, setTeamId] = useState("");

    const [historyReportId, setHistoryReportId] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // PHASE 28: Priority queue uses the existing dashboard scoring rules.
    const pendingQueue = reports
        .filter((r) => !["completed", "resolved"].includes(String(r.status || "").toLowerCase()))
        .map((r) => {
            const rawScore = Number(r.priority_score);
            const hasScore = r.priority_score !== null && r.priority_score !== undefined && Number.isFinite(rawScore);
            const score = hasScore ? rawScore : 50;
            const declared = String(r.priority_level || "").toLowerCase();
            const level = ["high", "medium", "low"].includes(declared)
                ? declared[0].toUpperCase() + declared.slice(1)
                : score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";
            return { ...r, queueScore: score, queueLevel: level, hasScore };
        })
        .sort((a, b) => {
            const rank = { High: 3, Medium: 2, Low: 1 };
            return (rank[b.queueLevel] - rank[a.queueLevel]) ||
                (b.queueScore - a.queueScore) || (Number(a.id) - Number(b.id));
        });

    // Phase 28.1: separate active reports by assignment state.
    const assignmentByReport = new Map(assignments.map((a) => [String(a.report_id), a]));
    const unassignedQueue = pendingQueue.filter((r) => !assignmentByReport.has(String(r.id)));
    const assignedQueue = pendingQueue.filter((r) => assignmentByReport.has(String(r.id)));
    const completedCount = reports.filter((r) =>
        ["completed", "resolved"].includes(String(r.status || "").toLowerCase())
    ).length;

    const teamWorkload = assignments.reduce((counts, assignment) => {
        const id = Number(assignment.team_id);
        counts[id] = (counts[id] || 0) + 1;
        return counts;
    }, {});

    const recommendedTeam = teams
        .filter((team) => Boolean(team.available))
        .sort((a, b) => (teamWorkload[a.id] || 0) - (teamWorkload[b.id] || 0) || a.id - b.id)[0];

    async function assignRecommended(report) {
        if (!recommendedTeam || saving) return;
        setSaving(true);
        setError("");
        setMessage("");
        try {
            await apiRequest("/admin/repairs/assign", {
                method: "POST",
                body: JSON.stringify({
                    report_id: Number(report.id),
                    team_id: Number(recommendedTeam.id),
                }),
            });
            await loadData();
            setMessage(`Report #${report.id} assigned to ${recommendedTeam.name}.`);
            onRepairUpdated?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    // =========================================
    // AUTHENTICATED API REQUEST
    // =========================================

    async function apiRequest(path, options = {}) {
        const token = sessionStorage.getItem(
            "roadguard_admin_token"
        );

        if (!token) {
            throw new Error(
                "Admin session missing. Please login again."
            );
        }

        let response;

        try {
            response = await fetch(`${API_URL}${path}`, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    ...options.headers,
                },
            });
        } catch (networkError) {
            console.error(
                `Repair API network error (${path}):`,
                networkError
            );

            throw new Error(
                `Cannot connect to ${path}. Check backend port 8001 or CORS.`
            );
        }

        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            throw new Error(
                "Admin session expired. Please logout and login again."
            );
        }

        if (response.status === 403) {
            throw new Error(
                "You do not have permission for this action."
            );
        }

        if (!response.ok) {
            const detail = data.detail;

            throw new Error(
                typeof detail === "string"
                    ? detail
                    : `Request failed (${response.status}) at ${path}`
            );
        }

        return data;
    }

    // =========================================
    // LOAD TEAMS AND ASSIGNMENTS
    // =========================================

    async function loadData() {
        setLoading(true);
        setError("");

        const results = await Promise.allSettled([
            apiRequest("/admin/repairs/teams"),
            apiRequest("/admin/repairs/assignments"),
        ]);

        const [teamsResult, assignmentsResult] = results;
        const errors = [];

        if (teamsResult.status === "fulfilled") {
            setTeams(
                Array.isArray(teamsResult.value)
                    ? teamsResult.value
                    : []
            );
        } else {
            errors.push(
                `Teams: ${teamsResult.reason.message}`
            );
        }

        if (assignmentsResult.status === "fulfilled") {
            setAssignments(
                Array.isArray(assignmentsResult.value)
                    ? assignmentsResult.value
                    : []
            );
        } else {
            errors.push(
                `Assignments: ${assignmentsResult.reason.message}`
            );
        }

        if (errors.length > 0) {
            setError(errors.join(" | "));
        }

        setLoading(false);
    }

    useEffect(() => {
        loadData();
    }, []);

    // =========================================
    // CREATE REPAIR TEAM
    // =========================================

    async function createTeam(e) {
        e.preventDefault();

        if (teamName.trim().length < 2) {
            setError("Team name must contain at least 2 characters.");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        try {
            await apiRequest("/admin/repairs/teams", {
                method: "POST",
                body: JSON.stringify({
                    name: teamName.trim(),
                    contact: contact.trim(),
                }),
            });

            setTeamName("");
            setContact("");

            await loadData();

            setMessage("Repair team created successfully!");
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    // =========================================
    // ASSIGN REPAIR TEAM
    // =========================================

    async function assignTeam(e) {
        e.preventDefault();

        if (!reportId || !teamId) {
            setError("Please select both a report and a repair team.");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        try {
            await apiRequest("/admin/repairs/assign", {
                method: "POST",
                body: JSON.stringify({
                    report_id: Number(reportId),
                    team_id: Number(teamId),
                }),
            });

            setReportId("");
            setTeamId("");

            await loadData();

            setMessage("Repair team assigned successfully!");
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    // =========================================
    // VIEW REPAIR HISTORY
    // =========================================

    async function viewHistory(id) {
        setError("");
        setHistory([]);
        setHistoryReportId(String(id));

        try {
            const data = await apiRequest(
                `/admin/repairs/history/${id}`
            );

            setHistory(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message);
        }
    }

    // =========================================
    // STYLES
    // =========================================

    const styles = {
        section: {
            marginTop: "32px",
            color: "#0f172a",
        },

        panel: {
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "24px",
            boxShadow: "0 4px 20px rgba(15,23,42,0.03)",
        },

        input: {
            width: "100%",
            padding: "13px 14px",
            border: "1px solid #cbd5e1",
            borderRadius: "9px",
            background: "#ffffff",
            color: "#0f172a",
            fontSize: "14px",
            boxSizing: "border-box",
        },

        button: {
            background: "#15803d",
            color: "#ffffff",
            border: "none",
            borderRadius: "9px",
            padding: "12px 18px",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
        },

        th: {
            padding: "14px",
            textAlign: "left",
            background: "#f1f5f9",
            fontSize: "13px",
        },

        td: {
            padding: "14px",
            borderBottom: "1px solid #e2e8f0",
            fontSize: "14px",
        },
    };

    // =========================================
    // UI
    // =========================================

    return (
        <section style={styles.section}>
            {/* HEADER */}

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "16px",
                    marginBottom: "22px",
                }}
            >
                <div>
                    <h2 style={{ marginBottom: "8px" }}>
                        Repair Management System
                    </h2>

                    <p style={{ color: "#64748b" }}>
                        Manage repair teams, assignments and maintenance history.
                    </p>
                </div>

                <button
                    type="button"
                    style={styles.button}
                    onClick={loadData}
                    disabled={loading || saving}
                >
                    <RefreshCw size={17} />
                    {loading ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            {/* ERROR MESSAGE */}

            {error && (
                <div
                    role="alert"
                    style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                        background: "#fee2e2",
                        color: "#991b1b",
                        padding: "14px",
                        borderRadius: "10px",
                        marginBottom: "18px",
                        overflowWrap: "anywhere",
                    }}
                >
                    <AlertCircle size={20} />
                    <span>{error}</span>
                </div>
            )}

            {/* SUCCESS MESSAGE */}

            {message && (
                <div
                    role="status"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        background: "#dcfce7",
                        color: "#166534",
                        padding: "14px",
                        borderRadius: "10px",
                        marginBottom: "18px",
                    }}
                >
                    <CheckCircle2 size={20} />
                    {message}
                </div>
            )}

            {/* PHASE 28.1: SMART REPAIR PRIORITY QUEUE */}
            <div style={{ ...styles.panel, marginBottom: 22 }}>
                <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    <Zap size={21} /> Smart Repair Management
                </h3>
                <p style={{ color: "#64748b", fontSize: 13 }}>
                    Active reports are sorted by existing priority level and score.
                    Team suggestions use the fewest current assignments, not an AI prediction.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "18px 0 24px" }}>
                    {[
                        ["Unassigned", unassignedQueue.length],
                        ["Assigned", assignedQueue.length],
                        ["Completed", completedCount],
                    ].map(([label, count]) => (
                        <div key={label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
                            <div style={{ color: "#64748b", fontSize: 13 }}>{label}</div>
                            <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>{count}</div>
                        </div>
                    ))}
                </div>
                <p style={{ color: "#334155", fontSize: 14 }}>
                    <strong>Recommended available team:</strong>{" "}
                    {recommendedTeam
                        ? `${recommendedTeam.name} (${teamWorkload[recommendedTeam.id] || 0} assigned reports)`
                        : "No available team. Create a team or update availability."}
                </p>
                <h4 style={{ margin: "26px 0 10px" }}>Unassigned Repair Queue</h4>
                {unassignedQueue.length === 0 ? (
                    <p style={{ color: "#64748b" }}>No unassigned active reports. All current active reports have repair teams.</p>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse" }}>
                            <thead><tr>
                                <th style={styles.th}>Report</th><th style={styles.th}>Priority</th>
                                <th style={styles.th}>Score</th><th style={styles.th}>Status</th>
                                <th style={styles.th}>Action</th>
                            </tr></thead>
                            <tbody>
                                {unassignedQueue.map((report) => (
                                    <tr key={report.id}>
                                        <td style={styles.td}>#{report.id}</td>
                                        <td style={{ ...styles.td, fontWeight: 700, color: report.queueLevel === "High" ? "#dc2626" : report.queueLevel === "Medium" ? "#b45309" : "#15803d" }}>{report.queueLevel}</td>
                                        <td style={styles.td}>{report.hasScore ? report.queueScore : "—"}</td>
                                        <td style={styles.td}>{report.status || "Open"}</td>
                                        <td style={styles.td}>
                                            <button type="button" style={{ ...styles.button, opacity: !recommendedTeam || saving ? 0.55 : 1 }} disabled={!recommendedTeam || saving} onClick={() => assignRecommended(report)}>
                                                Assign Suggested Team
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <h4 style={{ margin: "28px 0 10px" }}>Assigned Repairs</h4>
                {assignedQueue.length === 0 ? (
                    <p style={{ color: "#64748b" }}>No active assigned repairs.</p>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
                            <thead><tr>
                                <th style={styles.th}>Report</th><th style={styles.th}>Priority</th>
                                <th style={styles.th}>Score</th><th style={styles.th}>Status</th>
                                <th style={styles.th}>Assigned Team</th><th style={styles.th}>Action</th>
                            </tr></thead>
                            <tbody>
                                {assignedQueue.map((report) => {
                                    const assignment = assignmentByReport.get(String(report.id));
                                    const alreadyRecommended = Number(assignment?.team_id) === Number(recommendedTeam?.id);
                                    return (
                                        <tr key={report.id}>
                                            <td style={styles.td}>#{report.id}</td>
                                            <td style={{ ...styles.td, fontWeight: 700, color: report.queueLevel === "High" ? "#dc2626" : report.queueLevel === "Medium" ? "#b45309" : "#15803d" }}>{report.queueLevel}</td>
                                            <td style={styles.td}>{report.hasScore ? report.queueScore : "—"}</td>
                                            <td style={styles.td}>{report.status || "Open"}</td>
                                            <td style={styles.td}>{assignment?.team_name || "Unknown"}</td>
                                            <td style={styles.td}>
                                                <button type="button" style={{ ...styles.button, opacity: !recommendedTeam || saving || alreadyRecommended ? 0.55 : 1 }} disabled={!recommendedTeam || saving || alreadyRecommended} onClick={() => assignRecommended(report)}>
                                                    {alreadyRecommended ? "Already Recommended Team" : "Reassign Suggested Team"}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* TEAM AND ASSIGNMENT FORMS */}

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                    gap: "20px",
                }}
            >
                {/* CREATE TEAM */}

                <div style={styles.panel}>
                    <h3
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            marginTop: 0,
                        }}
                    >
                        <Users size={21} />
                        Create Repair Team
                    </h3>

                    <form
                        onSubmit={createTeam}
                        style={{
                            display: "grid",
                            gap: "13px",
                        }}
                    >
                        <input
                            style={styles.input}
                            type="text"
                            placeholder="Enter team name"
                            value={teamName}
                            onChange={(e) =>
                                setTeamName(e.target.value)
                            }
                            minLength={2}
                            maxLength={100}
                            required
                        />

                        <input
                            style={styles.input}
                            type="text"
                            placeholder="Contact number or email"
                            value={contact}
                            onChange={(e) =>
                                setContact(e.target.value)
                            }
                        />

                        <button
                            type="submit"
                            style={styles.button}
                            disabled={saving}
                        >
                            <Plus size={18} />
                            {saving ? "Please wait..." : "Create Team"}
                        </button>
                    </form>

                    {/* EXISTING TEAMS */}

                    <div style={{ marginTop: "24px" }}>
                        <h4>Repair Teams ({teams.filter((team) => Boolean(team.available)).length} available / {teams.length} total)</h4>

                        {teams.length === 0 ? (
                            <p style={{ color: "#64748b" }}>
                                No repair teams available.
                            </p>
                        ) : (
                            teams.map((team) => (
                                <div
                                    key={team.id}
                                    style={{
                                        padding: "10px 0",
                                        borderBottom: "1px solid #e2e8f0",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: "12px",
                                    }}
                                >
                                    <div>
                                        <strong>{team.name}</strong>

                                        <p
                                            style={{
                                                color: "#64748b",
                                                fontSize: "12px",
                                                margin: "5px 0 0",
                                            }}
                                        >
                                            {team.contact || "No contact"}
                                        </p>
                                    </div>

                                    <span
                                        style={{
                                            fontSize: "12px",
                                            color: team.available
                                                ? "#15803d"
                                                : "#dc2626",
                                        }}
                                    >
                                        {team.available
                                            ? "Available"
                                            : "Unavailable"}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ASSIGN TEAM */}

                <div style={styles.panel}>
                    <h3
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            marginTop: 0,
                        }}
                    >
                        <ClipboardList size={21} />
                        Assign Repair Team
                    </h3>

                    <form
                        onSubmit={assignTeam}
                        style={{
                            display: "grid",
                            gap: "13px",
                        }}
                    >
                        <select
                            style={styles.input}
                            value={reportId}
                            onChange={(e) =>
                                setReportId(e.target.value)
                            }
                            required
                        >
                            <option value="">
                                Select road report
                            </option>

                            {reports.map((report) => (
                                <option
                                    key={report.id}
                                    value={report.id}
                                >
                                    Report #{report.id} — {report.status}
                                </option>
                            ))}
                        </select>

                        <select
                            style={styles.input}
                            value={teamId}
                            onChange={(e) =>
                                setTeamId(e.target.value)
                            }
                            required
                        >
                            <option value="">
                                Select repair team
                            </option>

                            {teams
                                .filter((team) => Boolean(team.available))
                                .map((team) => (
                                    <option
                                        key={team.id}
                                        value={team.id}
                                    >
                                        {team.name}
                                    </option>
                                ))}
                        </select>

                        <button
                            type="submit"
                            style={styles.button}
                            disabled={saving}
                        >
                            <ClipboardList size={17} />
                            {saving ? "Assigning..." : "Assign Team"}
                        </button>
                    </form>

                    <p
                        style={{
                            color: "#64748b",
                            fontSize: "13px",
                            marginTop: "18px",
                        }}
                    >
                        You can reassign an existing report to a different
                        repair team.
                    </p>
                </div>
            </div>

            {/* CURRENT ASSIGNMENTS */}

            <div
                style={{
                    ...styles.panel,
                    marginTop: "22px",
                }}
            >
                <h3 style={{ marginTop: 0 }}>
                    Current Repair Assignments
                </h3>

                <p style={{ color: "#64748b" }}>
                    Total assigned reports: {assignments.length}
                </p>

                {assignments.length === 0 ? (
                    <p>No repair assignments yet.</p>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                minWidth: "600px",
                            }}
                        >
                            <thead>
                                <tr>
                                    <th style={styles.th}>Report ID</th>
                                    <th style={styles.th}>Repair Team</th>
                                    <th style={styles.th}>Assigned At</th>
                                    <th style={styles.th}>Action</th>
                                </tr>
                            </thead>

                            <tbody>
                                {assignments.map((assignment) => (
                                    <tr key={assignment.id}>
                                        <td style={styles.td}>
                                            #{assignment.report_id}
                                        </td>

                                        <td style={styles.td}>
                                            {assignment.team_name}
                                        </td>

                                        <td style={styles.td}>
                                            {assignment.assigned_at}
                                        </td>

                                        <td style={styles.td}>
                                            <button
                                                type="button"
                                                style={styles.button}
                                                onClick={() =>
                                                    viewHistory(assignment.report_id)
                                                }
                                            >
                                                <History size={16} />
                                                View History
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* REPAIR HISTORY */}

            {historyReportId && (
                <div
                    style={{
                        ...styles.panel,
                        marginTop: "22px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "12px",
                        }}
                    >
                        <h3>
                            Repair History — Report #{historyReportId}
                        </h3>

                        <button
                            type="button"
                            onClick={() => {
                                setHistoryReportId("");
                                setHistory([]);
                            }}
                            style={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                            }}
                            aria-label="Close history"
                        >
                            <X size={22} />
                        </button>
                    </div>

                    {history.length === 0 ? (
                        <p>No repair history available.</p>
                    ) : (
                        history.map((item) => (
                            <div
                                key={item.id}
                                style={{
                                    padding: "14px",
                                    borderLeft: "3px solid #15803d",
                                    background: "#f8fafc",
                                    marginBottom: "12px",
                                    borderRadius: "8px",
                                }}
                            >
                                <strong>{item.action}</strong>

                                <p style={{ margin: "8px 0" }}>
                                    {item.details}
                                </p>

                                <small style={{ color: "#64748b" }}>
                                    {item.created_at}
                                </small>
                            </div>
                        ))
                    )}
                </div>
            )}
            <RepairPhotoManager
                reports={reports}
                onUpdated={async (id) => {
                    await viewHistory(id);
                    onRepairUpdated?.();
                }}
            />
        </section>
    );
}
