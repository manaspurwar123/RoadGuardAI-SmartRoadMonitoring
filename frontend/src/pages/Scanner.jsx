import { useState, useEffect } from "react";
import {
    UploadCloud,
    ScanSearch,
    AlertTriangle,
    CheckCircle2,
    Activity,
    BarChart3,
    Image as ImageIcon,
    LoaderCircle,
    Clock3,
    ShieldCheck,
} from "lucide-react";

function Scanner() {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState("");
    const [result, setResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [dragging, setDragging] = useState(false);

    const totalScans = history.length;

    const potholesDetected = history.filter(
        (item) => item.prediction === "Pothole"
    ).length;

    const normalRoads = history.filter(
        (item) => item.prediction === "Normal Road"
    ).length;

    const detectionRate =
        totalScans > 0
            ? ((potholesDetected / totalScans) * 100).toFixed(1)
            : "0.0";

    useEffect(() => {
        return () => {
            if (preview) URL.revokeObjectURL(preview);
        };
    }, [preview]);

    function selectFile(selectedFile) {
        if (!selectedFile) return;

        if (!["image/jpeg", "image/png"].includes(selectedFile.type)) {
            setError("Only JPG and PNG images are allowed.");
            return;
        }

        setFile(selectedFile);
        setPreview(URL.createObjectURL(selectedFile));
        setResult(null);
        setError("");
    }

    function handleFileChange(e) {
        selectFile(e.target.files[0]);
        e.target.value = "";
    }

    async function handlePredict() {
        if (!file) {
            setError("Please select a road image first.");
            return;
        }

        setLoading(true);
        setError("");
        setResult(null);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch(
                "http://127.0.0.1:8000/predict",
                {
                    method: "POST",
                    body: formData,
                }
            );

            if (!response.ok) {
                throw new Error(
                    "Prediction failed. Please check your FastAPI backend."
                );
            }

            const data = await response.json();

            setResult(data);

            setHistory((prev) => [
                {
                    id: crypto.randomUUID(),
                    filename: data.filename,
                    prediction: data.prediction,
                    confidence: data.confidence,
                    time: new Date().toLocaleTimeString(),
                },
                ...prev,
            ]);
        } catch (err) {
            setError(err.message || "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }

    const isPothole = result?.prediction === "Pothole";

    const confidence = result
        ? Math.max(
            0,
            Math.min(100, Number(result.confidence) || 0)
        )
        : 0;

    return (
        <div className="rg-scanner">
            <main className="rg-container">
                <div className="rg-hero">
                    <span className="rg-eyebrow">
                        <Activity size={15} />
                        AI-POWERED ROAD MONITORING
                    </span>

                    <h1>
                        Road Damage <span>AI Scanner</span>
                    </h1>

                    <p>
                        Upload a road image and let RoadGuard AI identify
                        potential potholes using machine learning.
                    </p>
                </div>

                <div className="rg-stats">
                    <div className="rg-stat-card">
                        <div className="rg-stat-icon blue">
                            <ScanSearch size={22} />
                        </div>
                        <span>Total Scans</span>
                        <h2>{totalScans}</h2>
                        <small>Images analyzed</small>
                    </div>

                    <div className="rg-stat-card">
                        <div className="rg-stat-icon orange">
                            <AlertTriangle size={22} />
                        </div>
                        <span>Potholes Detected</span>
                        <h2>{potholesDetected}</h2>
                        <small>Pothole predictions</small>
                    </div>

                    <div className="rg-stat-card">
                        <div className="rg-stat-icon green">
                            <CheckCircle2 size={22} />
                        </div>
                        <span>Normal Roads</span>
                        <h2>{normalRoads}</h2>
                        <small>Normal predictions</small>
                    </div>

                    <div className="rg-stat-card">
                        <div className="rg-stat-icon purple">
                            <BarChart3 size={22} />
                        </div>
                        <span>Pothole Rate</span>
                        <h2>{detectionRate}%</h2>
                        <small>Percentage of scans</small>
                    </div>
                </div>

                <div className="rg-workspace">
                    <section className="rg-panel">
                        <div className="rg-panel-heading">
                            <div className="rg-panel-icon">
                                <UploadCloud size={22} />
                            </div>
                            <div>
                                <h2>Upload Road Image</h2>
                                <p>Select a JPG or PNG image to analyze.</p>
                            </div>
                        </div>

                        <div
                            className={`rg-dropzone ${dragging ? "dragging" : ""
                                }`}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setDragging(true);
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault();
                                setDragging(false);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                setDragging(false);
                                selectFile(e.dataTransfer.files[0]);
                            }}
                        >
                            {preview ? (
                                <div className="rg-preview">
                                    <img
                                        src={preview}
                                        alt="Selected road"
                                    />
                                    <div className="rg-preview-status">
                                        <CheckCircle2 size={17} />
                                        Image Ready for AI Analysis
                                    </div>
                                </div>
                            ) : (
                                <div className="rg-upload-placeholder">
                                    <div className="rg-upload-symbol">
                                        <ImageIcon size={35} />
                                    </div>
                                    <h3>Drop your road image here</h3>
                                    <p>or choose an image from your device</p>
                                </div>
                            )}

                            <label className="rg-file-button">
                                <UploadCloud size={17} />
                                {preview ? "Change Image" : "Choose Image"}
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png"
                                    onChange={handleFileChange}
                                    hidden
                                />
                            </label>

                            <span className="rg-file-hint">
                                JPG or PNG supported
                            </span>
                        </div>

                        {file && (
                            <div className="rg-selected-file">
                                <ImageIcon size={16} />
                                <span>{file.name}</span>
                            </div>
                        )}

                        <button
                            type="button"
                            className="rg-analyze-button"
                            onClick={handlePredict}
                            disabled={loading || !file}
                        >
                            {loading ? (
                                <>
                                    <LoaderCircle
                                        size={19}
                                        className="rg-spin"
                                    />
                                    Analyzing Road...
                                </>
                            ) : (
                                <>
                                    <ScanSearch size={19} />
                                    Detect Road Damage
                                </>
                            )}
                        </button>

                        {error && (
                            <div className="rg-error">
                                <AlertTriangle size={17} />
                                {error}
                            </div>
                        )}
                    </section>

                    <section className="rg-panel">
                        <div className="rg-panel-heading">
                            <div className="rg-panel-icon">
                                <Activity size={22} />
                            </div>
                            <div>
                                <h2>AI Analysis Result</h2>
                                <p>MobileNetV2 image classification</p>
                            </div>
                        </div>

                        {result ? (
                            <div className="rg-result">
                                <div className="rg-result-top">
                                    <span className="rg-result-complete">
                                        <CheckCircle2 size={15} />
                                        ANALYSIS COMPLETE
                                    </span>
                                    <span className="rg-model-tag">
                                        MobileNetV2
                                    </span>
                                </div>

                                {preview && (
                                    <div className="rg-result-image">
                                        <img
                                            src={preview}
                                            alt="Analyzed road"
                                        />
                                    </div>
                                )}

                                <div
                                    className={`rg-prediction ${isPothole ? "danger" : "safe"
                                        }`}
                                >
                                    <div className="rg-prediction-icon">
                                        {isPothole ? (
                                            <AlertTriangle size={26} />
                                        ) : (
                                            <ShieldCheck size={26} />
                                        )}
                                    </div>

                                    <div>
                                        <small>AI PREDICTION</small>
                                        <h2>{result.prediction}</h2>
                                        <p>
                                            {isPothole
                                                ? "Potential pothole damage detected."
                                                : "No pothole detected by the classifier."}
                                        </p>
                                    </div>
                                </div>

                                <div className="rg-confidence">
                                    <div className="rg-confidence-label">
                                        <span>Model Confidence</span>
                                        <strong>
                                            {confidence.toFixed(2)}%
                                        </strong>
                                    </div>

                                    <div className="rg-progress">
                                        <div
                                            className="rg-progress-fill"
                                            style={{
                                                width: `${confidence}%`,
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="rg-result-footer">
                                    <ImageIcon size={15} />
                                    <span>{result.filename}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="rg-empty-result">
                                <div className="rg-empty-icon">
                                    <ScanSearch size={45} />
                                </div>
                                <h3>
                                    {loading
                                        ? "Analyzing your image..."
                                        : "Ready to Analyze"}
                                </h3>
                                <p>
                                    {loading
                                        ? "RoadGuard AI is processing your road image."
                                        : "Upload a road image and run the scanner to view AI predictions."}
                                </p>
                            </div>
                        )}
                    </section>
                </div>

                <section className="rg-panel rg-history">
                    <div className="rg-history-heading">
                        <div className="rg-panel-heading">
                            <div className="rg-panel-icon">
                                <Clock3 size={22} />
                            </div>
                            <div>
                                <h2>Recent Predictions</h2>
                                <p>
                                    Session history — clears on page refresh
                                </p>
                            </div>
                        </div>

                        <span className="rg-history-count">
                            {history.length} Scans
                        </span>
                    </div>

                    {history.length === 0 ? (
                        <div className="rg-history-empty">
                            No predictions yet. Your scans will appear here.
                        </div>
                    ) : (
                        <div className="rg-table-wrapper">
                            <table className="rg-table">
                                <thead>
                                    <tr>
                                        <th>Image</th>
                                        <th>Prediction</th>
                                        <th>Confidence</th>
                                        <th>Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((item) => (
                                        <tr key={item.id}>
                                            <td>{item.filename}</td>
                                            <td>
                                                <span
                                                    className={`rg-table-badge ${item.prediction === "Pothole"
                                                            ? "danger"
                                                            : "safe"
                                                        }`}
                                                >
                                                    {item.prediction}
                                                </span>
                                            </td>
                                            <td>{item.confidence}%</td>
                                            <td>{item.time}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <div className="rg-disclaimer">
                    <ShieldCheck size={17} />
                    AI predictions are estimates. The current model
                    classifies images as Normal Road or Pothole.
                    It does not locate or measure road damage.
                </div>
            </main>
        </div>
    );
}

export default Scanner;
