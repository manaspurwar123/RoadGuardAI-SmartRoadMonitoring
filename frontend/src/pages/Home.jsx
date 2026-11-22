
import { Link } from "react-router-dom";
import {
    ArrowRight,
    ScanSearch,
    MapPinned,
    BarChart3,
    ShieldCheck,
} from "lucide-react";

function Home() {
    return (
        <main className="home-page">
            <section className="home-hero">
                <div className="hero-copy">
                    <span className="hero-tag">
                        <ShieldCheck size={16} />
                        AI-Powered Road Monitoring
                    </span>

                    <h1>
                        Smarter Roads.
                        <br />
                        <span>Safer Cities.</span>
                    </h1>

                    <p>
                        RoadGuard AI helps identify potential pothole damage
                        using artificial intelligence. Analyze road images
                        and take the first step toward smarter maintenance.
                    </p>

                    <div className="hero-actions">
                        <Link to="/scanner" className="primary-cta">
                            Start AI Scan <ArrowRight size={19} />
                        </Link>

                        <a href="#features" className="secondary-cta">
                            Explore Features
                        </a>
                    </div>

                    <div className="hero-note">
                        <span className="status-dot" />
                        AI image classification available
                    </div>
                </div>

                <div className="hero-visual">
                    <div className="visual-top">
                        <span>ROADGUARD INTELLIGENCE</span>
                        <ShieldCheck size={22} />
                    </div>

                    <div className="visual-center">
                        <div className="scan-symbol">
                            <ScanSearch size={70} strokeWidth={1.5} />
                        </div>
                        <h2>Intelligent Road Analysis</h2>
                        <p>Upload. Analyze. Understand.</p>
                    </div>

                    <div className="visual-bottom">
                        <span className="visual-chip">MobileNetV2</span>
                        <span className="visual-chip">AI Scanner</span>
                        <span className="visual-chip">FastAPI</span>
                    </div>
                </div>
            </section>

            <section className="features-section" id="features">
                <div className="section-heading">
                    <span>OUR PLATFORM</span>
                    <h2>Technology for Better Roads</h2>
                    <p>
                        A growing platform for AI-powered road monitoring
                        and smart infrastructure management.
                    </p>
                </div>

                <div className="features-grid">
                    <div className="feature-card">
                        <ScanSearch size={32} />
                        <h3>AI Road Scanner</h3>
                        <p>
                            Upload road images and classify them as normal
                            roads or potential pothole damage.
                        </p>
                        <Link to="/scanner">Try Scanner →</Link>
                    </div>

                    <div className="feature-card">
                        <MapPinned size={32} />
                        <h3>Smart City Mapping</h3>
                        <p>
                            Planned GPS-based reporting and geographic
                            visualization of road damage.
                        </p>
                        <span className="coming-soon">Coming Soon</span>
                    </div>

                    <div className="feature-card">
                        <BarChart3 size={32} />
                        <h3>Road Analytics</h3>
                        <p>
                            Track scan results and build insights for
                            better road maintenance decisions.
                        </p>
                        <span className="coming-soon">Expanding Soon</span>
                    </div>
                </div>
            </section>

            <section className="bottom-cta">
                <h2>Ready to Analyze Your Road?</h2>
                <p>Try our AI-powered road image scanner.</p>
                <Link to="/scanner" className="primary-cta">
                    Launch AI Scanner <ArrowRight size={19} />
                </Link>
            </section>

            <footer className="site-footer">
                <span>© 2026 RoadGuard AI</span>
                <span>Building smarter road infrastructure</span>
            </footer>
        </main>
    );
}

export default Home;
