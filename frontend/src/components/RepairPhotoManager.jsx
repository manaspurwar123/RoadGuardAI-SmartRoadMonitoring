import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function imageUrl(path) {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function request(path, options = {}) {
    const token = sessionStorage.getItem("roadguard_admin_token");
    if (!token) throw new Error("Admin login required. Please log in again.");
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = data.detail;
        throw new Error(typeof detail === "string" ? detail : `Request failed (${response.status})`);
    }
    return data;
}

const styles = {
    panel: { marginTop: 24, padding: 24, border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", color: "#0f172a" },
    control: { width: "100%", padding: 12, border: "1px solid #cbd5e1", borderRadius: 9, boxSizing: "border-box", background: "white", color: "#0f172a" },
    button: { padding: "12px 16px", background: "#15803d", color: "white", border: 0, borderRadius: 9, cursor: "pointer", fontWeight: 600 },
    photo: { width: "100%", height: 250, objectFit: "contain", background: "#f1f5f9", borderRadius: 10 },
};

export default function RepairPhotoManager({ reports = [], onUpdated }) {
    const [reportId, setReportId] = useState("");
    const [photo, setPhoto] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const report = reports.find((r) => String(r.id) === String(reportId));
    const beforeImage = imageUrl(report?.image_path);
    const afterImage = imageUrl(photo?.after_image);

    useEffect(() => {
        let active = true;
        setPhoto(null);
        setSelectedFile(null);
        setError("");
        setMessage("");
        if (!reportId) return () => { active = false; };
        setLoading(true);
        request(`/admin/repairs/photos/${reportId}`)
            .then((data) => { if (active) setPhoto(data); })
            .catch((err) => { if (active) setError(err.message); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [reportId]);

    async function upload(e) {
        e.preventDefault();
        if (!reportId || !selectedFile) return;
        if (!ALLOWED_TYPES.includes(selectedFile.type)) {
            setError("Choose a JPG, PNG, or WEBP image.");
            return;
        }
        if (selectedFile.size > MAX_BYTES) {
            setError("Image must be 5 MB or smaller.");
            return;
        }
        setBusy(true); setError(""); setMessage("");
        try {
            const form = new FormData();
            form.append("file", selectedFile);
            await request(`/admin/repairs/photos/${reportId}`, { method: "POST", body: form });
            const updated = await request(`/admin/repairs/photos/${reportId}`);
            setPhoto(updated);
            setSelectedFile(null);
            setMessage("After-repair photo uploaded. Verification is now pending.");
            if (onUpdated) await onUpdated(Number(reportId));
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    }

    async function verify() {
        if (!reportId || !photo?.after_image || photo?.verified) return;
        setBusy(true); setError(""); setMessage("");
        try {
            await request(`/admin/repairs/photos/${reportId}/verify`, { method: "PATCH" });
            const updated = await request(`/admin/repairs/photos/${reportId}`);
            setPhoto(updated);
            setMessage("Repair photo verified successfully.");
            if (onUpdated) await onUpdated(Number(reportId));
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    }

    return (
        <section style={styles.panel}>
            <h3 style={{ marginTop: 0 }}>Before / After Repair Photos</h3>
            <p style={{ color: "#64748b" }}>Upload completion evidence and verify it as an admin.</p>
            <label htmlFor="repair-photo-report">Road report</label>
            <select id="repair-photo-report" style={{ ...styles.control, marginTop: 8 }} value={reportId} onChange={(e) => setReportId(e.target.value)}>
                <option value="">Select road report</option>
                {reports.map((r) => <option key={r.id} value={r.id}>Report #{r.id} - {r.status}</option>)}
            </select>

            {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
            {message && <p role="status" style={{ color: "#15803d" }}>{message}</p>}
            {loading && <p>Loading repair photo...</p>}

            {reportId && !loading && (
                <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 16, marginTop: 20 }}>
                        <div>
                            <h4>Before Repair</h4>
                            {beforeImage ? <img src={beforeImage} alt={`Road damage for report ${reportId}`} style={styles.photo} /> : <p>No original image available.</p>}
                        </div>
                        <div>
                            <h4>After Repair</h4>
                            {afterImage ? <img key={afterImage} src={afterImage} alt={`Repair evidence for report ${reportId}`} style={styles.photo} /> : <p>No repair photo uploaded yet.</p>}
                        </div>
                    </div>

                    <p style={{ marginTop: 16 }}>
                        <strong>Verification: </strong>
                        {photo?.verified ? "Verified" : photo?.after_image ? "Pending verification" : "No photo submitted"}
                    </p>
                    <form onSubmit={upload} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
                        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Select after repair photo" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                        <button type="submit" style={styles.button} disabled={busy || !selectedFile}>{busy ? "Please wait..." : "Upload After Photo"}</button>
                    </form>
                    <p style={{ fontSize: 12, color: "#64748b" }}>JPG, PNG or WEBP, maximum 5 MB. Re-uploading resets verification.</p>
                    {photo?.after_image && !photo?.verified && (
                        <button type="button" style={{ ...styles.button, marginTop: 8, background: "#1d4ed8" }} onClick={verify} disabled={busy}>
                            {busy ? "Please wait..." : "Verify Repair Photo"}
                        </button>
                    )}
                    {photo?.verified_at && <p style={{ color: "#64748b", fontSize: 13 }}>Verified at: {photo.verified_at}</p>}
                </>
            )}
        </section>
    );
}
