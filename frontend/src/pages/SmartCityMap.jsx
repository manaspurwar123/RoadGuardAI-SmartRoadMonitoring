
import { useEffect, useState, useRef, useCallback } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    useMap,
    useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
    MapPin,
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Eye,
    Pencil,
    X,
    LoaderCircle,
    Navigation,
    Search,
    Upload,
    Image as ImageIcon,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;
const defaultCenter = [22.7196, 75.8577];

const statusColors = {
    Open: "#ef4444",
    "In Progress": "#f59e0b",
    Resolved: "#16a34a",
};

const severityScores = {
    Low: 20,
    Medium: 50,
    High: 80,
};

const trafficScores = {
    Low: 20,
    Medium: 50,
    High: 100,
};

function calculateScore(severity, traffic) {
    return Math.round(
        (severityScores[severity] ?? 50) * 0.6 +
        (trafficScores[traffic] ?? 50) * 0.4
    );
}

function getPriorityLevel(score) {
    if (score >= 70) return "High";
    if (score >= 40) return "Medium";
    return "Low";
}

function getReportScore(report) {
    const score = Number(report.priority_score);

    if (Number.isFinite(score)) {
        return score;
    }

    return calculateScore(
        report.severity || "Medium",
        report.traffic_importance || "Medium"
    );
}

function getReportPriority(report) {
    return (
        report.priority_level ||
        getPriorityLevel(getReportScore(report))
    );
}

function getImageUrl(path) {
    if (!path) return "";

    if (path.startsWith("http")) {
        return path;
    }

    return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

// ==========================================
// LEAFLET MARKER CONFIGURATION
// ==========================================

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function getStatusIcon(status) {
    const color = statusColors[status] || "#64748b";

    return L.divIcon({
        className: "road-status-marker",
        html: `<span style="background-color:${color};"></span>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
    });
}

// ==========================================
// MAP LOCATION PICKER
// ==========================================

function LocationPicker({ onSelect, disabled }) {
    useMapEvents({
        click(event) {
            if (!disabled) {
                onSelect({
                    lat: event.latlng.lat,
                    lng: event.latlng.lng,
                });
            }
        },
    });

    return null;
}

// ==========================================
// MAP ZOOM CONTROLLER
// ==========================================

function MapController({
    focusLocation,
    onFocusComplete,
}) {
    const map = useMap();

    useEffect(() => {
        if (!focusLocation) return;

        const handleMoveEnd = () => {
            if (focusLocation.reportId != null) {
                onFocusComplete(focusLocation.reportId);
            }
        };

        map.once("moveend", handleMoveEnd);

        map.flyTo(
            [focusLocation.lat, focusLocation.lng],
            16,
            {
                animate: true,
                duration: 1.5,
            }
        );

        return () => {
            map.off("moveend", handleMoveEnd);
        };
    }, [focusLocation, map, onFocusComplete]);

    return null;
}

// ==========================================
// MAIN SMART CITY MAP COMPONENT
// ==========================================

function SmartCityMap() {
    // REPORT STATES

    const [reports, setReports] = useState([]);
    const [selectedLocation, setSelectedLocation] =
        useState(null);

    const [description, setDescription] = useState("");
    const [severity, setSeverity] = useState("Medium");

    const [trafficImportance, setTrafficImportance] =
        useState("Medium");

    const [editingReportId, setEditingReportId] =
        useState(null);

    // IMAGE STATES

    const [roadImage, setRoadImage] = useState(null);
    const [imagePreview, setImagePreview] = useState("");

    // LOADING STATES

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [updatingId, setUpdatingId] = useState(null);

    const [locationLoading, setLocationLoading] =
        useState(false);

    const [locationAccuracy, setLocationAccuracy] =
        useState(null);

    // LOCATION SEARCH

    const [searchLocation, setSearchLocation] =
        useState("");

    const [searchLoading, setSearchLoading] =
        useState(false);

    const [locationSuggestions, setLocationSuggestions] =
        useState([]);

    const [showSuggestions, setShowSuggestions] =
        useState(false);

    const [selectedSuggestion, setSelectedSuggestion] =
        useState(null);

    // MESSAGES

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // MAP

    const [focusLocation, setFocusLocation] =
        useState(null);

    const markerRefs = useRef({});
    const formRef = useRef(null);
    const mapPanelRef = useRef(null);
    const imageInputRef = useRef(null);

    const editingRef = useRef(false);
    const locationRequestRef = useRef(0);

    const autoLocationRequestedRef = useRef(false);

    // PRIORITY

    const livePriorityScore = calculateScore(
        severity,
        trafficImportance
    );

    const livePriorityLevel =
        getPriorityLevel(livePriorityScore);

    // ==========================================
    // SELECT MAP LOCATION
    // ==========================================

    function selectMapLocation(location) {
        if (editingRef.current) return;

        locationRequestRef.current += 1;

        setLocationLoading(false);
        setSelectedLocation(location);
        setLocationAccuracy(null);
        setError("");
    }

    // ==========================================
    // GPS LIVE LOCATION
    // ==========================================

    const getLiveLocation = useCallback(
        (showMessage = true) => {
            if (editingRef.current) return;

            if (!navigator.geolocation) {
                if (showMessage) {
                    setError(
                        "Your browser does not support geolocation."
                    );
                }

                return;
            }

            const requestId =
                ++locationRequestRef.current;

            setLocationLoading(true);

            if (showMessage) {
                setError("");
                setSuccess("");
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    if (
                        requestId !== locationRequestRef.current ||
                        editingRef.current
                    ) {
                        return;
                    }

                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;

                    setSelectedLocation({ lat, lng });

                    setLocationAccuracy(
                        position.coords.accuracy
                    );

                    setFocusLocation({
                        lat,
                        lng,
                        reportId: null,
                        requestId: Date.now(),
                    });

                    setLocationLoading(false);

                    if (showMessage) {
                        setSuccess(
                            "Current location detected successfully!"
                        );
                    }
                },

                (geoError) => {
                    if (
                        requestId !== locationRequestRef.current
                    ) {
                        return;
                    }

                    setLocationLoading(false);

                    if (!showMessage) {
                        console.log(
                            "Automatic location unavailable:",
                            geoError.message
                        );

                        return;
                    }

                    if (geoError.code === 1) {
                        setError(
                            "Location permission denied. Allow location access."
                        );
                    } else if (geoError.code === 2) {
                        setError(
                            "Location unavailable. Search or select a location."
                        );
                    } else {
                        setError(
                            "Location request timed out."
                        );
                    }
                },

                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0,
                }
            );
        },
        []
    );

    useEffect(() => {
        if (autoLocationRequestedRef.current) return;

        autoLocationRequestedRef.current = true;

        getLiveLocation(false);
    }, [getLiveLocation]);

    // ==========================================
    // LOCATION AUTOCOMPLETE
    // ==========================================

    useEffect(() => {
        const query = searchLocation.trim();

        if (
            query.length < 3 ||
            editingReportId !== null ||
            selectedSuggestion?.name === query
        ) {
            setLocationSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        const controller = new AbortController();

        const timer = setTimeout(async () => {
            setSearchLoading(true);

            try {
                const url =
                    "https://photon.komoot.io/api/?" +
                    new URLSearchParams({
                        q: query,
                        limit: "5",
                        lang: "en",
                    });

                const response = await fetch(url, {
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(
                        "Location suggestions unavailable"
                    );
                }

                const data = await response.json();

                const suggestions = (
                    data.features || []
                ).map((feature, index) => {
                    const p = feature.properties || {};

                    const name = [
                        p.name,
                        p.street,
                        p.city,
                        p.state,
                        p.country,
                    ]
                        .filter(Boolean)
                        .filter(
                            (value, i, arr) =>
                                arr.indexOf(value) === i
                        )
                        .join(", ");

                    return {
                        id: `${p.osm_id || index}-${index}`,
                        name,
                        lat: feature.geometry.coordinates[1],
                        lng: feature.geometry.coordinates[0],
                    };
                });

                setLocationSuggestions(suggestions);
                setShowSuggestions(true);
            } catch (err) {
                if (err.name !== "AbortError") {
                    console.error(
                        "Autocomplete error:",
                        err
                    );

                    setLocationSuggestions([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setSearchLoading(false);
                }
            }
        }, 600);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [
        searchLocation,
        editingReportId,
        selectedSuggestion,
    ]);

    // ==========================================
    // SEARCH LOCATION
    // ==========================================

    async function handleLocationSearch(event) {
        event.preventDefault();

        if (editingRef.current) return;

        const query = searchLocation.trim();

        if (!query) {
            setError("Please enter a location name.");
            return;
        }

        locationRequestRef.current += 1;

        setLocationLoading(false);
        setSearchLoading(true);
        setError("");
        setSuccess("");

        try {
            const url =
                "https://nominatim.openstreetmap.org/search" +
                "?format=json&limit=5&addressdetails=1&q=" +
                encodeURIComponent(query);

            const response = await fetch(url, {
                headers: {
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(
                    "Location search failed."
                );
            }

            const data = await response.json();

            if (
                !Array.isArray(data) ||
                data.length === 0
            ) {
                throw new Error(
                    "Location not found. Try a road, city or landmark."
                );
            }

            const result = data[0];

            const lat = Number(result.lat);
            const lng = Number(result.lon);

            if (
                !Number.isFinite(lat) ||
                !Number.isFinite(lng)
            ) {
                throw new Error(
                    "Invalid location coordinates."
                );
            }

            setSelectedLocation({ lat, lng });
            setLocationAccuracy(null);

            setFocusLocation({
                lat,
                lng,
                reportId: null,
                requestId: Date.now(),
            });

            setSuccess(
                `Location found: ${result.display_name}`
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setSearchLoading(false);
        }
    }

    // ==========================================
    // SELECT AUTOCOMPLETE SUGGESTION
    // ==========================================

    function selectLocationSuggestion(place) {
        if (editingRef.current) return;

        locationRequestRef.current += 1;

        setLocationLoading(false);

        setSelectedLocation({
            lat: place.lat,
            lng: place.lng,
        });

        setLocationAccuracy(null);

        setFocusLocation({
            lat: place.lat,
            lng: place.lng,
            reportId: null,
            requestId: Date.now(),
        });

        setSearchLocation(place.name);
        setSelectedSuggestion(place);

        setLocationSuggestions([]);
        setShowSuggestions(false);

        setError("");

        setSuccess(
            `Location selected: ${place.name}. Drag the marker to the exact road.`
        );
    }

    function clearLocationSearch() {
        setSearchLocation("");
        setSelectedSuggestion(null);
        setLocationSuggestions([]);
        setShowSuggestions(false);
        setSearchLoading(false);
    }

    // ==========================================
    // DRAG MAP MARKER
    // ==========================================

    function handleMarkerDrag(event) {
        if (editingRef.current) return;

        const position =
            event.target.getLatLng();

        setSelectedLocation({
            lat: position.lat,
            lng: position.lng,
        });

        setLocationAccuracy(null);
        setError("");

        setSuccess(
            "Road location updated using marker."
        );
    }

    // ==========================================
    // FETCH ALL REPORTS
    // ==========================================

    const fetchReports = useCallback(async () => {
        try {
            const response = await fetch(
                `${API_URL}/reports`
            );

            if (!response.ok) {
                throw new Error(
                    "Unable to load road reports."
                );
            }

            const data = await response.json();

            setReports(
                Array.isArray(data) ? data : []
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    // ==========================================
    // IMAGE UPLOAD VALIDATION
    // ==========================================

    function handleImageChange(event) {
        const file = event.target.files?.[0];

        if (!file) return;

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
        ];

        if (!allowedTypes.includes(file.type)) {
            setError(
                "Only JPG, PNG and WebP images are allowed."
            );

            event.target.value = "";
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setError(
                "Image must be smaller than 10 MB."
            );

            event.target.value = "";
            return;
        }

        setRoadImage(file);
        setImagePreview(
            URL.createObjectURL(file)
        );

        setError("");
    }

    function removeImage() {
        setRoadImage(null);
        setImagePreview("");

        if (imageInputRef.current) {
            imageInputRef.current.value = "";
        }
    }

    useEffect(() => {
        return () => {
            if (imagePreview) {
                URL.revokeObjectURL(imagePreview);
            }
        };
    }, [imagePreview]);

    // ==========================================
    // AI IMAGE ANALYSIS
    // ==========================================

    async function analyzeReportImage(
        reportId,
        file
    ) {
        const formData = new FormData();

        formData.append("file", file);

        const response = await fetch(
            `${API_URL}/reports/${reportId}/analyze`,
            {
                method: "POST",
                body: formData,
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                typeof data.detail === "string"
                    ? data.detail
                    : "AI image analysis failed."
            );
        }

        return data.report;
    }

    // ==========================================
    // RESET REPORT FORM
    // ==========================================

    function resetForm() {
        editingRef.current = false;

        setEditingReportId(null);
        setSelectedLocation(null);
        setLocationAccuracy(null);

        setDescription("");
        setSeverity("Medium");
        setTrafficImportance("Medium");

        removeImage();
    }

    // ==========================================
    // EDIT EXISTING REPORT
    // ==========================================

    function startEditing(report) {
        locationRequestRef.current += 1;

        editingRef.current = true;

        setLocationLoading(false);
        setEditingReportId(report.id);

        setDescription(
            report.description || ""
        );

        setSeverity(
            report.severity || "Medium"
        );

        setTrafficImportance(
            report.traffic_importance || "Medium"
        );

        setSelectedLocation({
            lat: Number(report.lat),
            lng: Number(report.lng),
        });

        setLocationAccuracy(null);

        removeImage();

        setError("");
        setSuccess("");

        formRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });
    }

    function cancelEditing() {
        resetForm();

        setError("");
        setSuccess("");
    }

    // ==========================================
    // CREATE OR UPDATE REPORT
    // ==========================================

    async function addReport(event) {
        event.preventDefault();

        setError("");
        setSuccess("");

        const isEditing =
            editingReportId !== null;

        if (!selectedLocation) {
            setError(
                "Please search, select or detect a road location first."
            );

            return;
        }

        if (description.trim().length < 3) {
            setError(
                "Description must contain at least 3 characters."
            );

            return;
        }

        setSaving(true);

        let reportSaved = false;

        try {
            const url = isEditing
                ? `${API_URL}/reports/${editingReportId}`
                : `${API_URL}/reports`;

            const payload = {
                description: description.trim(),
                severity,
                traffic_importance:
                    trafficImportance,
            };

            if (!isEditing) {
                payload.lat =
                    selectedLocation.lat;

                payload.lng =
                    selectedLocation.lng;
            }

            const response = await fetch(url, {
                method: isEditing
                    ? "PATCH"
                    : "POST",

                headers: {
                    "Content-Type":
                        "application/json",
                },

                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    typeof data.detail === "string"
                        ? data.detail
                        : "Failed to save road report."
                );
            }

            reportSaved = true;

            // Update local report list

            if (isEditing) {
                setReports((previous) =>
                    previous.map((report) =>
                        report.id === editingReportId
                            ? { ...report, ...data }
                            : report
                    )
                );
            } else {
                setReports((previous) => [
                    data,
                    ...previous,
                ]);
            }

            // Run AI analysis if photo selected

            if (roadImage) {
                try {
                    const analyzedReport =
                        await analyzeReportImage(
                            data.id,
                            roadImage
                        );

                    setReports((previous) =>
                        previous.map((report) =>
                            report.id === data.id
                                ? {
                                    ...report,
                                    ...analyzedReport,
                                }
                                : report
                        )
                    );

                    setSuccess(
                        `Report #${data.id} saved with AI analysis!`
                    );
                } catch (imageError) {
                    setError(
                        `Report #${data.id} was saved, but AI analysis failed: ${imageError.message}`
                    );
                }
            } else {
                setSuccess(
                    `Report #${data.id} saved successfully!`
                );
            }

            resetForm();
        } catch (err) {
            console.error(
                "Save report error:",
                err
            );

            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    // ==========================================
    // UPDATE REPAIR STATUS
    // ==========================================

    async function updateStatus(
        reportId,
        newStatus
    ) {
        setError("");
        setSuccess("");

        setUpdatingId(reportId);

        try {
            const response = await fetch(
                `${API_URL}/reports/${reportId}/status`,
                {
                    method: "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body: JSON.stringify({
                        status: newStatus,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    typeof data.detail === "string"
                        ? data.detail
                        : "Failed to update repair status."
                );
            }

            setReports((previous) =>
                previous.map((report) =>
                    report.id === reportId
                        ? { ...report, ...data }
                        : report
                )
            );

            setSuccess(
                `Report #${reportId} status updated to ${newStatus}.`
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setUpdatingId(null);
        }
    }

    // ==========================================
    // VIEW REPORT ON MAP
    // ==========================================

    function viewReportLocation(report) {
        setFocusLocation({
            lat: Number(report.lat),
            lng: Number(report.lng),
            reportId: report.id,
            requestId: Date.now(),
        });

        mapPanelRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });
    }

    const openReportPopup = useCallback(
        (reportId) => {
            markerRefs.current[
                reportId
            ]?.openPopup();
        },
        []
    );

    // ==========================================
    // REPORT STATISTICS
    // ==========================================

    const totalReports = reports.length;

    const openReports = reports.filter(
        (report) =>
            report.status === "Open"
    ).length;

    const inProgressReports =
        reports.filter(
            (report) =>
                report.status === "In Progress"
        ).length;

    const resolvedReports = reports.filter(
        (report) =>
            report.status === "Resolved"
    ).length;

    const activeReports = reports.filter(
        (report) =>
            report.status !== "Resolved"
    );

    const highPriority =
        activeReports.filter(
            (report) =>
                getReportPriority(report) === "High"
        ).length;

    const mediumPriority =
        activeReports.filter(
            (report) =>
                getReportPriority(report) === "Medium"
        ).length;

    const lowPriority =
        activeReports.filter(
            (report) =>
                getReportPriority(report) === "Low"
        ).length;

    const sortedReports = [...reports].sort(
        (a, b) => {
            const aResolved =
                a.status === "Resolved";

            const bResolved =
                b.status === "Resolved";

            if (aResolved !== bResolved) {
                return aResolved ? 1 : -1;
            }

            const scoreDifference =
                getReportScore(b) -
                getReportScore(a);

            if (scoreDifference !== 0) {
                return scoreDifference;
            }

            return Number(b.id) -
                Number(a.id);
        }
    );

    // ==========================================
    // FRONTEND UI
    // ==========================================

    return (
        <main className="city-page">

            {/* HERO SECTION */}

            <section className="city-hero">
                <span className="city-eyebrow">
                    <Navigation size={16} />
                    SMART CITY MONITORING
                </span>

                <h1>
                    Smart City <span>Road Map</span>
                </h1>

                <p>
                    Report damaged roads, track maintenance
                    progress, and help build safer cities.
                </p>
            </section>

            {/* STATISTICS */}

            <section className="city-stats">
                <div className="city-stat-card">
                    <MapPin size={24} />
                    <h3>{totalReports}</h3>
                    <p>Total Reports</p>
                </div>

                <div className="city-stat-card">
                    <AlertTriangle size={24} />
                    <h3>{openReports}</h3>
                    <p>Open Reports</p>
                </div>

                <div className="city-stat-card">
                    <Clock3 size={24} />
                    <h3>{inProgressReports}</h3>
                    <p>In Progress</p>
                </div>

                <div className="city-stat-card">
                    <CheckCircle2 size={24} />
                    <h3>{resolvedReports}</h3>
                    <p>Resolved</p>
                </div>
            </section>

            {/* PRIORITY DASHBOARD */}

            <section className="priority-dashboard">
                <div className="city-panel-heading">
                    <h2>
                        Road Damage Priority Dashboard
                    </h2>

                    <p>
                        Maintenance priority of unresolved
                        road damage reports.
                    </p>
                </div>

                <div className="priority-stats">

                    <div className="priority-stat-card priority-high">
                        <AlertTriangle size={26} />
                        <h3>{highPriority}</h3>
                        <p>High Priority</p>
                    </div>

                    <div className="priority-stat-card priority-medium">
                        <Clock3 size={26} />
                        <h3>{mediumPriority}</h3>
                        <p>Medium Priority</p>
                    </div>

                    <div className="priority-stat-card priority-low">
                        <CheckCircle2 size={26} />
                        <h3>{lowPriority}</h3>
                        <p>Low Priority</p>
                    </div>

                </div>
            </section>

            {/* MESSAGES */}

            {error && (
                <div className="city-message city-error">
                    {error}
                </div>
            )}

            {success && (
                <div className="city-message city-success">
                    {success}
                </div>
            )}

            {/* MAP AND REPORT FORM */}

            <section className="city-content">

                {/* MAP PANEL */}

                <div
                    className="city-map-panel"
                    ref={mapPanelRef}
                >
                    <div className="city-panel-heading">
                        <h2>Road Damage Map</h2>

                        <p>
                            Search a road, use live location,
                            or select a point on the map.
                        </p>
                    </div>

                    {/* LOCATION SEARCH */}

                    <div className="city-autocomplete-wrapper">

                        <form
                            className="city-location-search"
                            onSubmit={handleLocationSearch}
                        >
                            <div className="city-search-input-wrapper">

                                <Search
                                    size={18}
                                    className="city-search-icon"
                                />

                                <input
                                    type="text"
                                    placeholder="Search road, city, landmark..."
                                    value={searchLocation}
                                    onChange={(event) => {
                                        setSearchLocation(
                                            event.target.value
                                        );

                                        setSelectedSuggestion(null);
                                    }}
                                    onFocus={() => {
                                        if (
                                            locationSuggestions.length > 0
                                        ) {
                                            setShowSuggestions(true);
                                        }
                                    }}
                                    disabled={
                                        editingReportId !== null
                                    }
                                    autoComplete="off"
                                />

                                {searchLocation && (
                                    <button
                                        type="button"
                                        className="city-clear-search"
                                        onClick={clearLocationSearch}
                                    >
                                        <X size={18} />
                                    </button>
                                )}

                            </div>

                            <button
                                type="submit"
                                disabled={
                                    searchLoading ||
                                    editingReportId !== null
                                }
                            >
                                {searchLoading ? (
                                    <LoaderCircle size={18} />
                                ) : (
                                    <Search size={18} />
                                )}

                                Search
                            </button>
                        </form>

                        {showSuggestions &&
                            locationSuggestions.length > 0 && (
                                <div className="city-suggestions-dropdown">

                                    {locationSuggestions.map(
                                        (place) => (
                                            <button
                                                key={place.id}
                                                type="button"
                                                className="city-suggestion-item"
                                                onClick={() =>
                                                    selectLocationSuggestion(
                                                        place
                                                    )
                                                }
                                            >
                                                <MapPin size={18} />

                                                <span>
                                                    {place.name}
                                                </span>
                                            </button>
                                        )
                                    )}

                                </div>
                            )}

                        <small className="city-search-provider">
                            Location suggestions powered by
                            Photon / OpenStreetMap
                        </small>

                    </div>

                    <p className="city-search-hint">
                        Example: Gwalior Railway Station,
                        Shivpuri Bus Stand, Indore Railway Station
                    </p>

                    {/* LEAFLET MAP */}

                    <div
                        className="city-map-wrapper"
                        id="road-damage-map"
                    >
                        <MapContainer
                            center={defaultCenter}
                            zoom={12}
                            minZoom={3}
                            maxZoom={19}
                            scrollWheelZoom={true}
                            style={{
                                height: "450px",
                                width: "100%",
                                borderRadius: "14px",
                            }}
                        >

                            <TileLayer
                                attribution="&copy; OpenStreetMap contributors"
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />

                            <LocationPicker
                                onSelect={selectMapLocation}
                                disabled={
                                    editingReportId !== null
                                }
                            />

                            <MapController
                                focusLocation={focusLocation}
                                onFocusComplete={
                                    openReportPopup
                                }
                            />

                            {/* SELECTED LOCATION MARKER */}

                            {selectedLocation && (
                                <Marker
                                    position={[
                                        selectedLocation.lat,
                                        selectedLocation.lng,
                                    ]}
                                    draggable={
                                        editingReportId === null
                                    }
                                    eventHandlers={{
                                        dragend:
                                            handleMarkerDrag,
                                    }}
                                >
                                    <Popup>
                                        {editingReportId !== null
                                            ? "Existing report location"
                                            : "Drag this marker to the exact damaged road."}
                                    </Popup>
                                </Marker>
                            )}

                            {/* EXISTING REPORT MARKERS */}

                            {reports.map((report) => (
                                <Marker
                                    key={report.id}
                                    position={[
                                        Number(report.lat),
                                        Number(report.lng),
                                    ]}
                                    icon={getStatusIcon(
                                        report.status
                                    )}
                                    ref={(marker) => {
                                        if (marker) {
                                            markerRefs.current[
                                                report.id
                                            ] = marker;
                                        } else {
                                            delete markerRefs.current[
                                                report.id
                                            ];
                                        }
                                    }}
                                >
                                    <Popup>
                                        <strong>
                                            Report #{report.id}
                                        </strong>

                                        <p>
                                            {report.description}
                                        </p>

                                        {report.image_path && (
                                            <img
                                                src={getImageUrl(
                                                    report.image_path
                                                )}
                                                alt="Road damage"
                                                style={{
                                                    width: "180px",
                                                    maxHeight: "120px",
                                                    objectFit: "cover",
                                                    borderRadius: "8px",
                                                }}
                                            />
                                        )}

                                        <p>
                                            <strong>Status:</strong>{" "}
                                            {report.status}
                                        </p>

                                        <p>
                                            <strong>Severity:</strong>{" "}
                                            {report.severity || "Medium"}
                                        </p>

                                        <p>
                                            <strong>Traffic:</strong>{" "}
                                            {report.traffic_importance ||
                                                "Medium"}
                                        </p>

                                        <p>
                                            <strong>Priority:</strong>{" "}
                                            {getReportPriority(report)}
                                        </p>

                                        <p>
                                            <strong>Score:</strong>{" "}
                                            {getReportScore(report)}/100
                                        </p>

                                        {report.ai_prediction && (
                                            <>
                                                <p>
                                                    <strong>
                                                        AI Prediction:
                                                    </strong>{" "}
                                                    {report.ai_prediction}
                                                </p>

                                                <p>
                                                    <strong>
                                                        Confidence:
                                                    </strong>{" "}
                                                    {Number(
                                                        report.ai_confidence ?? 0
                                                    ).toFixed(2)}
                                                    %
                                                </p>
                                            </>
                                        )}

                                    </Popup>
                                </Marker>
                            ))}

                        </MapContainer>
                    </div>

                    <p className="city-search-hint">
                        Tip: Drag the blue marker to the
                        exact damaged road.
                    </p>

                </div>

                {/* ROAD REPORT FORM */}

                <div
                    className="city-report-panel"
                    ref={formRef}
                >
                    <div className="city-panel-heading">

                        <h2>
                            {editingReportId !== null
                                ? `Edit Report #${editingReportId}`
                                : "Submit Road Report"}
                        </h2>

                        <p>
                            {editingReportId !== null
                                ? "Update road damage details and optionally upload a new image."
                                : "Select road location, describe damage and upload a photo for AI analysis."}
                        </p>

                    </div>

                    <form
                        onSubmit={addReport}
                        className="city-report-form"
                    >

                        {/* LOCATION */}

                        <label>
                            Selected Location
                        </label>

                        <button
                            type="button"
                            className="city-live-location-btn"
                            onClick={() =>
                                getLiveLocation(true)
                            }
                            disabled={
                                locationLoading ||
                                editingReportId !== null
                            }
                        >
                            {locationLoading ? (
                                <LoaderCircle size={18} />
                            ) : (
                                <Navigation size={18} />
                            )}

                            {locationLoading
                                ? "Detecting Location..."
                                : "Use My Current Location"}
                        </button>

                        <div className="city-location-display">
                            <MapPin size={18} />

                            {selectedLocation
                                ? `${selectedLocation.lat.toFixed(5)}, ${selectedLocation.lng.toFixed(5)}`
                                : locationLoading
                                    ? "Detecting your location..."
                                    : "Search a location or click on the map"}
                        </div>

                        {locationAccuracy !== null &&
                            selectedLocation && (
                                <small className="city-location-accuracy">
                                    Estimated accuracy: Â±
                                    {Math.round(
                                        locationAccuracy
                                    )}{" "}
                                    meters
                                </small>
                            )}

                        {/* DESCRIPTION */}

                        <label htmlFor="damage-description">
                            Damage Description
                        </label>

                        <textarea
                            id="damage-description"
                            value={description}
                            onChange={(event) =>
                                setDescription(
                                    event.target.value
                                )
                            }
                            placeholder="Example: Large pothole near the main road..."
                            rows={5}
                            maxLength={1000}
                            minLength={3}
                            required
                        />

                        {/* SEVERITY AND TRAFFIC */}

                        <div className="city-priority-fields">

                            <div>
                                <label htmlFor="damage-severity">
                                    Damage Severity
                                </label>

                                <select
                                    id="damage-severity"
                                    value={severity}
                                    onChange={(event) =>
                                        setSeverity(
                                            event.target.value
                                        )
                                    }
                                >
                                    <option value="Low">
                                        Low Damage
                                    </option>

                                    <option value="Medium">
                                        Medium Damage
                                    </option>

                                    <option value="High">
                                        Severe Damage
                                    </option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="traffic-importance">
                                    Traffic Importance
                                </label>

                                <select
                                    id="traffic-importance"
                                    value={trafficImportance}
                                    onChange={(event) =>
                                        setTrafficImportance(
                                            event.target.value
                                        )
                                    }
                                >
                                    <option value="Low">
                                        Low Traffic
                                    </option>

                                    <option value="Medium">
                                        Medium Traffic
                                    </option>

                                    <option value="High">
                                        High Traffic
                                    </option>
                                </select>
                            </div>

                        </div>

                        {/* PRIORITY SCORE */}

                        <div className="live-priority-card">

                            <div className="live-priority-heading">
                                <span>
                                    Maintenance Priority Score
                                </span>

                                <strong>
                                    {livePriorityScore}/100
                                </strong>
                            </div>

                            <div className="live-priority-track">
                                <div
                                    className={`live-priority-fill priority-fill-${livePriorityLevel.toLowerCase()}`}
                                    style={{
                                        width: `${livePriorityScore}%`,
                                    }}
                                />
                            </div>

                            <span
                                className={`priority-badge priority-${livePriorityLevel.toLowerCase()}`}
                            >
                                {livePriorityLevel} Priority
                            </span>

                            <p className="live-priority-note">
                                Calculated using 60% damage
                                severity and 40% traffic importance.
                            </p>

                        </div>

                        {/* PHASE 18.3 IMAGE UPLOAD */}

                        <div className="road-image-upload">

                            <label htmlFor="road-image">
                                <ImageIcon
                                    size={18}
                                    style={{
                                        display: "inline-block",
                                        verticalAlign: "middle",
                                        marginRight: "8px",
                                    }}
                                />

                                Road Damage Photo (Optional)
                            </label>

                            <input
                                id="road-image"
                                ref={imageInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleImageChange}
                                disabled={saving}
                            />

                            <small>
                                JPG, PNG or WebP â€” Maximum 10 MB.
                                AI analysis runs automatically
                                after saving the report.
                            </small>

                            {imagePreview && (
                                <div
                                    style={{
                                        marginTop: "12px",
                                    }}
                                >
                                    <img
                                        src={imagePreview}
                                        alt="Selected road damage"
                                        style={{
                                            width: "100%",
                                            maxHeight: "240px",
                                            objectFit: "cover",
                                            borderRadius: "12px",
                                        }}
                                    />

                                    <p>
                                        {roadImage?.name}
                                    </p>

                                    <button
                                        type="button"
                                        onClick={removeImage}
                                        disabled={saving}
                                        style={{
                                            marginTop: "8px",
                                            padding: "9px 14px",
                                            borderRadius: "8px",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <X size={16} />
                                        Remove Photo
                                    </button>
                                </div>
                            )}

                        </div>

                        {/* SUBMIT BUTTON */}

                        <button
                            type="submit"
                            className="city-submit-btn"
                            disabled={saving}
                        >
                            {saving ? (
                                <>
                                    <LoaderCircle size={18} />
                                    Saving / Analyzing...
                                </>
                            ) : editingReportId !== null ? (
                                <>
                                    <CheckCircle2 size={18} />
                                    Update Report
                                </>
                            ) : (
                                <>
                                    <Upload size={18} />
                                    Submit Road Report
                                </>
                            )}
                        </button>

                        {editingReportId !== null && (
                            <button
                                type="button"
                                className="city-cancel-edit-btn"
                                onClick={cancelEditing}
                                disabled={saving}
                            >
                                <X size={17} />
                                Cancel Editing
                            </button>
                        )}

                    </form>
                </div>

            </section>

            {/* RECENT ROAD REPORTS */}

            <section className="city-reports-section">

                <div className="city-panel-heading">
                    <h2>
                        Recent Road Reports
                    </h2>

                    <p>
                        Unresolved reports are sorted
                        by priority score.
                    </p>
                </div>

                {loading ? (
                    <p>Loading reports...</p>
                ) : reports.length === 0 ? (
                    <p>
                        No road reports found.
                        Submit your first report!
                    </p>
                ) : (
                    <div className="city-reports-grid">

                        {sortedReports.map((report) => {
                            const reportScore =
                                getReportScore(report);

                            const reportPriority =
                                getReportPriority(report);

                            return (
                                <div
                                    className="city-report-item"
                                    key={report.id}
                                >

                                    {/* REPORT HEADER */}

                                    <div className="city-report-top">

                                        <strong>
                                            Report #{report.id}
                                        </strong>

                                        <span
                                            className={`city-status city-status-${report.status
                                                .toLowerCase()
                                                .replaceAll(" ", "-")}`}
                                        >
                                            {report.status}
                                        </span>

                                    </div>

                                    {/* ROAD IMAGE */}

                                    {report.image_path && (
                                        <div
                                            style={{
                                                marginBottom: "14px",
                                            }}
                                        >
                                            <img
                                                src={getImageUrl(
                                                    report.image_path
                                                )}
                                                alt={`Road Report ${report.id}`}
                                                loading="lazy"
                                                style={{
                                                    width: "100%",
                                                    maxHeight: "220px",
                                                    objectFit: "cover",
                                                    borderRadius: "12px",
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* AI PREDICTION */}

                                    {report.ai_prediction && (
                                        <div
                                            className="report-ai-result"
                                            style={{
                                                padding: "12px",
                                                marginBottom: "14px",
                                                background: "#f1f5f9",
                                                color: "#0f172a",
                                                borderRadius: "10px",
                                            }}
                                        >
                                            <strong>
                                                AI Prediction:{" "}
                                                {report.ai_prediction}
                                            </strong>

                                            <p
                                                style={{
                                                    margin: "6px 0 0",
                                                }}
                                            >
                                                Confidence:{" "}
                                                {Number(
                                                    report.ai_confidence ?? 0
                                                ).toFixed(2)}
                                                %
                                            </p>
                                        </div>
                                    )}

                                    {/* DESCRIPTION */}

                                    <p>
                                        {report.description}
                                    </p>

                                    {/* PRIORITY */}

                                    <div className="report-priority-row">

                                        <span
                                            className={`priority-badge priority-${reportPriority.toLowerCase()}`}
                                        >
                                            {reportPriority} Priority
                                        </span>

                                        <strong className="report-priority-score">
                                            {reportScore}/100
                                        </strong>

                                    </div>

                                    <div className="live-priority-track">
                                        <div
                                            className={`live-priority-fill priority-fill-${reportPriority.toLowerCase()}`}
                                            style={{
                                                width: `${Math.max(
                                                    0,
                                                    Math.min(
                                                        100,
                                                        reportScore
                                                    )
                                                )}%`,
                                            }}
                                        />
                                    </div>

                                    {/* SEVERITY AND TRAFFIC */}

                                    <div className="report-score-details">

                                        <span>
                                            Severity:{" "}
                                            <strong>
                                                {report.severity ||
                                                    "Medium"}
                                            </strong>
                                        </span>

                                        <span>
                                            Traffic:{" "}
                                            <strong>
                                                {report.traffic_importance ||
                                                    "Medium"}
                                            </strong>
                                        </span>

                                    </div>

                                    {/* COORDINATES */}

                                    <small>
                                        <MapPin size={14} />

                                        {Number(
                                            report.lat
                                        ).toFixed(5)}
                                        ,{" "}
                                        {Number(
                                            report.lng
                                        ).toFixed(5)}
                                    </small>

                                    {/* DATE */}

                                    <small>
                                        <Clock3 size={14} />

                                        {report.created_at
                                            ? new Date(
                                                report.created_at
                                            ).toLocaleString()
                                            : "Date unavailable"}
                                    </small>

                                    {/* REPAIR STATUS */}

                                    <div className="city-status-control">

                                        <label
                                            htmlFor={`status-${report.id}`}
                                        >
                                            Repair Status
                                        </label>

                                        <select
                                            id={`status-${report.id}`}
                                            value={report.status}
                                            disabled={
                                                updatingId === report.id
                                            }
                                            onChange={(event) =>
                                                updateStatus(
                                                    report.id,
                                                    event.target.value
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
                                        </select>

                                    </div>

                                    {/* EDIT BUTTON */}

                                    <button
                                        type="button"
                                        className="city-edit-report-btn"
                                        onClick={() =>
                                            startEditing(report)
                                        }
                                    >
                                        <Pencil size={17} />
                                        Edit Report
                                    </button>

                                    {/* VIEW ON MAP */}

                                    <button
                                        type="button"
                                        className="city-view-map-btn"
                                        onClick={() =>
                                            viewReportLocation(report)
                                        }
                                    >
                                        <Eye size={17} />
                                        View on Map
                                    </button>

                                </div>
                            );
                        })}

                    </div>
                )}

            </section>

        </main>
    );
}

export default SmartCityMap;
