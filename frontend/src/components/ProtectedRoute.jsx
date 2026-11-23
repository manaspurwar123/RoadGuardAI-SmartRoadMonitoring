
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;

export default function ProtectedRoute() {
    const [status, setStatus] = useState("checking");

    useEffect(() => {
        let active = true;

        async function verifyAdmin() {
            const token = sessionStorage.getItem(
                "roadguard_admin_token"
            );

            if (!token) {
                if (active) setStatus("unauthorized");
                return;
            }

            try {
                const response = await fetch(`${API_URL}/admin/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    throw new Error("Authentication failed");
                }

                if (active) setStatus("authorized");
            } catch {
                sessionStorage.removeItem("roadguard_admin_token");
                sessionStorage.removeItem("roadguard_admin_username");

                if (active) setStatus("unauthorized");
            }
        }

        verifyAdmin();

        return () => {
            active = false;
        };
    }, []);

    if (status === "checking") {
        return (
            <div
                style={{
                    minHeight: "80vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <h2>Verifying administrator access...</h2>
            </div>
        );
    }

    if (status === "unauthorized") {
        return <Navigate to="/admin/login" replace />;
    }

    return <Outlet />;
}
