
import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import "./AdminLogin.css";

const API_URL = import.meta.env.VITE_API_URL;

export default function AdminLogin() {
    const navigate = useNavigate();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const token = sessionStorage.getItem("roadguard_admin_token");

    if (token) {
        return <Navigate to="/admin" replace />;
    }

    async function handleLogin(e) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await fetch(`${API_URL}/admin/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username: username.trim(),
                    password,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || "Login failed");
            }

            if (!data.access_token) {
                throw new Error("No access token received");
            }

            sessionStorage.setItem(
                "roadguard_admin_token",
                data.access_token
            );

            sessionStorage.setItem(
                "roadguard_admin_username",
                data.username
            );

            navigate("/admin", { replace: true });
        } catch (err) {
            setError(err.message || "Unable to connect to server");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="rg-login-page">
            <div className="rg-login-card">
                <div className="rg-login-logo">ðŸ›£ï¸</div>

                <h1>RoadGuard AI</h1>
                <p className="rg-login-subtitle">
                    Secure Administrator Portal
                </p>

                <div className="rg-login-divider" />

                <h2>Welcome Back</h2>
                <p className="rg-login-description">
                    Sign in to manage road damage reports
                </p>

                {error && (
                    <div className="rg-login-error">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin}>
                    <label htmlFor="admin-username">Username</label>

                    <input
                        id="admin-username"
                        type="text"
                        placeholder="Enter admin username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        required
                    />

                    <label htmlFor="admin-password">Password</label>

                    <div className="rg-password-field">
                        <input
                            id="admin-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />

                        <button
                            type="button"
                            className="rg-password-toggle"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={
                                showPassword ? "Hide password" : "Show password"
                            }
                        >
                            {showPassword ? "Hide" : "Show"}
                        </button>
                    </div>

                    <button
                        type="submit"
                        className="rg-login-submit"
                        disabled={loading}
                    >
                        {loading ? "Signing in..." : "Login to Dashboard"}
                    </button>
                </form>

                <p className="rg-login-footer">
                    ðŸ”’ Authorized administrators only
                </p>
            </div>
        </div>
    );
}
